import { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import BackgroundGlows from "./BackgroundGlows";
import { useMediaQuery } from "../lib/useMediaQuery";

export default function Layout() {
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [open, setOpen] = useState(false);
  const closeSidebar = () => setOpen(false);

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar mobile={isMobile} open={open} onClose={closeSidebar} />

      {/* Overlay oscuro cuando el drawer está abierto en móvil */}
      {isMobile && open && (
        <div
          onClick={closeSidebar}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 45, animation: "fadeIn .2s ease" }}
        />
      )}

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", marginLeft: isMobile ? 0 : 248, transition: "var(--transition)" }}>
        {/* Barra superior solo en móvil (acceso al menú) */}
        {isMobile && (
          <header style={{
            position: "sticky", top: 0, zIndex: 40, display: "flex", alignItems: "center", gap: 12,
            padding: "12px 16px", background: "var(--bg-sidebar)", borderBottom: "1px solid var(--border)",
            backdropFilter: "var(--sidebar-blur)", WebkitBackdropFilter: "var(--sidebar-blur)",
          }}>
            <button
              onClick={() => setOpen(true)} aria-label="Abrir menú"
              style={{ background: "none", border: "none", color: "var(--text-primary)", cursor: "pointer", fontSize: 20, padding: 4, display: "flex" }}
            >
              <i className="fas fa-bars" />
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg, var(--accent-grad-start), var(--accent-grad-end))", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13 }}>
                <i className="fas fa-boxes-stacked" />
              </div>
              <span style={{ fontFamily: "'Space Grotesk'", fontWeight: 700, fontSize: 16, color: "var(--text-primary)" }}>gsiker</span>
            </div>
          </header>
        )}

        <main className="app-main" style={{ flex: 1, padding: "28px 32px", position: "relative", background: "var(--bg-body)", overflow: "auto", minWidth: 0 }}>
          <BackgroundGlows />
          <div style={{ position: "relative", zIndex: 1 }}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
