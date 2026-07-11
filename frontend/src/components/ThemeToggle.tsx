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
      position: "fixed", top: 16, right: 24, zIndex: 500,
      display: "flex", alignItems: "center", gap: 10,
      padding: "6px 16px 6px 10px", borderRadius: 40, cursor: "pointer",
      background: "var(--bg-card)", border: "1px solid var(--border)",
      backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
      boxShadow: "0 4px 20px rgba(0,0,0,0.15)", fontFamily: "inherit",
      color: "var(--text-secondary)", fontSize: 13, fontWeight: 600,
      transition: "var(--transition)", userSelect: "none",
    }}>
      {isDark ? <Moon size={14} color="var(--accent)" /> : <Sun size={14} color="var(--accent)" />}
      <div style={{
        width: 44, height: 24, borderRadius: 12, position: "relative",
        background: "var(--toggle-track-bg)", transition: "background .4s ease",
      }}>
        <div style={{
          position: "absolute", top: 2, left: isDark ? 2 : 22, width: 20, height: 20,
          borderRadius: "50%", background: "var(--accent)",
          transition: "left .4s cubic-bezier(.4,0,.2,1), background .4s ease",
          boxShadow: "0 2px 10px var(--accent-glow)",
        }} />
      </div>
      <span style={{ fontSize: 11.5, color: "var(--text-muted)", letterSpacing: ".3px", minWidth: 36 }}>
        {isDark ? "Dark" : "Light"}
      </span>
    </button>
  );
}
