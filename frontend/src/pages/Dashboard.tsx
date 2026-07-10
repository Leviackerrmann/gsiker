import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";

interface DashboardData {
  sku_count: number;
  valor_stock: number;
  alertas_count: number;
  oc_pendientes_count: number;
  movs_hoy_count: number;
  top_skus: { codigo: string; descripcion: string; cantidad: number }[];
  stock_por_bodega: { bodega: string; total: number }[];
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const navigate = useNavigate();

  useEffect(() => { api.get("/dashboard").then((res) => setData(res.data)); }, []);

  if (!data) return (
    <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
      <div style={{ color: "var(--text-secondary)", fontSize: 14 }}>Cargando...</div>
    </div>
  );

  const cards = [
    { label: "SKUs activos", value: data.sku_count, icon: "🏷️", color: "var(--primary)", bg: "var(--primary-light)" },
    { label: "Valor inventario", value: `$${(data.valor_stock || 0).toLocaleString()}`, icon: "💰", color: "var(--success)", bg: "var(--success-bg)" },
    { label: "Alertas stock", value: data.alertas_count, icon: "⚠️", color: data.alertas_count > 0 ? "var(--danger)" : "var(--text-secondary)", bg: data.alertas_count > 0 ? "var(--danger-bg)" : "#F1F5F9" },
    { label: "OC pendientes", value: data.oc_pendientes_count, icon: "📄", color: data.oc_pendientes_count > 0 ? "var(--warning)" : "var(--text-secondary)", bg: data.oc_pendientes_count > 0 ? "var(--warning-bg)" : "#F1F5F9" },
    { label: "Movimientos hoy", value: data.movs_hoy_count, icon: "🔄", color: "var(--info)", bg: "var(--info-bg)" },
  ];

  const maxStock = Math.max(...data.stock_por_bodega.map(b => b.total), 1);

  return (
    <div style={{ animation: "fadeIn 0.25s ease" }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--text)", margin: 0, letterSpacing: "-0.3px" }}>Dashboard</h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "4px 0 0" }}>Resumen general del sistema</p>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 28 }}>
        <button onClick={() => navigate("/compras/ordenes")} style={quickBtn}>+ Nueva OC</button>
        <button onClick={() => navigate("/ventas/pedidos")} style={quickBtn}>+ Nuevo Pedido</button>
        <button onClick={() => navigate("/catalogo/skus")} style={quickBtn}>+ Nuevo SKU</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 28 }}>
        {cards.map((c) => (
          <div key={c.label} style={{ background: "var(--surface)", padding: "20px", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)", display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: c.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{c.icon}</div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: c.color, lineHeight: 1.1 }}>{c.value}</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: "var(--surface)", padding: "20px", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)" }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 16 }}>Top 5 SKUs por Stock</h3>
          {data.top_skus.length === 0 ? (
            <p style={{ color: "var(--text-muted)", fontSize: 13, textAlign: "center", padding: 20 }}>Sin stock registrado</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ borderBottom: "1px solid var(--border)" }}><th style={th}>SKU</th><th style={th}>Descripción</th><th style={{ ...th, textAlign: "right" }}>Stock</th></tr></thead>
              <tbody>
                {data.top_skus.map((s, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border-light)" }}>
                    <td style={{ ...td, fontWeight: 600, color: "var(--primary)" }}>{s.codigo}</td>
                    <td style={td}>{s.descripcion}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>{s.cantidad.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ background: "var(--surface)", padding: "20px", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)" }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 16 }}>Stock por Bodega</h3>
          {data.stock_por_bodega.length === 0 ? (
            <p style={{ color: "var(--text-muted)", fontSize: 13, textAlign: "center", padding: 20 }}>Sin bodegas con stock</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {data.stock_por_bodega.map((b, i) => {
                const pct = maxStock > 0 ? (b.total / maxStock) * 100 : 0;
                return (
                  <div key={i}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13 }}>
                      <span style={{ fontWeight: 600, color: "var(--text)" }}>{b.bodega}</span>
                      <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>{b.total.toLocaleString()} u</span>
                    </div>
                    <div style={{ height: 8, borderRadius: 4, background: "var(--border-light)", overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 4, background: "var(--primary)", width: `${Math.max(pct, 2)}%`, transition: "width 0.6s ease" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const quickBtn: React.CSSProperties = {
  padding: "8px 16px", background: "var(--surface)", color: "var(--text)",
  border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", cursor: "pointer",
  fontSize: 13, fontWeight: 600, transition: "var(--transition)",
};

const th: React.CSSProperties = { padding: "8px 12px", textAlign: "left", fontSize: 11, color: "var(--text-secondary)", textTransform: "uppercase", fontWeight: 600 };
const td: React.CSSProperties = { padding: "8px 12px", fontSize: 13 };
