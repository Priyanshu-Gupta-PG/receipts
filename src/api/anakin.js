import { recordCall } from "./anakinUsage.js";

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
 * Submit + poll a scrape. Costs 1 credit.
 */
export async function scrapeUrl(
  rawUrl,
  { timeoutMs = 35000, pollIntervalMs = 2000, onProgress, signal, label } = {}
) {
  const url = normalizeUrl(rawUrl);
  if (!url) throw new AnakinError("Invalid URL", "input");
  const start = Date.now();
  try {
    const jobId = await submitScrapeJob(url);
    while (Date.now() - start < timeoutMs) {
      if (signal?.aborted) throw new AnakinError("Aborted", "abort");
      await new Promise((r) => setTimeout(r, pollIntervalMs));
      const status = await getScrapeJob(jobId);
      onProgress?.({ status: status.status, elapsedMs: Date.now() - start });
      if (status.status === "completed") {
        const durationMs = status.durationMs ?? Date.now() - start;
        recordCall({
          kind: "scrape",
          label: label || `scrape ${new URL(url).hostname}`,
          credits: 1,
          durationMs,
          status: "ok",
        });
        return {
          url: status.url || url,
          markdown: status.markdown || "",
          html: status.cleanedHtml || status.html || "",
          durationMs,
        };
      }
      if (status.status === "failed" || status.status === "error") {
        recordCall({
          kind: "scrape",
          label: label || `scrape ${new URL(url).hostname}`,
          credits: 0,
          durationMs: Date.now() - start,
          status: "error",
        });
        throw new AnakinError(status.error || "Scrape failed", "remote");
      }
    }
    recordCall({
      kind: "scrape",
      label: label || `scrape ${new URL(url).hostname}`,
      credits: 0,
      durationMs: Date.now() - start,
      status: "timeout",
    });
    throw new AnakinError("Scrape timed out", "timeout");
  } catch (e) {
    if (!(e instanceof AnakinError)) {
      recordCall({ kind: "scrape", label: label || "scrape", credits: 0, durationMs: Date.now() - start, status: "error" });
    }
    throw e;
  }
}

/**
 * Synchronous web search via Anakin. Costs 1 credit.
 */
export async function webSearch(prompt, { label } = {}) {
  if (!API_KEY) throw new AnakinError("Missing VITE_ANAKIN_API_KEY", "config");
  const start = Date.now();
  const res = await fetch(`${BASE}/search`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) {
    recordCall({
      kind: "search",
      label: label || `search · ${prompt.slice(0, 30)}`,
      credits: 0,
      durationMs: Date.now() - start,
      status: "error",
    });
    const body = await res.text().catch(() => "");
    throw new AnakinError(`Search failed (${res.status}): ${body.slice(0, 160)}`, "search");
  }
  const json = await res.json();
  recordCall({
    kind: "search",
    label: label || `search · ${prompt.slice(0, 30)}`,
    credits: 1,
    durationMs: Date.now() - start,
    status: "ok",
  });
  return Array.isArray(json.results) ? json.results : [];
}

/**
 * Wire/Holocron task — submit + poll. Costs 1 credit (Anakin reports actual creditsUsed).
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
    throw new AnakinError(`Wire submit failed (${res.status}): ${body.slice(0, 200)}`, "wire_submit");
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
    throw new AnakinError(`Wire poll failed (${res.status}): ${body.slice(0, 200)}`, "wire_status");
  }
  return res.json();
}

export async function wireRun(actionId, params, { timeoutMs = 25000, pollIntervalMs = 1500, onProgress } = {}) {
  const start = Date.now();
  try {
    const jobId = await submitWireTask(actionId, params);
    while (Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, pollIntervalMs));
      const job = await getWireJob(jobId);
      onProgress?.(job.status, Date.now() - start);
      if (job.status === "completed" || job.status === "succeeded") {
        const credits = job.credits_used ?? 1;
        const durationMs = job.execution_ms ?? Date.now() - start;
        recordCall({ kind: "wire", label: `wire · ${actionId}`, credits, durationMs, status: "ok" });
        return { data: job.data ?? job.output ?? null, executionMs: durationMs, creditsUsed: credits };
      }
      if (job.status === "failed" || job.status === "error") {
        recordCall({ kind: "wire", label: `wire · ${actionId}`, credits: 0, durationMs: Date.now() - start, status: "error" });
        const msg = job.error?.message || "Wire job failed";
        throw new AnakinError(`${actionId}: ${msg}`, "wire_failed");
      }
    }
    recordCall({ kind: "wire", label: `wire · ${actionId}`, credits: 0, durationMs: Date.now() - start, status: "timeout" });
    throw new AnakinError(`${actionId}: Wire job timed out`, "wire_timeout");
  } catch (e) {
    if (!(e instanceof AnakinError)) {
      recordCall({ kind: "wire", label: `wire · ${actionId}`, credits: 0, durationMs: Date.now() - start, status: "error" });
    }
    throw e;
  }
}

export { AnakinError, normalizeUrl };
