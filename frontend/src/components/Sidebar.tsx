import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  LayoutDashboard, Package, Warehouse, ClipboardList, ArrowRightLeft,
  PenLine, BookOpen, AlertTriangle, Lock, Tag, MapPin, BarChart3,
  ShoppingCart, Building2, FileText, Receipt, Users, Settings, LogOut,
  ChevronDown,
} from "lucide-react";

interface NavItem { to: string; label: string; icon: React.ReactNode; }
interface Section { label: string; icon: React.ReactNode; items: NavItem[]; }

const iconSize = 17;
const iconProps = { size: iconSize, strokeWidth: 1.8 };

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
              <span style={{ display: "flex", alignItems: "center", width: 22, justifyContent: "center", flexShrink: 0, opacity: active ? 1 : 0.7 }}>{item.icon}</span>
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
                <span style={{ display: "flex", alignItems: "center", width: 22, justifyContent: "center", flexShrink: 0, opacity: hasActiveChild ? 1 : 0.7 }}>{section.icon}</span>
                <span style={{ flex: 1 }}>{section.label}</span>
                <ChevronDown size={12} strokeWidth={2} style={{ opacity: 0.4, transition: "transform 0.2s", transform: isExpanded ? "rotate(0deg)" : "rotate(-90deg)" }} />
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
                        <span style={{ display: "flex", alignItems: "center", width: 22, justifyContent: "center", flexShrink: 0, opacity: active ? 1 : 0.7 }}>{item.icon}</span>
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
          <button onClick={() => { logout(); navigate("/login"); }} style={{ background: "none", border: "none", color: "#94A3B8", cursor: "pointer", fontSize: 13, padding: 4, borderRadius: 4, lineHeight: 1, display: "flex", alignItems: "center" }} title="Cerrar sesión">
            <LogOut size={15} strokeWidth={1.8} />
          </button>
        </div>
      </div>
    </aside>
  );
}
