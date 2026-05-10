const ENDPOINT = import.meta.env.VITE_AI_ENDPOINT;
const API_KEY = import.meta.env.VITE_AI_API_KEY;

class AiError extends Error {
  constructor(message) {
    super(message);
    this.name = "AiError";
  }
}

async function geminiCall(prompt, { temperature = 0.4, maxOutputTokens = 2048, json = false } = {}) {
  if (!ENDPOINT || !API_KEY) {
    throw new AiError("AI endpoint or key not configured");
  }
  const url = `${ENDPOINT}?key=${encodeURIComponent(API_KEY)}`;
  const generationConfig = { temperature, maxOutputTokens };
  if (json) generationConfig.responseMimeType = "application/json";

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new AiError(`AI HTTP ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new AiError("Empty AI response");
  return text.trim();
}

function stripJsonFences(s) {
  return s
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
}

function extractJson(s) {
  const cleaned = stripJsonFences(s);
  try {
    return JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new AiError("Could not parse JSON from AI");
  }
}

/**
 * Pull the subject (name, headline) and a list of verifiable claims from a resume / bio / profile text.
 * Returns: { subject: {name, headline, currentRole}, claims: [{id, category, text, facts, verifiability}] }
 */
export async function extractSubjectAndClaims(sourceText) {
  const truncated = sourceText.slice(0, 8000);
  const prompt = `You are analyzing the resume / bio / profile text below.

TEXT:
"""
${truncated}
"""

Your job:
1. Identify the subject (the person this is about).
2. Extract the most VERIFIABLE claims they make.

Output ONLY a JSON object in this exact shape:
{
  "subject": {
    "name": "Full Name (best guess from the text)",
    "headline": "their tagline or current role in one short phrase",
    "currentRole": "Title at Company, if stated"
  },
  "claims": [
    {
      "id": "c1",
      "category": "employment" | "education" | "accomplishment" | "credential",
      "text": "the verbatim or near-verbatim claim, max 100 chars",
      "facts": { "company": "...", "role": "...", "dates": "...", "metric": "...", "school": "...", "feature": "..." },
      "searchQuery": "the best web search query to verify this claim — include the person's name and the specific verifiable fact"
    }
  ]
}

Rules:
- Pick 5–7 claims max. Prioritize:
  • Specific employment claims (company + title + dates)
  • Specific accomplishments ("built X", "led team of N", "raised $Y")
  • Educational credentials (school + degree + year)
  • Public achievements (talks, books, awards, patents)
- SKIP: vague skill lists, soft skills, generic claims like "passionate developer"
- For "searchQuery", craft something a search engine would return useful results for (e.g. "Jane Doe Stripe billing platform launch 2022", not "Jane Doe career")
- Keep each "facts" object to only fields actually in the source text — omit unknown fields
- "id" must be unique strings like c1, c2, c3...

If you can't identify a name, set subject.name to null. Output ONLY the JSON, no other text.`;

  const text = await geminiCall(prompt, { temperature: 0.2, maxOutputTokens: 2048, json: true });
  const parsed = extractJson(text);
  if (!parsed.subject) parsed.subject = { name: null, headline: "", currentRole: "" };
  if (!Array.isArray(parsed.claims)) parsed.claims = [];
  // Sanity bounds
  parsed.claims = parsed.claims.slice(0, 8).map((c, i) => ({
    id: c.id || `c${i + 1}`,
    category: c.category || "accomplishment",
    text: String(c.text || "").slice(0, 200),
    facts: c.facts || {},
    searchQuery: String(c.searchQuery || c.text || "").slice(0, 200),
  }));
  return parsed;
}

/**
 * Render verdicts for a batch of claims given their evidence (search snippets).
 * Input: claims with attached `evidence` array of { title, url, snippet, date? }
 * Returns same claims with verdict: { label, confidence, reasoning, citationIds }
 */
export async function renderVerdicts({ subject, claims }) {
  // Build a compact evidence table the model can actually digest.
  const blocks = claims.map((c) => {
    const ev = (c.evidence || [])
      .slice(0, 4)
      .map((e, i) => `  [${c.id}.s${i + 1}] ${e.title} — ${e.url}\n    ${(e.snippet || "").slice(0, 360)}`)
      .join("\n");
    return `### ${c.id}: ${c.text}
Category: ${c.category}
Evidence:
${ev || "  (no results)"}`;
  });

  const prompt = `You are a forensic fact-checker grading claims against web evidence.

SUBJECT: ${subject?.name || "Unknown"} ${subject?.headline ? `— ${subject.headline}` : ""}

For each claim, return a verdict using ONLY the listed evidence and your background knowledge.

CLAIMS AND EVIDENCE:
${blocks.join("\n\n")}

Respond with JSON ONLY in this exact shape:
{
  "verdicts": [
    {
      "id": "c1",
      "label": "verified" | "supported" | "contested" | "contradicted" | "unverifiable",
      "confidence": 0.0-1.0,
      "reasoning": "1-2 sentences citing the specific evidence. If contradicted, point to the conflicting fact.",
      "citationIds": ["c1.s1", "c1.s3"]
    }
  ]
}

Labels:
- "verified": evidence directly confirms the claim
- "supported": evidence aligns with claim, partial confirmation
- "contested": evidence contains conflicting or partial-conflicting info
- "contradicted": evidence directly contradicts the claim
- "unverifiable": no useful evidence found

Be terse. Cite specific snippet IDs in citationIds. Do not invent evidence not listed.`;

  const text = await geminiCall(prompt, { temperature: 0.2, maxOutputTokens: 2048, json: true });
  const parsed = extractJson(text);
  if (!Array.isArray(parsed.verdicts)) throw new AiError("Bad verdicts response");
  return parsed.verdicts;
}

/**
 * Generate the top-level summary based on the claim verdicts.
 * Returns { headline, body } strings.
 */
export async function summarizeReport({ subject, claims }) {
  const summary = claims
    .map(
      (c) =>
        `- [${c.verdict?.label || "?"}] ${c.text} — ${
          c.verdict?.reasoning?.slice(0, 200) || ""
        }`
    )
    .join("\n");
  const prompt = `Subject: ${subject?.name || "Unknown"}
Headline: ${subject?.headline || ""}

Claim verdicts:
${summary}

Write a 2-3 sentence executive summary for a hiring manager. Lead with the overall picture (mostly verified / mixed / red flags). If there are contradictions, name them concretely. Avoid hedging like "appears to" — be direct. Output the summary text only, no preamble.`;
  return geminiCall(prompt, { temperature: 0.4, maxOutputTokens: 256 });
}

export { AiError };
