import { faviconFor, hostnameOf } from "../lib/sources.js";

export default function SourceChip({ source, index, highlighted }) {
  if (!source?.url && !source?.title) return null;
  const host = source.sourceIcon ? source.sourceIcon : hostnameOf(source.url);
  const fav = source.sourceIcon
    ? faviconFor(`https://${source.sourceIcon}`)
    : faviconFor(source.url);
  const label = source.sourceLabel || hostnameOf(source.url);
  return (
    <a
      href={source.url || "#"}
      target="_blank"
      rel="noreferrer noopener"
      title={source.title || label}
      className={`group inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] transition-colors ${
        highlighted
          ? "border-accent-green/40 bg-accent-green/5"
          : "border-border bg-bg-tertiary hover:border-accent-blue/40"
      }`}
    >
      {fav && (
        <img
          src={fav}
          alt=""
          width="14"
          height="14"
          className="rounded-sm shrink-0 opacity-90"
          onError={(e) => (e.currentTarget.style.display = "none")}
        />
      )}
      {typeof index === "number" && (
        <span className="text-text-muted font-mono">[{index}]</span>
      )}
      <span className="font-medium text-text-secondary group-hover:text-text-primary truncate max-w-[200px]">
        {label}
      </span>
    </a>
  );
}
