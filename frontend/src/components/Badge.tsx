interface BadgeProps {
  color?: "success" | "warning" | "danger" | "info" | "neutral";
  category?: "MP" | "PT" | "INS" | "ACC" | "SER" | "REP" | "SRV" | string;
  children: React.ReactNode;
}

const colors: Record<string, { bg: string; color: string }> = {
  success: { bg: "var(--success-bg)", color: "var(--success-text)" },
  warning: { bg: "var(--warning-bg)", color: "var(--warning-text)" },
  danger:  { bg: "var(--danger-bg)",  color: "var(--danger-text)" },
  info:    { bg: "var(--info-bg)",    color: "var(--info)" },
  neutral: { bg: "#F1F5F9", color: "#475569" },
};

const catColors: Record<string, { bg: string; color: string }> = {
  MP:  { bg: "var(--cat-mp)",  color: "var(--cat-mp-t)" },
  PT:  { bg: "var(--cat-pt)",  color: "var(--cat-pt-t)" },
  INS: { bg: "var(--cat-ins)", color: "var(--cat-ins-t)" },
  ACC: { bg: "var(--cat-acc)", color: "var(--cat-acc-t)" },
  SER: { bg: "var(--cat-ser)", color: "var(--cat-ser-t)" },
  SRV: { bg: "var(--cat-ser)", color: "var(--cat-ser-t)" },
  REP: { bg: "var(--cat-otro)", color: "var(--cat-otro-t)" },
};

export default function Badge({ color = "neutral", category, children }: BadgeProps) {
  const c = category ? (catColors[category] || catColors["MP"]) : colors[color];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", padding: "3px 10px",
      borderRadius: 999, fontSize: 12, fontWeight: 600,
      background: c.bg, color: c.color, whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}
