import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

interface NavItem { to: string; label: string; icon: string; }
interface Section { label: string; icon: string; items: NavItem[]; }

const sections: Section[] = [
  { label: "Inventario", icon: "📦", items: [
    { to: "/inventario/bodegas", label: "Bodegas", icon: "🏭" },
    { to: "/inventario/stock", label: "Stock", icon: "📋" },
    { to: "/inventario/movimientos", label: "Movimientos", icon: "🔄" },
    { to: "/inventario/transferencias", label: "Transferencias", icon: "🔁" },
    { to: "/inventario/conteos", label: "Conteos", icon: "📝" },
    { to: "/inventario/kardex", label: "Kardex", icon: "📒" },
    { to: "/inventario/alertas", label: "Alertas", icon: "⚠️" },
    { to: "/inventario/reservas", label: "Reservas", icon: "🔒" },
    { to: "/inventario/lotes", label: "Lotes", icon: "🏷️" },
    { to: "/inventario/ubicaciones", label: "Ubicaciones", icon: "📍" },
    { to: "/inventario/reportes", label: "Reportes", icon: "📊" },
  ]},
  { label: "Compras", icon: "🛒", items: [
    { to: "/compras/proveedores", label: "Proveedores", icon: "🏢" },
    { to: "/compras/solicitudes", label: "Solicitudes", icon: "📝" },
    { to: "/compras/ordenes", label: "Órdenes de Compra", icon: "📄" },
    { to: "/compras/cotizaciones", label: "Cotizaciones", icon: "📊" },
  ]},
  { label: "Ventas", icon: "💰", items: [
    { to: "/ventas/clientes", label: "Clientes", icon: "👥" },
    { to: "/ventas/cotizaciones", label: "Cotizaciones", icon: "📊" },
    { to: "/ventas/pedidos", label: "Pedidos", icon: "📄" },
    { to: "/ventas/facturas", label: "Facturas", icon: "🧾" },
  ]},
  { label: "Administración", icon: "⚙️", items: [
    { to: "/admin/usuarios", label: "Usuarios", icon: "👥" },
  ]},
];

const singleItems: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: "📊" },
  { to: "/catalogo/skus", label: "Catálogo SKU", icon: "🏷️" },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isAdmin = user?.rol === "admin" || user?.rol === "superadmin";

  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const state: Record<string, boolean> = {};
    sections.forEach((s) => { state[s.label] = s.items.some((item) => location.pathname.startsWith(item.to)); });
    return state;
  });

  const toggleSection = (label: string) => setExpanded((prev) => ({ ...prev, [label]: !prev[label] }));
  const isItemActive = (to: string) => location.pathname.startsWith(to);

  return (
    <aside style={{ width: 248, background: "var(--sidebar)", color: "#CBD5E1", display: "flex", flexDirection: "column", flexShrink: 0 }}>
      <div style={{ padding: "20px 20px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: "var(--radius-sm)", background: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 15 }}>M</div>
          <div>
            <div style={{ color: "#F1F5F9", fontWeight: 700, fontSize: 16, letterSpacing: "-0.3px" }}>minisap</div>
            <div style={{ color: "#64748B", fontSize: 11, fontWeight: 500 }}>ERP v1.0</div>
          </div>
        </div>
      </div>

      <nav style={{ flex: 1, padding: "4px 12px", overflow: "auto" }}>
        {singleItems.map((item) => {
          const active = isItemActive(item.to);
          return (
            <NavLink key={item.to} to={item.to} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", marginBottom: 2,
              borderRadius: "var(--radius-sm)", color: active ? "#F1F5F9" : "#94A3B8",
              background: active ? "var(--sidebar-active)" : "transparent",
              textDecoration: "none", fontSize: 13, fontWeight: active ? 600 : 400,
              transition: "var(--transition)",
            }}>
              <span style={{ fontSize: 15, width: 22, textAlign: "center" }}>{item.icon}</span>
              {item.label}
            </NavLink>
          );
        })}

        <div style={{ margin: "8px 0", borderTop: "1px solid rgba(255,255,255,0.06)" }} />

        {sections.filter(s => s.label !== "Administración" || isAdmin).map((section) => {
          const isExpanded = expanded[section.label];
          const hasActiveChild = section.items.some((i) => isItemActive(i.to));

          return (
            <div key={section.label}>
              <button onClick={() => toggleSection(section.label)} style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
                color: hasActiveChild ? "#F1F5F9" : "#94A3B8", background: "transparent",
                border: "none", cursor: "pointer", fontSize: 13, fontWeight: hasActiveChild ? 600 : 400,
                textAlign: "left", fontFamily: "inherit", borderRadius: "var(--radius-sm)",
                transition: "var(--transition)", marginBottom: 2,
              }}>
                <span style={{ fontSize: 15, width: 22, textAlign: "center" }}>{section.icon}</span>
                <span style={{ flex: 1 }}>{section.label}</span>
                <span style={{ fontSize: 9, opacity: 0.5, transition: "transform 0.2s", transform: isExpanded ? "rotate(0deg)" : "rotate(-90deg)" }}>
                  ▼
                </span>
              </button>

              {isExpanded && (
                <div style={{ paddingLeft: 8, marginBottom: 4 }}>
                  {section.items.map((item) => {
                    const active = isItemActive(item.to);
                    return (
                      <NavLink key={item.to} to={item.to} style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "7px 12px 7px 24px",
                        borderRadius: "var(--radius-sm)", color: active ? "#F1F5F9" : "#94A3B8",
                        background: active ? "var(--sidebar-active)" : "transparent",
                        textDecoration: "none", fontSize: 13, fontWeight: active ? 600 : 400,
                        transition: "var(--transition)", marginBottom: 1,
                      }}>
                        <span style={{ fontSize: 13, width: 18, textAlign: "center" }}>{item.icon}</span>
                        {item.label}
                      </NavLink>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div style={{ padding: "12px 12px 16px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: "var(--radius-sm)", background: "var(--sidebar-hover)" }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 600 }}>
            {user?.nombre_completo?.[0]?.toUpperCase() || "U"}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#E2E8F0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.nombre_completo}</div>
            <div style={{ fontSize: 10, color: "#64748B", textTransform: "capitalize" }}>{user?.rol}</div>
          </div>
          <button onClick={() => { logout(); navigate("/login"); }} style={{ background: "none", border: "none", color: "#94A3B8", cursor: "pointer", fontSize: 16, padding: 4, borderRadius: 4, lineHeight: 1 }} title="Cerrar sesión">
            ⏻
          </button>
        </div>
      </div>
    </aside>
  );
}
