import { useState } from "react";
import ThemeToggle from "./ThemeToggle";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  LayoutDashboard, Package, Warehouse, ClipboardList, ArrowRightLeft,
  PenLine, BookOpen, AlertTriangle, Lock, Tag, MapPin, BarChart3,
  ShoppingCart, Building2, FileText, Receipt, Users, Settings, LogOut,
  ChevronDown, Boxes,
} from "lucide-react";

interface NavItem { to: string; label: string; icon: React.ReactNode; }
interface Section { label: string; icon: React.ReactNode; items: NavItem[]; }

const iconSize = 16;
const iconProps = { size: iconSize, strokeWidth: 1.6 };

const sections: Section[] = [
  { label: "Inventario", icon: <Package {...iconProps} />, items: [
    { to: "/inventario/bodegas", label: "Bodegas", icon: <Warehouse {...iconProps} /> },
    { to: "/inventario/stock", label: "Stock", icon: <ClipboardList {...iconProps} /> },
    { to: "/inventario/movimientos", label: "Movimientos", icon: <ArrowRightLeft {...iconProps} /> },
    { to: "/inventario/transferencias", label: "Transferencias", icon: <ArrowRightLeft {...iconProps} style={{ transform: "rotate(90deg)" }} /> },
    { to: "/inventario/conteos", label: "Conteos", icon: <PenLine {...iconProps} /> },
    { to: "/inventario/kardex", label: "Kardex", icon: <BookOpen {...iconProps} /> },
    { to: "/inventario/alertas", label: "Alertas", icon: <AlertTriangle {...iconProps} /> },
    { to: "/inventario/reservas", label: "Reservas", icon: <Lock {...iconProps} /> },
    { to: "/inventario/lotes", label: "Lotes", icon: <Tag {...iconProps} /> },
    { to: "/inventario/ubicaciones", label: "Ubicaciones", icon: <MapPin {...iconProps} /> },
    { to: "/inventario/reportes", label: "Reportes", icon: <BarChart3 {...iconProps} /> },
  ]},
  { label: "Compras", icon: <ShoppingCart {...iconProps} />, items: [
    { to: "/compras/proveedores", label: "Proveedores", icon: <Building2 {...iconProps} /> },
    { to: "/compras/solicitudes", label: "Solicitudes", icon: <PenLine {...iconProps} /> },
    { to: "/compras/ordenes", label: "Órdenes de Compra", icon: <FileText {...iconProps} /> },
    { to: "/compras/cotizaciones", label: "Cotizaciones", icon: <BarChart3 {...iconProps} /> },
  ]},
  { label: "Ventas", icon: <Receipt {...iconProps} />, items: [
    { to: "/ventas/clientes", label: "Clientes", icon: <Users {...iconProps} /> },
    { to: "/ventas/cotizaciones", label: "Cotizaciones", icon: <BarChart3 {...iconProps} /> },
    { to: "/ventas/pedidos", label: "Pedidos", icon: <FileText {...iconProps} /> },
    { to: "/ventas/facturas", label: "Facturas", icon: <Receipt {...iconProps} /> },
  ]},
  { label: "Administración", icon: <Settings {...iconProps} />, items: [
    { to: "/admin/usuarios", label: "Usuarios", icon: <Users {...iconProps} /> },
  ]},
];

const singleItems: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: <LayoutDashboard {...iconProps} /> },
  { to: "/catalogo/skus", label: "Catálogo SKU", icon: <Tag {...iconProps} /> },
];

const sectionLabels: Record<string, string> = {
  "Inventario": "Inventario",
  "Compras": "Compras",
  "Ventas": "Ventas",
  "Administración": "Sistema",
};

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

  const sectionDisplay = sections.filter(s => s.label !== "Administración" || isAdmin);

  return (
    <aside style={{
      width: 260, minHeight: "100vh", background: "var(--bg-sidebar)",
      borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column",
      position: "fixed", left: 0, top: 0, bottom: 0, zIndex: 50, overflow: "hidden",
      transition: "var(--transition)",
      backdropFilter: "var(--sidebar-blur)", WebkitBackdropFilter: "var(--sidebar-blur)",
    }}>
      <div style={{
        padding: "24px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12,
        transition: "border-color .5s ease",
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: "linear-gradient(135deg, var(--accent-grad-start), var(--accent-grad-end))",
          display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
          boxShadow: "0 4px 16px var(--accent-glow)", transition: "all .5s ease",
        }}>
          <Boxes size={18} strokeWidth={2} />
        </div>
        <div>
          <div style={{ fontFamily: "'Space Grotesk'", fontWeight: 700, fontSize: 16, color: "var(--text-primary)", letterSpacing: "-0.3px", transition: "var(--transition)" }}>minisap</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 400, transition: "var(--transition)" }}>ERP v1.0</div>
        </div>
      </div>

      <nav style={{ flex: 1, padding: "16px 12px", display: "flex", flexDirection: "column", gap: 2, overflowY: "auto", scrollbarWidth: "none", msOverflowStyle: "none" }} className="sidebar-nav">
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "1.2px", color: "var(--text-muted)", padding: "8px 12px", transition: "var(--transition)" }}>
          Principal
        </div>
        {singleItems.map((item) => {
          const active = isItemActive(item.to);
          return (
            <NavLink key={item.to} to={item.to} style={{
              display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 8,
              color: active ? "var(--accent)" : "var(--text-secondary)", fontSize: 14, fontWeight: 500,
              background: active ? "var(--accent-soft)" : "transparent",
              cursor: "pointer", transition: "all .2s ease", position: "relative", textDecoration: "none",
            }}>
              {active && <div style={{
                position: "absolute", left: -12, top: "50%", transform: "translateY(-50%)",
                width: 3, height: 24, borderRadius: "0 4px 4px 0", background: "var(--accent)",
              }} />}
              <span style={{ width: 22, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: active ? 1 : 0.6 }}>
                {item.icon}
              </span>
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
                  {sectionLabels[section.label] || section.label}
                </div>
              )}
              <button onClick={() => toggleSection(section.label)} style={{
                width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 8,
                color: hasActiveChild ? "var(--accent)" : "var(--text-secondary)", fontSize: 14, fontWeight: 500,
                background: hasActiveChild ? "var(--accent-soft)" : "transparent", border: "none",
                cursor: "pointer", textAlign: "left", fontFamily: "inherit", transition: "all .2s ease", position: "relative",
              }}>
                {hasActiveChild && <div style={{
                  position: "absolute", left: -12, top: "50%", transform: "translateY(-50%)",
                  width: 3, height: 24, borderRadius: "0 4px 4px 0", background: "var(--accent)",
                }} />}
                <span style={{ width: 22, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: hasActiveChild ? 1 : 0.6 }}>
                  {section.icon}
                </span>
                <span style={{ flex: 1 }}>{section.label}</span>
                <ChevronDown size={12} strokeWidth={2} style={{ opacity: 0.4, transition: "transform 0.2s", transform: isExpanded ? "rotate(0deg)" : "rotate(-90deg)" }} />
              </button>
              {isExpanded && (
                <div style={{ paddingLeft: 8, marginBottom: 4 }}>
                  {section.items.map((item) => {
                    const active = isItemActive(item.to);
                    return (
                      <NavLink key={item.to} to={item.to} style={{
                        display: "flex", alignItems: "center", gap: 12, padding: "8px 14px 8px 24px",
                        borderRadius: 8, color: active ? "var(--accent)" : "var(--text-secondary)",
                        fontSize: 13, fontWeight: active ? 600 : 400,
                        background: active ? "var(--accent-soft)" : "transparent",
                        cursor: "pointer", transition: "all .2s ease", position: "relative", textDecoration: "none",
                      }}>
                        <span style={{ width: 20, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: active ? 1 : 0.5 }}>
                          {item.icon}
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
        <div style={{
          width: 36, height: 36, borderRadius: 8,
          background: "linear-gradient(135deg, var(--avatar-grad-start), var(--avatar-grad-end))",
          display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, color: "#fff",
          flexShrink: 0, transition: "all .5s ease",
        }}>
          {user?.nombre_completo?.[0]?.toUpperCase() || "U"}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", transition: "var(--transition)" }}>
            {user?.nombre_completo}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "capitalize", transition: "var(--transition)" }}>
            {user?.rol}
          </div>
        </div>
        <button onClick={() => { logout(); navigate("/login"); }} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 4, display: "flex" }} title="Cerrar sesión">
          <LogOut size={15} strokeWidth={1.8} />
        </button>
      </div>
    </aside>
  );
}
