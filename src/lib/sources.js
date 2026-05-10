// Source/host helpers for the UI

export function hostnameOf(url) {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function faviconFor(url) {
  const host = hostnameOf(url);
  if (!host) return null;
  return `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
}

export function shortDomain(url) {
  const host = hostnameOf(url);
  if (!host) return "";
  return host.split(".").slice(-2).join(".");
}

export const VERDICT_META = {
  verified: {
    label: "Verified",
    color: "var(--accent-green)",
    icon: "✓",
    description: "Evidence directly confirms this claim.",
  },
  supported: {
    label: "Supported",
    color: "var(--accent-blue)",
    icon: "≈",
    description: "Evidence aligns with this claim.",
  },
  contested: {
    label: "Contested",
    color: "var(--accent-amber)",
    icon: "?",
    description: "Evidence contains conflicting details.",
  },
  contradicted: {
    label: "Contradicted",
    color: "var(--accent-red)",
    icon: "✗",
    description: "Evidence directly contradicts this claim.",
  },
  unverifiable: {
    label: "Unverifiable",
    color: "var(--text-muted)",
    icon: "—",
    description: "No useful evidence found on the public web.",
  },
};

export const CATEGORY_META = {
  employment: { label: "EMPLOYMENT", color: "var(--accent-blue)" },
  education: { label: "EDUCATION", color: "var(--accent-violet)" },
  accomplishment: { label: "ACCOMPLISHMENT", color: "var(--accent-amber)" },
  achievement: { label: "ACHIEVEMENT", color: "var(--accent-amber)" },
  credential: { label: "CREDENTIAL", color: "var(--accent-green)" },
  funding: { label: "FUNDING", color: "var(--accent-green)" },
  publication: { label: "PUBLICATION", color: "var(--accent-violet)" },
  award: { label: "AWARD", color: "var(--accent-amber)" },
  speaking: { label: "SPEAKING", color: "var(--accent-violet)" },
  patent: { label: "PATENT", color: "var(--accent-violet)" },
};

export function rollupVerdicts(claims) {
  const counts = { verified: 0, supported: 0, contested: 0, contradicted: 0, unverifiable: 0 };
  let total = 0;
  for (const c of claims) {
    const label = c?.verdict?.label;
    if (!label) continue;
    counts[label] = (counts[label] ?? 0) + 1;
    total += 1;
  }
  if (total === 0) return null;
  const flagged = counts.contested + counts.contradicted;
  let headline;
  if (counts.contradicted > 0) {
    headline = `🚩 ${counts.contradicted} contradicted claim${counts.contradicted === 1 ? "" : "s"}`;
  } else if (flagged > 0) {
    headline = `⚠️ ${flagged} contested claim${flagged === 1 ? "" : "s"}`;
  } else if (counts.verified + counts.supported === total) {
    headline = `✅ All claims verified`;
  } else {
    headline = `${counts.verified + counts.supported} of ${total} confirmed`;
  }
  const score = total === 0 ? 0 : (counts.verified * 1 + counts.supported * 0.7 + counts.contested * 0.3) / total;
  return { counts, total, headline, score };
}
