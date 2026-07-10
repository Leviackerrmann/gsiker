import { useEffect, useRef, useState } from "react";

interface Option {
  value: string;
  label: string;
  sublabel?: string;
}

interface Props {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  style?: React.CSSProperties;
}

export default function SearchableSelect({ options, value, onChange, placeholder = "Seleccionar...", required, disabled, style }: Props) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectedOption = options.find((o) => o.value === value);
  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase()) ||
    (o.sublabel || "").toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (val: string) => {
    onChange(val);
    setSearch("");
    setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: "relative", ...style }}>
      <div
        onClick={() => { if (!disabled) setOpen(!open); }}
        style={{
          display: "flex", alignItems: "center", padding: "8px 12px",
          border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 14,
          cursor: disabled ? "default" : "pointer", background: disabled ? "#f9fafb" : "#fff",
          minHeight: 38, boxSizing: "border-box",
        }}
      >
        <span style={{ flex: 1, color: selectedOption ? "#1a1d23" : "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <span style={{ color: "var(--text-muted)", fontSize: 10, marginLeft: 8 }}>{open ? "▲" : "▼"}</span>
      </div>

      {open && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
          background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0 0 6px 6px",
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)", maxHeight: 240, overflow: "auto", marginTop: -1,
        }}>
          <div style={{ padding: "6px 8px", borderBottom: "1px solid #f3f4f6" }}>
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar..."
              style={{
                width: "100%", padding: "6px 8px", border: "1px solid #e5e7eb", borderRadius: 4,
                fontSize: 13, boxSizing: "border-box",
              }}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          {filtered.map((o) => (
            <div
              key={o.value}
              onClick={() => handleSelect(o.value)}
              style={{
                padding: "8px 12px", cursor: "pointer", fontSize: 13,
                background: o.value === value ? "#eef2ff" : "transparent",
                color: o.value === value ? "#6366f1" : "#1a1d23",
                fontWeight: o.value === value ? 600 : 400,
                borderBottom: "1px solid #f9fafb",
              }}
              onMouseEnter={(e) => { (e.target as HTMLElement).style.background = o.value === value ? "#eef2ff" : "#f9fafb"; }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.background = o.value === value ? "#eef2ff" : "transparent"; }}
            >
              <div>{o.label}</div>
              {o.sublabel && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{o.sublabel}</div>}
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: 12, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
              Sin resultados
            </div>
          )}
        </div>
      )}
      {required && <input type="text" required value={value} onChange={() => {}} style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 0, height: 0 }} tabIndex={-1} />}
    </div>
  );
}
