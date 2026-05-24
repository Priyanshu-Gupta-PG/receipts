import { useEffect, useState } from "react";
import { subscribe, ANAKIN_BUDGET } from "../api/anakinUsage.js";

const KIND_COLOR = {
  scrape: "var(--accent-violet)",
  search: "var(--accent-blue)",
  wire: "var(--accent-green)",
};

function durText(ms) {
  if (ms == null) return "";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function CreditCounter() {
  const [usage, setUsage] = useState({
    totalCalls: 0,
    totalCredits: 0,
    runCalls: 0,
    runCredits: 0,
    recent: [],
    budget: ANAKIN_BUDGET,
  });
  const [expanded, setExpanded] = useState(false);

  useEffect(() => subscribe(setUsage), []);

  const remaining = Math.max(0, usage.budget - usage.totalCredits);
  const pct = Math.min(100, (usage.totalCredits / usage.budget) * 100);
  const dangerColor =
    remaining < 20
      ? "var(--accent-red)"
      : remaining < 100
      ? "var(--accent-amber)"
      : "var(--accent-green)";

  return (
    <div
      className="fixed top-3 right-4 z-50 rounded-lg border bg-bg-secondary/95 backdrop-blur shadow-xl"
      style={{
        borderColor: "var(--border-default)",
        width: expanded ? 320 : "auto",
      }}
    >
      <button
        onClick={() => setExpanded((x) => !x)}
        className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-bg-tertiary/40 rounded-lg transition-colors"
      >
        <div className="flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: dangerColor }}
          />
          <span className="text-[11px] uppercase tracking-wider font-semibold text-text-muted">
            Anakin
          </span>
        </div>
        <div className="flex items-baseline gap-1 font-mono text-[12px]">
          <span className="text-text-primary font-semibold">
            {usage.totalCredits}
          </span>
          <span className="text-text-muted">/ {usage.budget}</span>
        </div>
        {usage.runCredits > 0 && (
          <div className="text-[10px] font-mono text-accent-blue ml-auto">
            +{usage.runCredits} this run
          </div>
        )}
        <span className="text-text-muted text-[10px] ml-1">
          {expanded ? "▾" : "▸"}
        </span>
      </button>

      {/* Progress bar */}
      <div className="h-0.5 bg-bg-tertiary mx-3 mb-2 rounded overflow-hidden">
        <div
          className="h-full transition-all duration-300"
          style={{
            width: `${pct}%`,
            background: dangerColor,
          }}
        />
      </div>

      {expanded && (
        <div className="px-3 pb-3 space-y-2.5 border-t border-border-muted pt-3">
          <div className="grid grid-cols-3 gap-2 text-[11px]">
            <Stat label="this run" value={usage.runCredits} sub={`${usage.runCalls} calls`} />
            <Stat label="all time" value={usage.totalCredits} sub={`${usage.totalCalls} calls`} />
            <Stat label="left" value={remaining} sub="credits" highlight={dangerColor} />
          </div>

          {usage.recent.length > 0 && (
            <>
              <div className="text-[10px] uppercase tracking-wider text-text-muted mt-1">
                Live feed
              </div>
              <ul className="space-y-1 max-h-[260px] overflow-y-auto pr-1">
                {usage.recent.map((c, i) => (
                  <li
                    key={c.ts + "-" + i}
                    className="flex items-center gap-2 text-[11px] font-mono"
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: KIND_COLOR[c.kind] || "var(--text-muted)" }}
                    />
                    <span
                      className="truncate flex-1"
                      style={{
                        color:
                          c.status === "ok"
                            ? "var(--text-primary)"
                            : "var(--text-muted)",
                      }}
                    >
                      {c.label}
                    </span>
                    {c.durationMs != null && (
                      <span className="text-text-muted text-[10px] shrink-0">
                        {durText(c.durationMs)}
                      </span>
                    )}
                    <span
                      className="text-[10px] shrink-0"
                      style={{
                        color:
                          c.status === "ok"
                            ? "var(--accent-green)"
                            : "var(--accent-red)",
                      }}
                    >
                      {c.status === "ok" ? `+${c.credits}` : "✗"}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub, highlight }) {
  return (
    <div className="rounded-md bg-bg-tertiary border border-border-muted px-2 py-1.5">
      <div
        className="font-mono text-[15px] font-semibold leading-none"
        style={{ color: highlight || "var(--text-primary)" }}
      >
        {value}
      </div>
      <div className="text-[9px] uppercase tracking-wider text-text-muted mt-1">
        {label}
      </div>
      <div className="text-[9.5px] text-text-muted">{sub}</div>
    </div>
  );
}
