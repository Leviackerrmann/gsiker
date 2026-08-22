import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import ThemeToggle from "./ThemeToggle";

// `modulo` gatea la visibilidad por permisos (undefined = base, siempre visible).
// `adminOnly` = solo el admin/dueño de la empresa.
interface NavItem { to: string; label: string; icon: string; modulo?: string; }
interface Section { label: string; icon: string; items: NavItem[]; adminOnly?: boolean; }

const sections: Section[] = [
  { label: "Inventario", icon: "fa-boxes-stacked", items: [
    { to: "/inventario/bodegas", label: "Bodegas", icon: "fa-warehouse", modulo: "inventario" },
    { to: "/inventario/stock", label: "Stock", icon: "fa-clipboard-list", modulo: "inventario" },
    { to: "/inventario/movimientos", label: "Movimientos", icon: "fa-arrow-right-arrow-left", modulo: "inventario" },
    { to: "/inventario/transferencias", label: "Transferencias", icon: "fa-right-left", modulo: "inventario" },
    { to: "/inventario/conteos", label: "Conteos", icon: "fa-pen-to-square", modulo: "inventario" },
    { to: "/inventario/kardex", label: "Kardex", icon: "fa-book-open", modulo: "inventario" },
    { to: "/inventario/alertas", label: "Alertas", icon: "fa-triangle-exclamation", modulo: "inventario" },
    { to: "/inventario/reservas", label: "Reservas", icon: "fa-lock", modulo: "inventario" },
    { to: "/inventario/lotes", label: "Lotes", icon: "fa-tag", modulo: "inventario" },
    { to: "/inventario/ubicaciones", label: "Ubicaciones", icon: "fa-location-dot", modulo: "inventario" },
    { to: "/inventario/reportes", label: "Reportes", icon: "fa-chart-bar", modulo: "inventario" },
  ]},
  { label: "Compras", icon: "fa-cart-shopping", items: [
    { to: "/compras/proveedores", label: "Proveedores", icon: "fa-building", modulo: "compras" },
    { to: "/compras/solicitudes", label: "Solicitudes", icon: "fa-pen-to-square", modulo: "compras" },
    { to: "/compras/ordenes", label: "Órdenes de Compra", icon: "fa-file-invoice", modulo: "compras" },
    { to: "/compras/cotizaciones", label: "Cotizaciones", icon: "fa-chart-bar", modulo: "compras" },
  ]},
  { label: "Ventas", icon: "fa-receipt", items: [
    { to: "/ventas/clientes", label: "Clientes", icon: "fa-users", modulo: "ventas" },
    { to: "/ventas/cotizaciones", label: "Cotizaciones", icon: "fa-chart-bar", modulo: "ventas" },
    { to: "/ventas/pedidos", label: "Pedidos", icon: "fa-file-invoice", modulo: "ventas" },
    { to: "/ventas/facturas", label: "Facturas", icon: "fa-receipt", modulo: "ventas" },
    { to: "/ventas/cobranza", label: "Cobranza", icon: "fa-hand-holding-dollar", modulo: "cobranza" },
  ]},
  { label: "Administración", icon: "fa-gear", adminOnly: true, items: [
    { to: "/admin/usuarios", label: "Usuarios", icon: "fa-users" },
  ]},
];

const singleItems: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: "fa-chart-pie" },
  { to: "/asistente", label: "Asistente IA", icon: "fa-wand-magic-sparkles", modulo: "ia" },
  { to: "/pos", label: "Punto de Venta", icon: "fa-cash-register", modulo: "pos" },
  { to: "/catalogo/skus", label: "Catálogo SKU", icon: "fa-barcode", modulo: "inventario" },
];

const iconStyle: React.CSSProperties = { width: 18, textAlign: "center", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 };

export default function Sidebar({ mobile = false, open = false, onClose }: { mobile?: boolean; open?: boolean; onClose?: () => void }) {
  const { user, empresa, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isAdmin = user?.rol === "admin" || user?.rol === "superadmin";

  // Módulos que este usuario puede ver (capa 1 ∩ capa 2, calculado en el backend).
  // Un ítem sin `modulo` es base (siempre visible); con `modulo`, requiere permiso.
  const visibles = new Set(user?.modulos_visibles ?? []);
  const puedeVer = (modulo?: string) => !modulo || visibles.has(modulo);

  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const state: Record<string, boolean> = {};
    sections.forEach((s) => { state[s.label] = s.items.some((item) => location.pathname.startsWith(item.to)); });
    return state;
  });

  const toggleSection = (label: string) => setExpanded((prev) => ({ ...prev, [label]: !prev[label] }));
  const isItemActive = (to: string) => location.pathname.startsWith(to);

  // Filtra ítems por permiso y descarta secciones que queden vacías (o admin-only
  // para no-admin).
  const sectionDisplay = sections
    .filter((s) => !s.adminOnly || isAdmin)
    .map((s) => ({ ...s, items: s.items.filter((i) => puedeVer(i.modulo)) }))
    .filter((s) => s.items.length > 0);
  const singleDisplay = singleItems.filter((i) => puedeVer(i.modulo));

  return (
    <aside style={{
      width: 260, minHeight: "100vh", background: "var(--bg-sidebar)",
      borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column",
      position: "fixed", left: 0, top: 0, bottom: 0, zIndex: 50, overflow: "hidden",
      transform: mobile && !open ? "translateX(-100%)" : "translateX(0)",
      transition: "transform .3s ease",
      boxShadow: mobile && open ? "0 0 40px rgba(0,0,0,0.4)" : undefined,
      backdropFilter: "var(--sidebar-blur)", WebkitBackdropFilter: "var(--sidebar-blur)",
    }}>
      <div style={{ padding: "24px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12, transition: "border-color .5s ease" }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: "linear-gradient(135deg, var(--accent-grad-start), var(--accent-grad-end))", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", boxShadow: "0 4px 16px var(--accent-glow)", transition: "all .5s ease" }}>
          <i className="fas fa-boxes-stacked" style={{ fontSize: 17 }} />
        </div>
        <div>
          <div style={{ fontFamily: "'Space Grotesk'", fontWeight: 700, fontSize: 16, color: "var(--text-primary)", letterSpacing: "-0.3px", transition: "var(--transition)" }}>gsiker</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 400, transition: "var(--transition)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={empresa?.nombre}>{empresa?.nombre || "ERP v1.0"}</div>
        </div>
      </div>

      <nav style={{ flex: 1, padding: "16px 12px", display: "flex", flexDirection: "column", gap: 2, overflowY: "auto", scrollbarWidth: "none", msOverflowStyle: "none" }} className="sidebar-nav">
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "1.2px", color: "var(--text-muted)", padding: "8px 12px", transition: "var(--transition)" }}>
          Principal
        </div>
        {singleDisplay.map((item) => {
          const active = isItemActive(item.to);
          return (
            <NavLink key={item.to} to={item.to} onClick={() => { if (mobile) onClose?.(); }} style={{
              display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 8,
              color: active ? "var(--accent)" : "var(--text-secondary)", fontSize: 14, fontWeight: 500,
              background: active ? "var(--accent-soft)" : "transparent",
              cursor: "pointer", transition: "all .2s ease", position: "relative", textDecoration: "none",
            }}>
              {active && <div style={{ position: "absolute", left: -12, top: "50%", transform: "translateY(-50%)", width: 3, height: 24, borderRadius: "0 4px 4px 0", background: "var(--accent)" }} />}
              <span style={{ ...iconStyle, opacity: active ? 1 : 0.5 }}><i className={`fas ${item.icon}`} /></span>
              {item.label}
            </NavLink>
          );
        })}

        {sectionDisplay.map((section) => {
          const isExpanded = expanded[section.label];
          const hasActiveChild = section.items.some((i) => isItemActive(i.to));

          return (
            <div key={section.label}>
              {section.label !== singleItems[0]?.label && (
                <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "1.2px", color: "var(--text-muted)", padding: "16px 12px 8px", transition: "var(--transition)" }}>
                  {section.label}
                </div>
              )}
              <button onClick={() => toggleSection(section.label)} style={{
                width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 8,
                color: hasActiveChild ? "var(--accent)" : "var(--text-secondary)", fontSize: 14, fontWeight: 500,
                background: hasActiveChild ? "var(--accent-soft)" : "transparent", border: "none",
                cursor: "pointer", textAlign: "left", fontFamily: "inherit", transition: "all .2s ease", position: "relative",
              }}>
                {hasActiveChild && <div style={{ position: "absolute", left: -12, top: "50%", transform: "translateY(-50%)", width: 3, height: 24, borderRadius: "0 4px 4px 0", background: "var(--accent)" }} />}
                <span style={{ ...iconStyle, opacity: hasActiveChild ? 1 : 0.5 }}><i className={`fas ${section.icon}`} /></span>
                <span style={{ flex: 1 }}>{section.label}</span>
                <i className="fas fa-chevron-down" style={{ fontSize: 10, opacity: 0.4, transition: "transform 0.2s", transform: isExpanded ? "rotate(0deg)" : "rotate(-90deg)" }} />
              </button>
              {isExpanded && (
                <div style={{ paddingLeft: 8, marginBottom: 4 }}>
                  {section.items.map((item) => {
                    const active = isItemActive(item.to);
                    return (
                      <NavLink key={item.to} to={item.to} onClick={() => { if (mobile) onClose?.(); }} style={{
                        display: "flex", alignItems: "center", gap: 12, padding: "8px 14px 8px 24px",
                        borderRadius: 8, color: active ? "var(--accent)" : "var(--text-secondary)",
                        fontSize: 13, fontWeight: active ? 600 : 400,
                        background: active ? "var(--accent-soft)" : "transparent",
                        cursor: "pointer", transition: "all .2s ease", position: "relative", textDecoration: "none",
                      }}>
                        <span style={{ ...iconStyle, width: 16, opacity: active ? 1 : 0.4, fontSize: 12 }}>
                          <i className={`fas ${item.icon}`} />
                        </span>
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

      <div style={{ padding: "0 12px", marginBottom: 4 }}>
        <ThemeToggle />
      </div>

      <div style={{ padding: "16px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12, transition: "var(--transition)" }}>
        <button onClick={() => navigate("/cuenta")} title="Mi cuenta"
          style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 12, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: "linear-gradient(135deg, var(--avatar-grad-start), var(--avatar-grad-end))", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, color: "#fff", flexShrink: 0, transition: "all .5s ease" }}>
            {user?.nombre_completo?.[0]?.toUpperCase() || user?.username?.[0]?.toUpperCase() || "U"}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", transition: "var(--transition)" }}>
              {user?.nombre_completo || user?.username || "Mi cuenta"}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "capitalize", transition: "var(--transition)" }}>
              {user?.rol}
            </div>
          </div>
        </button>
        <button onClick={() => { logout(); navigate("/login"); }} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 4, display: "flex" }} title="Cerrar sesión">
          <i className="fas fa-right-from-bracket" style={{ fontSize: 14 }} />
        </button>
      </div>
    </aside>
  );
}
