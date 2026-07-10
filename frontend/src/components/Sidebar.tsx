import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

interface NavItem {
  to: string;
  label: string;
  icon: string;
}

interface Section {
  label: string;
  icon: string;
  items: NavItem[];
}

const sections: Section[] = [
  {
    label: "Inventario",
    icon: "📦",
    items: [
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
    ],
  },
  {
    label: "Compras",
    icon: "🛒",
    items: [
      { to: "/compras/proveedores", label: "Proveedores", icon: "🏢" },
      { to: "/compras/solicitudes", label: "Solicitudes", icon: "📝" },
      { to: "/compras/ordenes", label: "Órdenes de Compra", icon: "📄" },
      { to: "/compras/cotizaciones", label: "Cotizaciones", icon: "📊" },
    ],
  },
  {
    label: "Ventas",
    icon: "💰",
    items: [
      { to: "/ventas/clientes", label: "Clientes", icon: "👥" },
      { to: "/ventas/cotizaciones", label: "Cotizaciones", icon: "📊" },
      { to: "/ventas/pedidos", label: "Pedidos", icon: "📄" },
      { to: "/ventas/facturas", label: "Facturas", icon: "🧾" },
    ],
  },
  {
    label: "Administración",
    icon: "⚙️",
    items: [
      { to: "/admin/usuarios", label: "Usuarios", icon: "👥" },
    ],
  },
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
    sections.forEach((s) => {
      state[s.label] = s.items.some((item) => location.pathname.startsWith(item.to));
    });
    return state;
  });

  const toggleSection = (label: string) => {
    setExpanded((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const isItemActive = (to: string) => location.pathname.startsWith(to);

  return (
    <aside
      style={{
        width: 240,
        background: "#1a1d23",
        color: "#e0e0e0",
        display: "flex",
        flexDirection: "column",
        padding: "16px 0",
      }}
    >
      <div style={{ padding: "0 20px 20px", borderBottom: "1px solid #2d2f36" }}>
        <h1 style={{ color: "#fff", fontSize: 18, margin: 0 }}>minisap</h1>
      </div>

      <nav style={{ flex: 1, padding: "12px 0", overflow: "auto" }}>
        {singleItems.map((item) => {
          const active = isItemActive(item.to);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 20px",
                color: active ? "#fff" : "#9ca3af",
                background: active ? "#2d2f36" : "transparent",
                textDecoration: "none",
                fontSize: 14,
                borderLeft: active ? "3px solid #6366f1" : "3px solid transparent",
              }}
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          );
        })}

        <div style={{ marginTop: 8 }} />

        {sections.filter(s => s.label !== "Administración" || isAdmin).map((section) => {
          const isExpanded = expanded[section.label];
          const hasActiveChild = section.items.some((i) => isItemActive(i.to));

          return (
            <div key={section.label}>
              <button
                onClick={() => toggleSection(section.label)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 20px",
                  color: hasActiveChild ? "#fff" : "#9ca3af",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 14,
                  textAlign: "left",
                  fontFamily: "inherit",
                }}
              >
                <span>{section.icon}</span>
                <span style={{ flex: 1 }}>{section.label}</span>
                <span style={{ fontSize: 10 }}>
                  {isExpanded ? "▼" : "▶"}
                </span>
              </button>

              {isExpanded && (
                <div style={{ paddingLeft: 12 }}>
                  {section.items.map((item) => {
                    const active = isItemActive(item.to);
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "8px 20px 8px 28px",
                          color: active ? "#fff" : "#9ca3af",
                          background: active ? "#2d2f36" : "transparent",
                          textDecoration: "none",
                          fontSize: 13,
                          borderLeft: active ? "3px solid #6366f1" : "3px solid transparent",
                        }}
                      >
                        <span>{item.icon}</span>
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

      <div
        style={{
          padding: "16px 20px",
          borderTop: "1px solid #2d2f36",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontSize: 13, color: "#9ca3af" }}>
          {user?.nombre_completo}
        </span>
        <button
          onClick={handleLogout}
          style={{
            background: "none",
            border: "none",
            color: "#ef4444",
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          Salir
        </button>
      </div>
    </aside>
  );
}
