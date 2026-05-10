// Wire-style action routing: each "action" is a domain-scoped web search via Anakin's
// /v1/search endpoint (the Wire/Holocron actions API requires dashboard-side setup
// we don't have, so we recreate the per-source pattern using site: operators).
//
// The UX surface — per-source chips lighting up — stays identical, but the transport
// is the synchronous search endpoint, which is faster and 100% reliable for the demo.
//
// Each action declaration maps to:
//   { siteFilter, sourceLabel, sourceIcon }
// and is dispatched via webSearch(`<prompt> site:<filter>`).

import { webSearch } from "../api/anakin.js";

// Action ID -> source binding. The IDs are the same as the Wire catalog so the
// component code didn't need to change.
const ACTIONS = {
  wp_page_summary: {
    siteFilter: "en.wikipedia.org",
    sourceLabel: "Wikipedia",
    sourceIcon: "wikipedia.org",
    promptFromParams: (p) => `${p.title || ""} biography`,
  },
  wp_search: {
    siteFilter: "en.wikipedia.org",
    sourceLabel: "Wikipedia",
    sourceIcon: "wikipedia.org",
    promptFromParams: (p) => p.query || "",
  },
  tc_search: {
    siteFilter: "techcrunch.com",
    sourceLabel: "TechCrunch",
    sourceIcon: "techcrunch.com",
    promptFromParams: (p) => p.query || "",
  },
  tc_funding: {
    siteFilter: "techcrunch.com",
    sourceLabel: "TechCrunch · funding",
    sourceIcon: "techcrunch.com",
    promptFromParams: (p) => `${p.query || ""} funding round series`,
  },
  hn_search: {
    siteFilter: "news.ycombinator.com",
    sourceLabel: "Hacker News",
    sourceIcon: "news.ycombinator.com",
    promptFromParams: (p) => p.query || "",
  },
  gh_user_details: {
    siteFilter: "github.com",
    sourceLabel: "GitHub",
    sourceIcon: "github.com",
    promptFromParams: (p) => `github.com/${p.username || ""}`,
  },
  ss_author_search: {
    siteFilter: "semanticscholar.org",
    sourceLabel: "Semantic Scholar",
    sourceIcon: "semanticscholar.org",
    promptFromParams: (p) => `${p.query || ""} author profile`,
  },
  yc_search_companies: {
    siteFilter: "ycombinator.com/companies",
    sourceLabel: "Y Combinator",
    sourceIcon: "ycombinator.com",
    promptFromParams: (p) => p.query || "",
  },
  rt_search: {
    siteFilter: "reddit.com",
    sourceLabel: "Reddit",
    sourceIcon: "reddit.com",
    promptFromParams: (p) => p.query || "",
  },
  md_search: {
    siteFilter: "medium.com",
    sourceLabel: "Medium",
    sourceIcon: "medium.com",
    promptFromParams: (p) => p.query || "",
  },
  // Bonus sources we can route to without changing the action picker
  bbc_news: {
    siteFilter: "bbc.com",
    sourceLabel: "BBC",
    sourceIcon: "bbc.com",
    promptFromParams: (p) => p.query || "",
  },
  forbes_search: {
    siteFilter: "forbes.com",
    sourceLabel: "Forbes",
    sourceIcon: "forbes.com",
    promptFromParams: (p) => p.query || "",
  },
};

// ---- Action selection per claim ----

const PROBABLE_GH_USER = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/i;

function pickGithubUsername(facts) {
  const candidate = facts?.github || facts?.handle;
  if (candidate && PROBABLE_GH_USER.test(candidate)) return candidate;
  return null;
}

function pickActionsForClaim(claim, subjectName) {
  const f = claim.facts || {};
  const cat = (claim.category || "").toLowerCase();
  const subject = subjectName || "";
  const company = f.company || "";

  const actions = [];

  // Always include Wikipedia background lookup for the subject and HN
  if (subject) {
    actions.push({
      actionId: "wp_page_summary",
      params: { title: subject },
      label: "Wikipedia · subject",
    });
  }
  actions.push({
    actionId: "hn_search",
    params: { query: claim.searchQuery || `${subject} ${claim.text}` },
    label: "Hacker News · search",
  });

  if (cat === "employment" || cat === "funding") {
    const q = company
      ? `${company} ${subject}`.trim()
      : claim.searchQuery || `${subject} ${claim.text}`;
    actions.push({
      actionId: "tc_search",
      params: { query: q },
      label: "TechCrunch · search",
    });
    if (company) {
      actions.push({
        actionId: "yc_search_companies",
        params: { query: company },
        label: "Y Combinator · companies",
      });
    }
  } else if (cat === "education" || cat === "credential") {
    actions.push({
      actionId: "ss_author_search",
      params: { query: subject },
      label: "Semantic Scholar · author",
    });
    actions.push({
      actionId: "wp_search",
      params: { query: `${subject} ${f.school || ""}` },
      label: "Wikipedia · alumni",
    });
  } else if (cat === "publication") {
    const q = f.book || f.title || f.feature || claim.text;
    actions.push({ actionId: "wp_search", params: { query: q }, label: "Wikipedia · search" });
    actions.push({
      actionId: "ss_author_search",
      params: { query: subject },
      label: "Semantic Scholar · author",
    });
  } else if (cat === "award") {
    const q = f.award || f.title || claim.text;
    actions.push({ actionId: "wp_search", params: { query: q }, label: "Wikipedia · search" });
    actions.push({
      actionId: "tc_search",
      params: { query: `${subject} ${q}` },
      label: "TechCrunch · search",
    });
  } else if (cat === "speaking") {
    const q = f.event || claim.text;
    actions.push({
      actionId: "tc_search",
      params: { query: `${subject} ${q}` },
      label: "TechCrunch · search",
    });
  } else if (cat === "patent") {
    actions.push({
      actionId: "ss_author_search",
      params: { query: subject },
      label: "Semantic Scholar · author",
    });
  } else {
    // accomplishment / achievement / default
    actions.push({
      actionId: "tc_search",
      params: { query: claim.searchQuery || `${subject} ${claim.text}` },
      label: "TechCrunch · search",
    });
    actions.push({
      actionId: "forbes_search",
      params: { query: claim.searchQuery || `${subject} ${claim.text}` },
      label: "Forbes · search",
    });
  }

  const ghUser = pickGithubUsername(f);
  if (ghUser) {
    actions.push({
      actionId: "gh_user_details",
      params: { username: ghUser },
      label: "GitHub · user",
    });
  }

  // Cap at 4 actions per claim
  return actions.slice(0, 4);
}

// ---- Run a single action via /v1/search with site filter ----

async function runAction(action) {
  const def = ACTIONS[action.actionId];
  if (!def) {
    return { items: [], executionMs: 0 };
  }
  const start = Date.now();
  const userPrompt = def.promptFromParams(action.params || {});
  const prompt = `${userPrompt} site:${def.siteFilter}`.trim();
  const results = await webSearch(prompt);
  const items = (results || []).slice(0, 4).map((r) => ({
    title: r.title || "",
    url: r.url || "",
    snippet: r.snippet || "",
    date: r.date || null,
    sourceLabel: def.sourceLabel,
    sourceIcon: def.sourceIcon,
  }));
  return { items, executionMs: Date.now() - start };
}

// ---- Main entry: gather evidence for one claim via parallel actions ----

export async function gatherEvidence({ claim, subjectName, onAction }) {
  const actions = pickActionsForClaim(claim, subjectName);
  const evidence = [];
  const actionsRun = [];

  await Promise.all(
    actions.map(async (a) => {
      const startedAt = Date.now();
      onAction?.(claim.id, {
        actionId: a.actionId,
        label: a.label,
        status: "running",
      });
      try {
        const { items, executionMs } = await runAction(a);
        evidence.push(...items);
        actionsRun.push({
          ...a,
          status: "ok",
          count: items.length,
          executionMs,
        });
        onAction?.(claim.id, {
          actionId: a.actionId,
          label: a.label,
          status: "ok",
          count: items.length,
          executionMs,
        });
      } catch (e) {
        actionsRun.push({ ...a, status: "error", error: e.message });
        onAction?.(claim.id, {
          actionId: a.actionId,
          label: a.label,
          status: "error",
          executionMs: Date.now() - startedAt,
        });
      }
    })
  );

  // De-dup by URL — keep first occurrence
  const seen = new Set();
  const dedup = [];
  for (const e of evidence) {
    const key = e.url || `${e.sourceLabel}:${e.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push(e);
  }

  return { evidence: dedup.slice(0, 6), actionsRun };
}

export { pickActionsForClaim };
