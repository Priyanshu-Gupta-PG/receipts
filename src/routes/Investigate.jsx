import { useState, useEffect } from "react";
import { useStore } from "../store/useStore.js";
import { investigate, looksLikeUrl } from "../lib/investigate.js";
import ProgressTimeline from "../components/ProgressTimeline.jsx";
import ClaimRow from "../components/ClaimRow.jsx";
import VerdictBadge from "../components/VerdictBadge.jsx";
import { rollupVerdicts } from "../lib/sources.js";

const SAMPLES = [
  {
    label: "Sundar Pichai's Wikipedia bio",
    value: "https://en.wikipedia.org/wiki/Sundar_Pichai",
  },
  {
    label: "An obviously inflated resume",
    value: `Alex Marketing

CEO at OpenAI (2019-present)
Stanford MBA, Class of 2016
Harvard Computer Science PhD, 2014
Built ChatGPT from scratch, scaled it to 200M users
Raised $10B Series Z funding round at $500B valuation
Author of best-selling book "Sapiens" (2014)
TIME Person of the Year 2023
Featured speaker at Davos 2024
First person to land on Mars (2025)`,
  },
];

export default function Investigate() {
  const [input, setInput] = useState("");
  const status = useStore((s) => s.status);
  const subject = useStore((s) => s.subject);
  const claims = useStore((s) => s.claims);
  const summary = useStore((s) => s.summary);
  const timeline = useStore((s) => s.timeline);
  const error = useStore((s) => s.error);
  const inputUrl = useStore((s) => s.inputUrl);
  const reset = useStore((s) => s.reset);

  const isWorking =
    status === "reading" ||
    status === "extracting" ||
    status === "investigating" ||
    status === "synthesizing";
  const isDone = status === "done";
  const isError = status === "error";
  const isIdle = status === "idle";

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape" && isDone) {
        reset();
        setInput("");
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isDone, reset]);

  const onSubmit = (e) => {
    e?.preventDefault();
    if (!input.trim() || isWorking) return;
    investigate(input);
  };

  const onReset = () => {
    reset();
    setInput("");
  };

  const inputLooksUrl = looksLikeUrl(input);

  return (
    <div className="min-h-screen flex flex-col">
      <Header onReset={onReset} canReset={!isIdle} />

      <main className="flex-1 max-w-[920px] w-full mx-auto px-6 pb-20">
        {/* Hero */}
        {isIdle && <Hero input={input} setInput={setInput} onSubmit={onSubmit} samples={SAMPLES} inputLooksUrl={inputLooksUrl} />}

        {/* Working */}
        {(isWorking || isError) && (
          <section className="mt-10 fade-slide-up">
            <InputEcho inputUrl={inputUrl} />
            <div className="mt-6 rounded-xl border border-border bg-bg-secondary p-6">
              <div className="text-[11px] uppercase tracking-[0.14em] text-text-muted mb-4">
                Investigation
              </div>
              <ProgressTimeline timeline={timeline} />
              {isError && (
                <div
                  className="mt-5 p-3 rounded-md text-[13px] flex items-center justify-between gap-3"
                  style={{
                    background: "rgb(var(--accent-red-rgb) / 0.08)",
                    border: "1px solid rgb(var(--accent-red-rgb) / 0.3)",
                    color: "var(--accent-red)",
                  }}
                >
                  <span>{error}</span>
                  <button
                    onClick={onReset}
                    className="px-3 py-1 rounded-md border border-accent-red/30 hover:bg-accent-red/10 text-[12px]"
                  >
                    Start over
                  </button>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Done — Report */}
        {isDone && (
          <Report
            subject={subject}
            claims={claims}
            summary={summary}
            inputUrl={inputUrl}
            timeline={timeline}
            onReset={onReset}
          />
        )}
      </main>

      <Footer />
    </div>
  );
}

function Header({ onReset, canReset }) {
  return (
    <header className="border-b border-border bg-bg-primary/70 backdrop-blur sticky top-0 z-20">
      <div className="max-w-[920px] mx-auto px-6 h-14 flex items-center justify-between">
        <button
          onClick={onReset}
          className="flex items-center gap-2 group"
          disabled={!canReset}
        >
          <span
            className="w-7 h-7 rounded-md border-2 flex items-center justify-center font-mono text-[12px] font-bold"
            style={{
              borderColor: "var(--accent-red)",
              color: "var(--accent-red)",
            }}
          >
            R
          </span>
          <span className="font-semibold tracking-tight text-[15px]">Receipts</span>
          <span className="text-text-muted text-[11px] hidden sm:inline">
            · the bullshit detector for hiring
          </span>
        </button>
        <div className="flex items-center gap-3 text-[11px] text-text-muted">
          <span className="font-mono">v0.1</span>
          <a
            href="https://anakin.io"
            target="_blank"
            rel="noreferrer noopener"
            className="hover:text-text-primary"
          >
            powered by Anakin + Gemini
          </a>
        </div>
      </div>
    </header>
  );
}

function Hero({ input, setInput, onSubmit, samples, inputLooksUrl }) {
  return (
    <section className="pt-14 pb-6 hero-gradient -mx-6 px-6 rounded-md">
      <div className="text-center mb-8">
        <div className="text-[12px] tracking-[0.2em] uppercase text-text-muted mb-3">
          Verify any candidate
        </div>
        <h1 className="text-5xl sm:text-6xl tracking-tight mb-4 leading-[1.05]">
          Pull the <span className="font-serif text-accent-red">receipts</span>.
        </h1>
        <p className="text-text-secondary max-w-[560px] mx-auto text-[15px]">
          Paste a resume, bio, or URL. We extract every verifiable claim, then
          cross-check each one against{" "}
          <span className="text-text-primary font-medium">
            Wikipedia, TechCrunch, Hacker News, Semantic Scholar, GitHub
          </span>{" "}
          and more — via Anakin's Wire actions.
        </p>
      </div>

      <form onSubmit={onSubmit} className="max-w-[680px] mx-auto">
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste a resume, bio text, or any URL (Wikipedia, personal site, news article)…"
            rows={input.split("\n").length > 3 ? Math.min(input.split("\n").length + 1, 12) : 4}
            className="search-input w-full p-4 pr-32 rounded-xl border border-border bg-bg-secondary text-[14px] resize-y min-h-[120px] font-mono leading-relaxed"
          />
          <div className="absolute top-3 right-3 flex items-center gap-2">
            {inputLooksUrl && (
              <span
                className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md font-semibold"
                style={{
                  color: "var(--accent-blue)",
                  background: "rgb(var(--accent-blue-rgb) / 0.1)",
                }}
              >
                URL detected
              </span>
            )}
            {input && (
              <span className="text-[10px] font-mono text-text-muted">
                {input.length} chars
              </span>
            )}
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-text-muted">Try:</span>
            {samples.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => setInput(s.value)}
                className="text-[11px] text-text-secondary hover:text-text-primary border border-border bg-bg-secondary px-2.5 py-1 rounded-md"
              >
                {s.label}
              </button>
            ))}
          </div>
          <button
            type="submit"
            disabled={!input.trim()}
            className="px-5 h-11 rounded-md font-semibold text-[13px] bg-accent-red text-bg-primary hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            Pull the receipts →
          </button>
        </div>
      </form>
    </section>
  );
}

function InputEcho({ inputUrl }) {
  const isUrl = !!inputUrl;
  return (
    <div className="text-[12px] text-text-muted">
      {isUrl ? (
        <>
          Source:{" "}
          <a
            href={inputUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="font-mono text-accent-blue hover:underline"
          >
            {inputUrl}
          </a>
        </>
      ) : (
        <>Source: pasted text</>
      )}
    </div>
  );
}

function Report({ subject, claims, summary, inputUrl, timeline, onReset }) {
  const rollup = rollupVerdicts(claims);
  return (
    <section className="mt-10">
      {/* Subject + summary */}
      <div className="rounded-xl border border-border bg-bg-secondary p-7 fade-slide-up paper-edge">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="min-w-0">
            <div className="text-[10px] tracking-[0.16em] uppercase text-text-muted mb-1">
              Subject of investigation
            </div>
            <h2 className="text-2xl font-semibold leading-tight">
              {subject?.name || "Unknown subject"}
            </h2>
            {subject?.headline && (
              <div className="text-text-secondary text-[13px] mt-1">
                {subject.headline}
              </div>
            )}
          </div>
          <button
            onClick={onReset}
            className="px-3 py-1.5 text-[12px] rounded-md border border-border hover:bg-bg-tertiary text-text-secondary shrink-0"
          >
            New investigation
          </button>
        </div>

        {rollup && (
          <div className="flex items-center gap-4 mb-4 flex-wrap">
            <div className="text-[15px] font-semibold">{rollup.headline}</div>
            <div className="flex items-center gap-1.5">
              {Object.entries(rollup.counts).map(([label, n]) =>
                n > 0 ? (
                  <VerdictBadge key={label} label={label} size="sm" />
                ) : null
              )}
            </div>
            <div className="ml-auto text-[11px] text-text-muted font-mono">
              confidence score {Math.round(rollup.score * 100)}%
            </div>
          </div>
        )}

        {summary && (
          <p className="text-[14px] leading-relaxed text-text-primary">
            {summary}
          </p>
        )}

        {inputUrl && (
          <div className="mt-4 text-[11px] text-text-muted">
            Source:{" "}
            <a
              href={inputUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="font-mono text-accent-blue hover:underline"
            >
              {inputUrl}
            </a>
          </div>
        )}
      </div>

      {/* Claims */}
      <div className="mt-6 space-y-3">
        <div className="flex items-baseline justify-between mb-1">
          <h3 className="text-[12px] uppercase tracking-[0.14em] text-text-muted">
            Claim by claim
          </h3>
          <div className="text-[11px] text-text-muted">
            {claims.length} claims · cross-referenced via Anakin Wire
          </div>
        </div>
        {claims.map((c, i) => (
          <ClaimRow key={c.id} claim={c} index={i} />
        ))}
      </div>

      {/* Methodology footer */}
      <details className="mt-6 rounded-lg border border-border bg-bg-secondary px-4 py-3 text-[12px] text-text-secondary">
        <summary className="cursor-pointer hover:text-text-primary list-none flex items-center gap-2">
          <span className="font-mono">▸</span> Methodology — how we got here
        </summary>
        <div className="mt-3 pl-3">
          <ProgressTimeline timeline={timeline} />
        </div>
      </details>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border-muted py-5 mt-auto">
      <div className="max-w-[920px] mx-auto px-6 text-[11px] text-text-muted flex items-center justify-between">
        <span>Built for the Anakin Hackathon</span>
        <span>
          We only check public claims against public evidence. We never store
          inputs.
        </span>
      </div>
    </footer>
  );
}
