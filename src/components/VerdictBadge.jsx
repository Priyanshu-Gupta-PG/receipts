const META = {
  verified: { label: "Verified", varName: "accent-green", icon: "✓" },
  supported: { label: "Supported", varName: "accent-blue", icon: "≈" },
  contested: { label: "Contested", varName: "accent-amber", icon: "?" },
  contradicted: { label: "Contradicted", varName: "accent-red", icon: "✗" },
  unverifiable: { label: "Unverifiable", varName: "text-muted", icon: "—" },
};

export default function VerdictBadge({ label, size = "md" }) {
  const meta = META[label] || META.unverifiable;
  const sizing =
    size === "sm"
      ? "text-[10.5px] px-2 py-0.5 gap-1"
      : "text-[11px] px-2.5 py-1 gap-1.5";
  const rgb = `var(--${meta.varName}-rgb)`;
  return (
    <span
      className={`inline-flex items-center font-semibold rounded-md uppercase tracking-wider ${sizing}`}
      style={{
        color: `rgb(${rgb})`,
        background: `rgb(${rgb} / 0.10)`,
        border: `1px solid rgb(${rgb} / 0.30)`,
      }}
    >
      <span className="font-mono">{meta.icon}</span>
      {meta.label}
    </span>
  );
}
