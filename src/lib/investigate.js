import { useStore } from "../store/useStore.js";
import { scrapeUrl, webSearch, normalizeUrl, AnakinError } from "../api/anakin.js";
import { resetRun } from "../api/anakinUsage.js";
import { gatherEvidence } from "./wire.js";
import { discoverFootprint } from "./footprint.js";
import {
  extractSubjectAndClaims,
  renderVerdicts,
  summarizeReport,
} from "../api/ai.js";

const URL_RE = /^(https?:\/\/|[\w-]+\.[\w-]+(\.[\w-]+)*\/?)/i;

export function looksLikeUrl(input) {
  const trimmed = (input || "").trim();
  if (!trimmed) return false;
  if (trimmed.includes("\n")) return false;
  return URL_RE.test(trimmed) && trimmed.length < 500;
}

export function isLinkedInUrl(url) {
  return /(^|\.)linkedin\.com\/in\//i.test(url);
}

/**
 * Top-level orchestrator. Phases:
 *   1. Read source (URL scrape OR text)
 *   2. Extract claims + subject
 *   3. Parallel:
 *      a. Map online footprint (10 platform searches + up to 4 deep scrapes)
 *      b. Subject Wikipedia deep dive (1 search + 1 scrape)
 *      c. Per-claim evidence (4 searches × N claims, then auto-deep-scrape top hit per claim)
 *   4. Verdicts (Gemini)
 *   5. Summary (Gemini)
 */
export async function investigate(rawInput) {
  const input = (rawInput || "").trim();
  const store = useStore.getState();
  if (!input) return;

  resetRun();

  const isUrl = looksLikeUrl(input);
  const inputUrl = isUrl ? normalizeUrl(input) : null;

  store.beginInvestigation({
    inputKind: isUrl ? "url" : "text",
    inputUrl,
  });

  let sourceText = "";
  let scrapedSource = null;

  try {
    // ---------- Phase 1: Read source ----------
    if (isUrl && isLinkedInUrl(inputUrl)) {
      const slug = inputUrl.split("/in/")[1].replace(/[/?#].*/, "");
      const queryName = slug.replace(/-/g, " ");
      const results = await webSearch(`${queryName} linkedin profile`, {
        label: `linkedin-fallback`,
      });
      sourceText = results
        .slice(0, 5)
        .map((r) => `${r.title}\n${r.snippet}`)
        .join("\n\n");
      scrapedSource = {
        url: inputUrl,
        markdown: sourceText,
        durationMs: null,
        viaSearch: true,
      };
      useStore.getState().setReadComplete(scrapedSource, "LinkedIn auth-walled — pulled bio via web search");
    } else if (isUrl) {
      const scraped = await scrapeUrl(inputUrl, {
        timeoutMs: 35000,
        pollIntervalMs: 2000,
        label: "input source",
      });
      sourceText = scraped.markdown || "";
      scrapedSource = scraped;
      useStore
        .getState()
        .setReadComplete(scraped, `Scraped ${formatBytes(sourceText.length)} of markdown`);
    } else {
      sourceText = input;
      useStore.getState().setReadComplete(
        { url: null, markdown: sourceText, durationMs: 0 },
        `Read ${formatBytes(sourceText.length)} of pasted text`
      );
    }

    if (!sourceText || sourceText.length < 80) {
      throw new Error("Source has too little content to analyze. Try pasting a resume or use a different URL.");
    }

    // ---------- Phase 2: Extract claims ----------
    const { subject, claims } = await extractSubjectAndClaims(sourceText);
    if (!claims.length) {
      throw new Error("No verifiable claims found in this source.");
    }
    useStore.getState().setClaimsFound({ subject, claims });

    // ---------- Phase 3: Parallel investigation ----------
    await Promise.all([
      investigateClaims(claims, subject),
      mapFootprint(subject),
      subjectWikipediaDeepDive(subject),
    ]);

    // ---------- Phase 4: Verdicts ----------
    useStore.getState().setSynthesizing();
    const claimsForVerdict = useStore.getState().claims.map((c, i) => ({
      ...c,
      // Inject deep evidence + footprint excerpts into the verdict context
      evidence: [
        ...(c.evidence || []),
        ...(c.deepEvidence ? [c.deepEvidence] : []),
      ],
    }));
    const verdicts = await renderVerdicts({
      subject: useStore.getState().subject,
      claims: claimsForVerdict,
    });
    const verdictsById = Object.fromEntries(verdicts.map((v) => [v.id, v]));
    useStore.getState().setVerdicts(verdictsById);

    // ---------- Phase 5: Summary ----------
    const summary = await summarizeReport({
      subject: useStore.getState().subject,
      claims: useStore.getState().claims,
    });
    useStore.getState().setSummary(summary);
  } catch (err) {
    const msg =
      err instanceof AnakinError
        ? `Anakin: ${err.message}`
        : err.message || "Investigation failed";
    useStore.getState().setError(msg);
  }
}

// ---- Phase 3a: Online footprint ----
async function mapFootprint(subject) {
  if (!subject?.name) {
    useStore.getState().setFootprintDone();
    return;
  }
  try {
    await discoverFootprint({
      subjectName: subject.name,
      deep: true,
      onPlatform: (id, payload) => {
        useStore.getState().upsertFootprintPlatform(id, payload.platform || {});
      },
    });
    useStore.getState().setFootprintDone();
  } catch (e) {
    useStore.getState().setFootprintError(e.message || "Footprint discovery failed");
  }
}

// ---- Phase 3b: Subject Wikipedia deep dive ----
async function subjectWikipediaDeepDive(subject) {
  if (!subject?.name) return;
  try {
    const results = await webSearch(`${subject.name} site:en.wikipedia.org`, {
      label: "wikipedia · subject lookup",
    });
    const top = (results || []).find(
      (r) => /^https?:\/\/en\.wikipedia\.org\/wiki\//i.test(r.url || "")
    );
    if (!top?.url) return;
    const scraped = await scrapeUrl(top.url, {
      timeoutMs: 28000,
      pollIntervalMs: 2000,
      label: `wikipedia deep · ${subject.name.slice(0, 30)}`,
    });
    useStore.getState().setSubjectDeepDive({
      url: scraped.url,
      title: top.title,
      markdown: scraped.markdown.slice(0, 6000),
      durationMs: scraped.durationMs,
    });
  } catch {
    /* non-fatal */
  }
}

// ---- Phase 3c: Per-claim evidence + auto deep-scrape top hit ----
async function investigateClaims(claims, subject) {
  await Promise.all(
    claims.map(async (claim) => {
      useStore.getState().setClaimSearching(claim.id);
      try {
        const { evidence, actionsRun } = await gatherEvidence({
          claim,
          subjectName: subject?.name,
          onAction: (claimId, action) => {
            useStore.getState().setClaimWireAction(claimId, action);
          },
        });
        claim.evidence = evidence;
        useStore.getState().setClaimEvidence(claim.id, evidence, actionsRun);

        // Auto deep-scrape the top evidence URL for an exact-quote payload.
        // Skip if it's a known-hostile host (LinkedIn, Twitter/X) where Anakin
        // returns the auth wall.
        const topEvidence = evidence.find(
          (e) =>
            e.url &&
            !/linkedin\.com|twitter\.com|x\.com|youtube\.com\/watch/i.test(e.url)
        );
        if (topEvidence) {
          try {
            const scraped = await scrapeUrl(topEvidence.url, {
              timeoutMs: 25000,
              pollIntervalMs: 2000,
              label: `deep · ${topEvidence.sourceLabel || "source"}`,
            });
            const deepEvidence = {
              ...topEvidence,
              fullMarkdown: scraped.markdown.slice(0, 4000),
              durationMs: scraped.durationMs,
              isDeep: true,
            };
            useStore.getState().setClaimDeepEvidence(claim.id, deepEvidence);
          } catch {
            /* deep scrape is opportunistic; fall back to snippet evidence */
          }
        }
      } catch {
        useStore.getState().setClaimError(claim.id);
      }
    })
  );
}

function formatBytes(n) {
  if (n < 1024) return `${n} chars`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
