interface BadgeProps {
  color?: "success" | "warning" | "danger" | "info" | "neutral";
  children: React.ReactNode;
}

const colors: Record<string, { bg: string; color: string }> = {
  success: { bg: "var(--success-bg)", color: "var(--success-text)" },
  warning: { bg: "var(--warning-bg)", color: "var(--warning-text)" },
  danger:  { bg: "var(--danger-bg)",  color: "var(--danger-text)" },
  info:    { bg: "var(--info-bg)",    color: "var(--info)" },
  neutral: { bg: "#F1F5F9", color: "#475569" },
};

export default function Badge({ color = "neutral", children }: BadgeProps) {
  const c = colors[color];
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
