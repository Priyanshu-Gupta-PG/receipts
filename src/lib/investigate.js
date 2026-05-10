import { useStore } from "../store/useStore.js";
import { scrapeUrl, webSearch, normalizeUrl, AnakinError } from "../api/anakin.js";
import { gatherEvidence } from "./wire.js";
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
 * Top-level orchestrator: takes raw user input, pushes the investigation through
 * all phases, mutating the Zustand store as it goes.
 *
 * For URL inputs we Anakin-scrape the page first to get the source text.
 * For pasted text we skip straight to claim extraction.
 *
 * Special case: a LinkedIn /in/ URL almost always returns the auth wall instead
 * of profile content, so we DON'T scrape it directly. We extract the slug and
 * use a name-based web search as the source instead.
 */
export async function investigate(rawInput) {
  const input = (rawInput || "").trim();
  const store = useStore.getState();
  if (!input) return;

  const isUrl = looksLikeUrl(input);
  const inputUrl = isUrl ? normalizeUrl(input) : null;

  store.beginInvestigation({
    inputKind: isUrl ? "url" : "text",
    inputUrl,
  });

  let sourceText = "";
  let scrapedSource = null;

  try {
    if (isUrl && isLinkedInUrl(inputUrl)) {
      // LinkedIn workaround: pull bio from a name-based search
      const slug = inputUrl.split("/in/")[1].replace(/[/?#].*/, "");
      const queryName = slug.replace(/-/g, " ");
      const results = await webSearch(`${queryName} linkedin profile`);
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
      useStore.getState().setReadComplete(scrapedSource, `LinkedIn auth-walled — pulled bio via web search`);
    } else if (isUrl) {
      const scraped = await scrapeUrl(inputUrl, {
        timeoutMs: 35000,
        pollIntervalMs: 2000,
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
      throw new Error(
        "Source has too little content to analyze. Try pasting a resume or use a different URL."
      );
    }

    // Phase 2: extract claims
    const { subject, claims } = await extractSubjectAndClaims(sourceText);
    if (!claims.length) {
      throw new Error("No verifiable claims found in this source.");
    }
    useStore.getState().setClaimsFound({ subject, claims });

    // Phase 3: gather evidence per claim, in parallel — via Anakin Wire actions
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
          // Stash on local closure too so renderVerdicts can pick it up
          claim.evidence = evidence;
          useStore.getState().setClaimEvidence(claim.id, evidence, actionsRun);
        } catch (e) {
          claim.evidence = [];
          useStore.getState().setClaimError(claim.id);
        }
      })
    );

    // Phase 4: synthesize verdicts
    useStore.getState().setSynthesizing();
    const claimsWithEvidence = useStore.getState().claims.map((c, i) => ({
      ...c,
      evidence: claims[i]?.evidence || c.evidence || [],
    }));
    const verdicts = await renderVerdicts({
      subject: useStore.getState().subject,
      claims: claimsWithEvidence,
    });
    const verdictsById = Object.fromEntries(verdicts.map((v) => [v.id, v]));
    useStore.getState().setVerdicts(verdictsById);

    // Phase 5: top-level summary
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

function formatBytes(n) {
  if (n < 1024) return `${n} chars`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
