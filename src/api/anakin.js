const BASE = import.meta.env.VITE_ANAKIN_BASE || "https://api.anakin.io/v1";
const API_KEY = import.meta.env.VITE_ANAKIN_API_KEY;

class AnakinError extends Error {
  constructor(message, kind = "unknown") {
    super(message);
    this.name = "AnakinError";
    this.kind = kind;
  }
}

const headers = () => ({
  "X-API-Key": API_KEY,
  "Content-Type": "application/json",
});

function normalizeUrl(input) {
  if (!input) return null;
  const trimmed = String(input).trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

async function submitScrapeJob(url) {
  if (!API_KEY) throw new AnakinError("Missing VITE_ANAKIN_API_KEY", "config");
  const res = await fetch(`${BASE}/url-scraper`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new AnakinError(
      `Scrape submit failed (${res.status}): ${body.slice(0, 160)}`,
      "submit"
    );
  }
  const json = await res.json();
  if (!json.jobId) throw new AnakinError("No jobId returned", "submit");
  return json.jobId;
}

async function getScrapeJob(jobId) {
  const res = await fetch(`${BASE}/url-scraper/${encodeURIComponent(jobId)}`, {
    headers: headers(),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new AnakinError(
      `Scrape status failed (${res.status}): ${body.slice(0, 160)}`,
      "status"
    );
  }
  return res.json();
}

/**
 * Submit + poll a scrape. onProgress?({status, elapsedMs}) is called each poll.
 * Returns { url, markdown, html, durationMs } on completion.
 */
export async function scrapeUrl(
  rawUrl,
  { timeoutMs = 35000, pollIntervalMs = 2000, onProgress, signal } = {}
) {
  const url = normalizeUrl(rawUrl);
  if (!url) throw new AnakinError("Invalid URL", "input");

  const jobId = await submitScrapeJob(url);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (signal?.aborted) throw new AnakinError("Aborted", "abort");
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    const status = await getScrapeJob(jobId);
    onProgress?.({ status: status.status, elapsedMs: Date.now() - start });
    if (status.status === "completed") {
      return {
        url: status.url || url,
        markdown: status.markdown || "",
        html: status.cleanedHtml || status.html || "",
        durationMs: status.durationMs ?? Date.now() - start,
      };
    }
    if (status.status === "failed" || status.status === "error") {
      throw new AnakinError(status.error || "Scrape failed", "remote");
    }
  }
  throw new AnakinError("Scrape timed out", "timeout");
}

/**
 * Synchronous web search via Anakin. Returns up to ~5 results.
 * Each result: { title, url, snippet, date? }
 */
export async function webSearch(prompt) {
  if (!API_KEY) throw new AnakinError("Missing VITE_ANAKIN_API_KEY", "config");
  const res = await fetch(`${BASE}/search`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new AnakinError(
      `Search failed (${res.status}): ${body.slice(0, 160)}`,
      "search"
    );
  }
  const json = await res.json();
  return Array.isArray(json.results) ? json.results : [];
}

/**
 * Submit a Wire/Holocron action. Body shape: { action_id, params: {...} }
 * Returns the job id.
 */
async function submitWireTask(actionId, params) {
  if (!API_KEY) throw new AnakinError("Missing VITE_ANAKIN_API_KEY", "config");
  const res = await fetch(`${BASE}/holocron/task`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ action_id: actionId, params: params || {} }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new AnakinError(
      `Wire submit failed (${res.status}): ${body.slice(0, 200)}`,
      "wire_submit"
    );
  }
  const json = await res.json();
  if (json.error) throw new AnakinError(json.error.message || "Wire error", "wire_submit");
  const jobId = json.job_id || json.jobId;
  if (!jobId) throw new AnakinError("No job_id from Wire submit", "wire_submit");
  return jobId;
}

async function getWireJob(jobId) {
  const res = await fetch(`${BASE}/holocron/jobs/${encodeURIComponent(jobId)}`, {
    headers: headers(),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new AnakinError(
      `Wire poll failed (${res.status}): ${body.slice(0, 200)}`,
      "wire_status"
    );
  }
  return res.json();
}

/**
 * Run a Wire action end-to-end: submit + poll + return data.
 * Returns { data, executionMs, creditsUsed }
 */
export async function wireRun(actionId, params, { timeoutMs = 25000, pollIntervalMs = 1500, onProgress } = {}) {
  const jobId = await submitWireTask(actionId, params);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    const job = await getWireJob(jobId);
    onProgress?.(job.status, Date.now() - start);
    if (job.status === "completed" || job.status === "succeeded") {
      return {
        data: job.data ?? job.output ?? null,
        executionMs: job.execution_ms ?? Date.now() - start,
        creditsUsed: job.credits_used ?? 0,
      };
    }
    if (job.status === "failed" || job.status === "error") {
      const msg = job.error?.message || "Wire job failed";
      throw new AnakinError(`${actionId}: ${msg}`, "wire_failed");
    }
  }
  throw new AnakinError(`${actionId}: Wire job timed out`, "wire_timeout");
}

export { AnakinError, normalizeUrl };
