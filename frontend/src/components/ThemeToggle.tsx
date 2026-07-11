import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem("minisap-theme");
    if (saved === "light") { setIsDark(false); document.body.classList.add("light"); }
  }, []);

  const toggle = () => {
    const next = !isDark;
    setIsDark(next);
    if (next) { document.body.classList.remove("light"); }
    else { document.body.classList.add("light"); }
    localStorage.setItem("minisap-theme", next ? "dark" : "light");
  };

  return (
    <button onClick={toggle} style={{
      width: "100%", display: "flex", alignItems: "center", gap: 10,
      padding: "8px 12px", borderRadius: 8, cursor: "pointer",
      background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)",
      fontFamily: "inherit", color: "var(--text-secondary)", fontSize: 13, fontWeight: 500,
      transition: "var(--transition)",
    }}>
      {isDark ? <Moon size={14} color="var(--accent)" /> : <Sun size={14} color="var(--accent)" />}
      <span style={{ flex: 1, textAlign: "left" }}>{isDark ? "Modo Oscuro" : "Modo Claro"}</span>
      <div style={{
        width: 36, height: 20, borderRadius: 10, position: "relative",
        background: "var(--toggle-track-bg)", transition: "background .4s ease",
      }}>
        <div style={{
          position: "absolute", top: 2, left: isDark ? 2 : 18, width: 16, height: 16,
          borderRadius: "50%", background: "var(--accent)",
          transition: "left .4s cubic-bezier(.4,0,.2,1)",
          boxShadow: "0 1px 6px var(--accent-glow)",
        }} />
      </div>
    </button>
  );
}
