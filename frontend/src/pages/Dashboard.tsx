import { useEffect, useState } from "react";
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

  useEffect(() => {
    api.get("/dashboard").then((res) => setData(res.data));
  }, []);

  if (!data) return <p style={{ color: "#6b7280" }}>Cargando...</p>;

  const cards = [
    { label: "SKUs", value: data.sku_count, color: "#6366f1", bg: "#eef2ff" },
    { label: "Valor Stock", value: `$${data.valor_stock.toLocaleString()}`, color: "#16a34a", bg: "#dcfce7" },
    { label: "Alertas Stock", value: data.alertas_count, color: data.alertas_count > 0 ? "#dc2626" : "#6b7280", bg: data.alertas_count > 0 ? "#fef2f2" : "#f3f4f6" },
    { label: "OC Pendientes", value: data.oc_pendientes_count, color: data.oc_pendientes_count > 0 ? "#f59e0b" : "#6b7280", bg: data.oc_pendientes_count > 0 ? "#fef3c7" : "#f3f4f6" },
    { label: "Movimientos Hoy", value: data.movs_hoy_count, color: "#3b82f6", bg: "#e0e7ff" },
  ];

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: "#1a1d23", marginBottom: 24 }}>Dashboard</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 28 }}>
        {cards.map((c) => (
          <div key={c.label} style={{ background: c.bg, padding: "20px", borderRadius: 10, textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: c.color }}>{c.value}</div>
            <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>{c.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div style={card}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: "#1a1d23" }}>Top 5 SKUs por Stock</h3>
          {data.top_skus.length === 0 ? (
            <p style={{ color: "#9ca3af", fontSize: 13 }}>Sin stock registrado</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ borderBottom: "1px solid #e5e7eb" }}><th style={th}>SKU</th><th style={th}>Descripción</th><th style={{ ...th, textAlign: "right" }}>Stock</th></tr></thead>
              <tbody>
                {data.top_skus.map((s, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ ...td, fontWeight: 600, color: "#6366f1" }}>{s.codigo}</td>
                    <td style={td}>{s.descripcion}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>{s.cantidad.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={card}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: "#1a1d23" }}>Stock por Bodega</h3>
          {data.stock_por_bodega.length === 0 ? (
            <p style={{ color: "#9ca3af", fontSize: 13 }}>Sin bodegas con stock</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ borderBottom: "1px solid #e5e7eb" }}><th style={th}>Bodega</th><th style={{ ...th, textAlign: "right" }}>Total unidades</th></tr></thead>
              <tbody>
                {data.stock_por_bodega.map((b, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={td}>{b.bodega}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>{b.total.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

const card: React.CSSProperties = { background: "#fff", padding: 20, borderRadius: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" };
const th: React.CSSProperties = { padding: "8px 12px", textAlign: "left", fontSize: 12, color: "#6b7280", textTransform: "uppercase", fontWeight: 600 };
const td: React.CSSProperties = { padding: "8px 12px", fontSize: 14 };
