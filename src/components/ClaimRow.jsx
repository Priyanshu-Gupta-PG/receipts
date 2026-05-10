import { useState } from "react";
import VerdictBadge from "./VerdictBadge.jsx";
import SourceChip from "./SourceChip.jsx";
import { CATEGORY_META } from "../lib/sources.js";

export default function ClaimRow({ claim, index }) {
  const [expanded, setExpanded] = useState(false);
  const cat = CATEGORY_META[claim.category] || CATEGORY_META.accomplishment;
  const verdictLabel = claim.verdict?.label;
  const evidence = claim.evidence || [];

  return (
    <div
      className="rounded-xl border border-border bg-bg-secondary p-5 fade-slide-up"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-x-6 gap-y-3 items-start">
        {/* LEFT: claim */}
        <div>
          <div
            className="text-[10px] font-semibold tracking-[0.12em] mb-1.5"
            style={{ color: cat.color }}
          >
            {cat.label}
          </div>
          <div className="text-[14px] text-text-primary leading-snug">
            "{claim.text}"
          </div>
          {claim.facts && Object.keys(claim.facts).length > 0 && (
            <div className="mt-2 text-[11px] text-text-muted font-mono">
              {Object.entries(claim.facts)
                .filter(([, v]) => v)
                .map(([k, v]) => `${k}: ${v}`)
                .join(" · ")}
            </div>
          )}
        </div>

        {/* MIDDLE: arrow */}
        <div className="text-text-muted text-xl select-none hidden md:block self-center">
          →
        </div>

        {/* RIGHT: verdict + reasoning + sources */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            {verdictLabel ? (
              <VerdictBadge label={verdictLabel} />
            ) : (
              <span className="text-[11px] text-text-muted">analyzing…</span>
            )}
            {claim.verdict?.confidence != null && (
              <span className="text-[10px] text-text-muted font-mono">
                conf {Math.round(claim.verdict.confidence * 100)}%
              </span>
            )}
          </div>
          {claim.verdict?.reasoning && (
            <div className="text-[13px] text-text-primary leading-snug mb-3">
              {claim.verdict.reasoning}
            </div>
          )}
          {evidence.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {evidence.slice(0, expanded ? 4 : 3).map((src, i) => (
                <SourceChip key={src.url + i} source={src} index={i + 1} />
              ))}
              {evidence.length > 3 && !expanded && (
                <button
                  onClick={() => setExpanded(true)}
                  className="text-[11px] text-text-muted hover:text-text-primary px-2 py-1"
                >
                  +{evidence.length - 3} more
                </button>
              )}
            </div>
          )}
          {claim.status === "evidence_error" && (
            <div className="text-[11px] text-accent-red">
              Evidence search failed.
            </div>
          )}

          {claim.wireActions && claim.wireActions.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {claim.wireActions.map((a) => {
                const ok = a.status === "ok";
                return (
                  <span
                    key={a.actionId}
                    className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border"
                    style={{
                      color: ok ? "var(--accent-green)" : "var(--text-muted)",
                      borderColor: ok
                        ? "rgb(var(--accent-green-rgb) / 0.3)"
                        : "var(--border-default)",
                      background: ok
                        ? "rgb(var(--accent-green-rgb) / 0.05)"
                        : "transparent",
                    }}
                    title={`Wire action ${a.actionId}${
                      a.executionMs ? ` (${(a.executionMs / 1000).toFixed(1)}s)` : ""
                    }`}
                  >
                    <span>{ok ? "▣" : "▢"}</span>
                    <span>{a.label}</span>
                    {a.count != null && a.count > 0 && (
                      <span className="text-text-muted">{a.count}</span>
                    )}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
