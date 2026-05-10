import { create } from "zustand";

// Investigation state machine:
//   idle -> reading -> extracting -> investigating -> synthesizing -> done | error
//
// Each phase pushes a step into the timeline so the UI can show what happened.

const initialState = {
  status: "idle",
  inputKind: null, // "url" | "text"
  inputUrl: null,
  scrapedSource: null, // { url, markdown, durationMs }
  subject: null,
  claims: [],
  summary: null,
  timeline: [], // { phase, label, status, detail?, durationMs?, ts }
  error: null,
  startedAt: null,
};

export const useStore = create((set, get) => ({
  ...initialState,

  // ---- public actions ----
  reset: () => set({ ...initialState, _bump: Math.random() }),

  beginInvestigation: ({ inputKind, inputUrl }) =>
    set({
      ...initialState,
      status: "reading",
      inputKind,
      inputUrl: inputUrl || null,
      startedAt: Date.now(),
      timeline: [
        { phase: "read", label: inputUrl ? "Reading source" : "Parsing input", status: "active", ts: Date.now() },
      ],
    }),

  setError: (message) =>
    set((s) => ({
      status: "error",
      error: message,
      timeline: markActiveAs(s.timeline, "error", { detail: message }),
    })),

  // Phase transitions
  setReadComplete: (scraped, label) =>
    set((s) => ({
      scrapedSource: scraped,
      status: "extracting",
      timeline: [
        ...markActiveAs(s.timeline, "done", {
          detail: label,
          durationMs: scraped?.durationMs,
        }),
        { phase: "extract", label: "Extracting verifiable claims", status: "active", ts: Date.now() },
      ],
    })),

  setClaimsFound: ({ subject, claims }) =>
    set((s) => ({
      subject,
      claims: claims.map((c) => ({
        ...c,
        evidence: [],
        evidenceLoading: false,
        verdict: null,
        status: "pending",
      })),
      status: "investigating",
      timeline: [
        ...markActiveAs(s.timeline, "done", {
          detail: `${claims.length} claim${claims.length === 1 ? "" : "s"} extracted`,
        }),
        {
          phase: "investigate",
          label: "Pulling receipts across the web",
          status: "active",
          ts: Date.now(),
          subItems: claims.map((c) => ({
            id: c.id,
            text: c.text,
            status: "pending",
          })),
        },
      ],
    })),

  setClaimSearching: (claimId) =>
    set((s) => ({
      claims: s.claims.map((c) =>
        c.id === claimId
          ? { ...c, evidenceLoading: true, status: "searching", wireActions: [] }
          : c
      ),
      timeline: updateSubItem(s.timeline, claimId, { status: "active" }),
    })),

  setClaimWireAction: (claimId, action) =>
    set((s) => ({
      claims: s.claims.map((c) => {
        if (c.id !== claimId) return c;
        const list = c.wireActions || [];
        const existingIdx = list.findIndex((a) => a.actionId === action.actionId);
        const next =
          existingIdx === -1
            ? [...list, action]
            : list.map((a, i) => (i === existingIdx ? { ...a, ...action } : a));
        return { ...c, wireActions: next };
      }),
      timeline: updateSubItem(s.timeline, claimId, {
        detail: detailFor(s.claims, claimId, action),
      }),
    })),

  setClaimEvidence: (claimId, evidence, actionsRun) =>
    set((s) => ({
      claims: s.claims.map((c) =>
        c.id === claimId
          ? {
              ...c,
              evidence,
              evidenceLoading: false,
              status: "evidence_ready",
              wireActions: actionsRun || c.wireActions || [],
            }
          : c
      ),
      timeline: updateSubItem(s.timeline, claimId, {
        status: "found",
        detail: `${(actionsRun || []).filter((a) => a.status === "ok").length}/${(actionsRun || []).length} actions · ${evidence.length} source${evidence.length === 1 ? "" : "s"}`,
      }),
    })),

  setClaimError: (claimId) =>
    set((s) => ({
      claims: s.claims.map((c) =>
        c.id === claimId
          ? { ...c, evidenceLoading: false, status: "evidence_error", evidence: [] }
          : c
      ),
      timeline: updateSubItem(s.timeline, claimId, { status: "error" }),
    })),

  setSynthesizing: () =>
    set((s) => ({
      status: "synthesizing",
      timeline: [
        ...markActiveAs(s.timeline, "done"),
        { phase: "synthesize", label: "Rendering verdicts", status: "active", ts: Date.now() },
      ],
    })),

  setVerdicts: (verdictsById) =>
    set((s) => ({
      claims: s.claims.map((c) => {
        const v = verdictsById[c.id];
        if (!v) return c;
        return {
          ...c,
          verdict: {
            label: v.label || "unverifiable",
            confidence: typeof v.confidence === "number" ? v.confidence : 0.5,
            reasoning: v.reasoning || "",
            citationIds: Array.isArray(v.citationIds) ? v.citationIds : [],
          },
          status: "graded",
        };
      }),
    })),

  setSummary: (summary) =>
    set((s) => ({
      summary,
      status: "done",
      timeline: markActiveAs(s.timeline, "done"),
    })),
}));

// ---- helpers ----
function markActiveAs(timeline, status, patch = {}) {
  return timeline.map((step) => {
    if (step.status !== "active") return step;
    const ts = Date.now();
    const durationMs = patch.durationMs ?? ts - step.ts;
    return { ...step, status, durationMs, ...patch };
  });
}

function updateSubItem(timeline, id, patch) {
  return timeline.map((step) => {
    if (!step.subItems) return step;
    return {
      ...step,
      subItems: step.subItems.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    };
  });
}

function detailFor(claims, claimId, action) {
  const c = claims.find((c) => c.id === claimId);
  const list = c?.wireActions || [];
  const ok = list.filter((a) => a.status === "ok").length + (action?.status === "ok" ? 1 : 0);
  const total = Math.max(list.length, 1);
  return `${ok}/${total} actions · ${action?.label || ""}`;
}
