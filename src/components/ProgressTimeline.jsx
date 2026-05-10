import { useStore } from "../store/useStore.js";

function statusDot(status) {
  if (status === "active")
    return (
      <span
        className="inline-block w-2 h-2 rounded-full pulse-dot"
        style={{ background: "var(--accent-blue)" }}
      />
    );
  if (status === "done")
    return (
      <span
        className="inline-block w-2 h-2 rounded-full"
        style={{ background: "var(--accent-green)" }}
      />
    );
  if (status === "error")
    return (
      <span
        className="inline-block w-2 h-2 rounded-full"
        style={{ background: "var(--accent-red)" }}
      />
    );
  if (status === "found")
    return (
      <span
        className="inline-block w-2 h-2 rounded-full"
        style={{ background: "var(--accent-violet)" }}
      />
    );
  return (
    <span
      className="inline-block w-2 h-2 rounded-full"
      style={{ background: "var(--text-muted)" }}
    />
  );
}

function wireDot(status) {
  if (status === "running")
    return (
      <span
        className="inline-block w-1.5 h-1.5 rounded-full pulse-dot"
        style={{ background: "var(--accent-blue)" }}
      />
    );
  if (status === "ok")
    return (
      <span
        className="inline-block w-1.5 h-1.5 rounded-full"
        style={{ background: "var(--accent-green)" }}
      />
    );
  if (status === "error")
    return (
      <span
        className="inline-block w-1.5 h-1.5 rounded-full"
        style={{ background: "var(--accent-red)" }}
      />
    );
  return (
    <span
      className="inline-block w-1.5 h-1.5 rounded-full"
      style={{ background: "var(--text-muted)" }}
    />
  );
}

function durationText(ms) {
  if (ms == null) return "";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function ProgressTimeline({ timeline }) {
  const claims = useStore((s) => s.claims);

  return (
    <ol className="relative pl-5 border-l border-border-muted space-y-4">
      {timeline.map((step, i) => (
        <li key={i} className="relative">
          <span className="absolute -left-[26px] top-1.5">{statusDot(step.status)}</span>
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-[13px] text-text-primary">
              {step.label}
              {step.detail && (
                <span className="text-text-muted ml-2 text-[12px]">
                  {step.detail}
                </span>
              )}
            </div>
            {step.durationMs != null && step.status === "done" && (
              <span className="text-[10px] font-mono text-text-muted shrink-0">
                {durationText(step.durationMs)}
              </span>
            )}
          </div>

          {step.subItems && step.subItems.length > 0 && (
            <ul className="mt-2 ml-1 space-y-2">
              {step.subItems.map((item) => {
                const claim = claims.find((c) => c.id === item.id);
                const wireActions = claim?.wireActions || [];
                return (
                  <li key={item.id} className="text-[12px] text-text-secondary">
                    <div className="flex items-center gap-2">
                      <span className="shrink-0">{statusDot(item.status)}</span>
                      <span className="truncate flex-1" title={item.text}>
                        {item.text}
                      </span>
                      {item.detail && (
                        <span className="text-text-muted text-[10.5px] font-mono shrink-0">
                          {item.detail}
                        </span>
                      )}
                    </div>
                    {wireActions.length > 0 && (
                      <ul className="mt-1.5 ml-4 space-y-0.5">
                        {wireActions.map((a) => (
                          <li
                            key={a.actionId}
                            className="flex items-center gap-1.5 text-[10.5px] font-mono"
                          >
                            <span className="shrink-0">{wireDot(a.status)}</span>
                            <span
                              className="text-text-muted"
                              style={{
                                color:
                                  a.status === "ok"
                                    ? "var(--accent-green)"
                                    : a.status === "error"
                                    ? "var(--text-muted)"
                                    : "var(--text-secondary)",
                              }}
                            >
                              {a.actionId}
                            </span>
                            {a.count != null && (
                              <span className="text-text-muted">{a.count} hits</span>
                            )}
                            {a.executionMs != null && a.status !== "running" && (
                              <span className="text-text-muted ml-auto">
                                {durationText(a.executionMs)}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}
