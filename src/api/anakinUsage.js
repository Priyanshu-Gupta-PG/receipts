// Tiny pub/sub credit tracker for Anakin API usage.
// Every call ticks the counter; UI subscribes and reflects live.
// Cumulative usage persists to localStorage so the demo shows true budget burn.

const STORAGE_KEY = "anakin_usage_v1";
const BUDGET = 500;

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { totalCalls: 0, totalCredits: 0 };
    const p = JSON.parse(raw);
    return {
      totalCalls: p.totalCalls || 0,
      totalCredits: p.totalCredits || 0,
    };
  } catch {
    return { totalCalls: 0, totalCredits: 0 };
  }
}

function persist(state) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        totalCalls: state.totalCalls,
        totalCredits: state.totalCredits,
      })
    );
  } catch {
    /* ignore */
  }
}

const initial = load();

const state = {
  // Cumulative across all sessions
  totalCalls: initial.totalCalls,
  totalCredits: initial.totalCredits,
  // Per-investigation, reset by resetRun()
  runCalls: 0,
  runCredits: 0,
  // Recent calls (ring buffer of last 12 for the live overlay feed)
  recent: [],
  budget: BUDGET,
};

const listeners = new Set();
function notify() {
  for (const l of listeners) l({ ...state, recent: [...state.recent] });
}

export function subscribe(listener) {
  listeners.add(listener);
  listener({ ...state, recent: [...state.recent] });
  return () => listeners.delete(listener);
}

export function getUsage() {
  return { ...state, recent: [...state.recent] };
}

export function resetRun() {
  state.runCalls = 0;
  state.runCredits = 0;
  state.recent = [];
  notify();
}

export function recordCall({ kind, label, credits = 1, durationMs = null, status = "ok" }) {
  state.totalCalls += 1;
  state.runCalls += 1;
  state.totalCredits += credits;
  state.runCredits += credits;
  state.recent.unshift({
    kind,
    label,
    credits,
    durationMs,
    status,
    ts: Date.now(),
  });
  if (state.recent.length > 16) state.recent.length = 16;
  persist(state);
  notify();
}

export const ANAKIN_BUDGET = BUDGET;
