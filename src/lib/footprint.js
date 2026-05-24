// Online Footprint Discovery — search 10 platforms in parallel for the subject,
// pick the most plausible profile per platform, then optionally url-scrape the top
// few via Anakin for richer data.
//
// Heavy on Anakin usage by design:
//   - 10 search calls (1 credit each)
//   - up to 4 url-scrape calls for the top platforms (1 credit each)
//
// = up to 14 Anakin credits per investigation, on top of claim verification.

import { webSearch, scrapeUrl } from "../api/anakin.js";

// Platform definitions: how to query, how to validate URLs as profiles, how to
// pull a handle out of a URL.
export const PLATFORMS = [
  {
    id: "github",
    name: "GitHub",
    icon: "github.com",
    site: "github.com",
    query: (n) => `"${n}" site:github.com`,
    matchProfile: (url) => /^https?:\/\/(www\.)?github\.com\/[a-z0-9_-]{1,39}\/?(\?.*)?$/i.test(url),
    extractHandle: (url) => url.match(/github\.com\/([^/?#]+)/i)?.[1] || null,
    scrapeWorthy: true,
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    icon: "linkedin.com",
    site: "linkedin.com",
    query: (n) => `"${n}" site:linkedin.com/in`,
    matchProfile: (url) => /^https?:\/\/([a-z]+\.)?linkedin\.com\/in\/[^/?#]+/i.test(url),
    extractHandle: (url) => url.match(/linkedin\.com\/in\/([^/?#]+)/i)?.[1] || null,
    scrapeWorthy: false, // auth-walls — but the snippet has good bio
  },
  {
    id: "twitter",
    name: "Twitter / X",
    icon: "x.com",
    site: "x.com OR twitter.com",
    query: (n) => `"${n}" (site:x.com OR site:twitter.com)`,
    matchProfile: (url) => /^https?:\/\/(www\.)?(x|twitter)\.com\/[a-zA-Z0-9_]{1,15}\/?(\?.*)?$/i.test(url),
    extractHandle: (url) => url.match(/(?:x|twitter)\.com\/([^/?#]+)/i)?.[1] || null,
    scrapeWorthy: false,
  },
  {
    id: "medium",
    name: "Medium",
    icon: "medium.com",
    site: "medium.com",
    query: (n) => `"${n}" site:medium.com`,
    matchProfile: (url) => /^https?:\/\/(www\.)?medium\.com\/@[^/?#]+/i.test(url) || /^https?:\/\/[^.]+\.medium\.com/i.test(url),
    extractHandle: (url) => url.match(/medium\.com\/(@[^/?#]+)/i)?.[1] || url.match(/^https?:\/\/([^.]+)\.medium\.com/i)?.[1] || null,
    scrapeWorthy: true,
  },
  {
    id: "substack",
    name: "Substack",
    icon: "substack.com",
    site: "substack.com",
    query: (n) => `"${n}" site:substack.com`,
    matchProfile: (url) => /^https?:\/\/[^/]+\.substack\.com\/?$/i.test(url) || /^https?:\/\/[^/]+\.substack\.com\/p\//i.test(url),
    extractHandle: (url) => url.match(/^https?:\/\/([^.]+)\.substack\.com/i)?.[1] || null,
    scrapeWorthy: true,
  },
  {
    id: "youtube",
    name: "YouTube",
    icon: "youtube.com",
    site: "youtube.com",
    query: (n) => `"${n}" site:youtube.com/@`,
    matchProfile: (url) => /youtube\.com\/(@[^/?#]+|c\/[^/?#]+|user\/[^/?#]+|channel\/[^/?#]+)/i.test(url),
    extractHandle: (url) => url.match(/youtube\.com\/(@[^/?#]+|c\/[^/?#]+|user\/[^/?#]+)/i)?.[1] || null,
    scrapeWorthy: false,
  },
  {
    id: "devto",
    name: "DEV Community",
    icon: "dev.to",
    site: "dev.to",
    query: (n) => `"${n}" site:dev.to`,
    matchProfile: (url) => /^https?:\/\/dev\.to\/[a-z0-9_]+\/?$/i.test(url),
    extractHandle: (url) => url.match(/dev\.to\/([^/?#]+)/i)?.[1] || null,
    scrapeWorthy: true,
  },
  {
    id: "stackoverflow",
    name: "StackOverflow",
    icon: "stackoverflow.com",
    site: "stackoverflow.com/users",
    query: (n) => `"${n}" site:stackoverflow.com/users`,
    matchProfile: (url) => /^https?:\/\/stackoverflow\.com\/users\/\d+/i.test(url),
    extractHandle: (url) => url.match(/users\/(\d+)\/([^/?#]+)/i)?.[2] || null,
    scrapeWorthy: false,
  },
  {
    id: "producthunt",
    name: "Product Hunt",
    icon: "producthunt.com",
    site: "producthunt.com",
    query: (n) => `"${n}" site:producthunt.com`,
    matchProfile: (url) => /producthunt\.com\/(@[^/?#]+|users\/)/i.test(url),
    extractHandle: (url) => url.match(/producthunt\.com\/@([^/?#]+)/i)?.[1] || null,
    scrapeWorthy: false,
  },
  {
    id: "personal",
    name: "Personal Site",
    icon: null, // resolved at runtime from URL host
    site: null,
    query: (n) => `"${n}" personal site OR portfolio OR blog -site:linkedin.com -site:twitter.com -site:x.com -site:facebook.com -site:instagram.com -site:youtube.com -site:github.com -site:medium.com -site:substack.com`,
    matchProfile: (url) => {
      try {
        const u = new URL(url);
        const host = u.hostname;
        if (/(linkedin|twitter|x|facebook|instagram|youtube|github|medium|substack|wikipedia|wikidata|reddit|stackoverflow|producthunt|dev\.to|news\.ycombinator)\.[a-z]+/i.test(host)) {
          return false;
        }
        return true;
      } catch {
        return false;
      }
    },
    extractHandle: (url) => {
      try {
        return new URL(url).hostname.replace(/^www\./, "");
      } catch {
        return null;
      }
    },
    scrapeWorthy: true,
  },
];

// Score a search result for a given platform. Higher = more likely to be the
// person we're looking for. Used to pick the top profile per platform.
function scoreResult(platform, result, subjectName) {
  if (!result?.url) return 0;
  if (!platform.matchProfile(result.url)) return 0;
  let score = 1;
  const lowerName = (subjectName || "").toLowerCase();
  const lowerTitle = (result.title || "").toLowerCase();
  const lowerSnippet = (result.snippet || "").toLowerCase();
  if (lowerTitle.includes(lowerName)) score += 3;
  if (lowerSnippet.includes(lowerName)) score += 2;
  // Prefer profile root over deeper paths (like a single article)
  try {
    const u = new URL(result.url);
    const segs = u.pathname.split("/").filter(Boolean);
    if (segs.length <= 2) score += 1;
  } catch {
    /* ignore */
  }
  return score;
}

/**
 * Discover the subject's online footprint. Two phases:
 *
 *   1. Fan out N parallel Anakin searches (one per platform).
 *   2. For platforms marked `scrapeWorthy` AND with a confident hit,
 *      Anakin-scrape the profile URL for richer data.
 *
 * onPlatform(platformId, status, payload?) is called as each platform progresses.
 */
export async function discoverFootprint({ subjectName, onPlatform, deep = true }) {
  if (!subjectName || subjectName.length < 2) return [];

  // Mark every platform as queued upfront so the UI can render placeholders
  PLATFORMS.forEach((p) =>
    onPlatform?.(p.id, { status: "searching", platform: p })
  );

  // Phase 1: parallel search
  const platforms = await Promise.all(
    PLATFORMS.map(async (p) => {
      const start = Date.now();
      try {
        const results = await webSearch(p.query(subjectName), {
          label: `footprint · ${p.id}`,
        });
        const ranked = (results || [])
          .map((r) => ({ ...r, _score: scoreResult(p, r, subjectName) }))
          .filter((r) => r._score > 0)
          .sort((a, b) => b._score - a._score);
        const top = ranked[0] || null;
        const platform = {
          ...p,
          status: top ? "found" : "not_found",
          url: top?.url || null,
          title: top?.title || null,
          snippet: top?.snippet || null,
          handle: top ? p.extractHandle(top.url) : null,
          icon: p.icon || (top ? hostnameOf(top.url) : null),
          searchMs: Date.now() - start,
          deepData: null,
          deepError: null,
        };
        onPlatform?.(p.id, { status: platform.status, platform });
        return platform;
      } catch (e) {
        const platform = {
          ...p,
          status: "error",
          url: null,
          title: null,
          snippet: null,
          handle: null,
          searchMs: Date.now() - start,
          deepData: null,
          deepError: e.message,
        };
        onPlatform?.(p.id, { status: "error", platform });
        return platform;
      }
    })
  );

  // Phase 2: deep-scrape the most valuable found profiles via Anakin url-scraper.
  // Cap at 4 deep scrapes to control budget while still being demo-loud.
  if (!deep) return platforms;
  const deepCandidates = platforms
    .filter((p) => p.status === "found" && p.scrapeWorthy && p.url)
    .slice(0, 4);

  await Promise.all(
    deepCandidates.map(async (p) => {
      onPlatform?.(p.id, { status: "deep_scraping", platform: p });
      try {
        const scraped = await scrapeUrl(p.url, {
          timeoutMs: 28000,
          pollIntervalMs: 2000,
          label: `footprint deep · ${p.id}`,
        });
        p.deepData = {
          markdown: scraped.markdown.slice(0, 4000),
          durationMs: scraped.durationMs,
        };
        p.status = "deep_done";
        onPlatform?.(p.id, { status: "deep_done", platform: p });
      } catch (e) {
        p.deepError = e.message;
        p.status = "deep_error";
        onPlatform?.(p.id, { status: "deep_error", platform: p });
      }
    })
  );

  return platforms;
}

function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
