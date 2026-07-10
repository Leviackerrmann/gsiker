import { useEffect, useState } from "react";
import api from "../../lib/api";

export default function ReportesPage() {
  const [tab, setTab] = useState<"valorizado" | "rotacion" | "sin-mov">("valorizado");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchData = () => {
    setLoading(true);
    setError("");
    const endpoint =
      tab === "valorizado" ? "/inventario/reportes/valorizado"
      : tab === "rotacion" ? "/inventario/reportes/rotacion"
      : "/inventario/reportes/sin-movimiento";
    api.get(endpoint)
      .then((res) => { setData(res.data); setLoading(false); })
      .catch((err) => { setError(err.response?.data?.detail || "Error al cargar el reporte"); setLoading(false); });
  };

  useEffect(() => { fetchData(); }, [tab]);

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1a1d23", marginBottom: 20 }}>Reportes de Inventario</h2>

      <div style={{ display: "flex", gap: 0, marginBottom: 20 }}>
        {(["valorizado","rotacion","sin-mov"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{ ...tabBtn, borderBottom: tab === t ? "2px solid #6366f1" : "2px solid transparent", color: tab === t ? "#6366f1" : "#6b7280" }}>
            {t === "valorizado" ? "Stock Valorizado" : t === "rotacion" ? "Rotación (30d)" : "Sin Movimiento (60d)"}
          </button>
        ))}
      </div>

      <div style={card}>
        {loading ? (
          <p style={{ color: "#6b7280", textAlign: "center", padding: 20 }}>Cargando...</p>
        ) : error ? (
          <div style={{ textAlign: "center", padding: 30 }}>
            <p style={{ color: "#dc2626", fontSize: 14, marginBottom: 12 }}>{error}</p>
            <button onClick={fetchData} style={btnRetry}>Reintentar</button>
          </div>
        ) : !data ? (
          <p style={{ color: "#6b7280", textAlign: "center", padding: 20 }}>Sin datos disponibles</p>
        ) : tab === "valorizado" ? (
          <div>
            <h3 style={{ fontSize: 15, marginBottom: 12, color: "#16a34a" }}>Valor Total Inventario: ${data.valor_total_inventario?.toLocaleString?.() ?? "0"}</h3>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                <th style={th}>Código</th><th style={th}>Descripción</th><th style={th}>Cat.</th><th style={{ ...th, textAlign: "right" }}>Cant.</th><th style={{ ...th, textAlign: "right" }}>Costo U.</th><th style={{ ...th, textAlign: "right" }}>Valor Total</th>
              </tr></thead>
              <tbody>
                {Array.isArray(data.items) && data.items.length > 0 ? data.items.map((it: any, i: number) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ ...td, fontWeight: 600, color: "#6366f1" }}>{it.codigo_sku}</td>
                    <td style={td}>{it.descripcion}</td><td style={td}>{it.categoria || "-"}</td>
                    <td style={{ ...td, textAlign: "right" }}>{(it.cantidad ?? 0).toLocaleString()}</td>
                    <td style={{ ...td, textAlign: "right" }}>${(it.costo_unitario ?? 0).toFixed(2)}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>${(it.valor_total ?? 0).toFixed(2)}</td>
                  </tr>
                )) : <tr><td colSpan={6} style={td}>Sin datos</td></tr>}
              </tbody>
            </table>
          </div>
        ) : tab === "rotacion" ? (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ borderBottom: "1px solid #e5e7eb" }}>
              <th style={th}>SKU</th><th style={th}>Descripción</th><th style={{ ...th, textAlign: "right" }}>Entradas</th><th style={{ ...th, textAlign: "right" }}>Salidas</th>
            </tr></thead>
            <tbody>
              {Array.isArray(data) && data.length > 0 ? data.map((r: any, i: number) => (
                <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ ...td, fontWeight: 600, color: "#6366f1" }}>{r.codigo_sku}</td>
                  <td style={td}>{r.descripcion}</td>
                  <td style={{ ...td, textAlign: "right", color: "#16a34a" }}>{(r.entradas ?? 0).toLocaleString()}</td>
                  <td style={{ ...td, textAlign: "right", color: "#dc2626" }}>{(r.salidas ?? 0).toLocaleString()}</td>
                </tr>
              )) : <tr><td colSpan={4} style={td}>Sin movimientos en el período</td></tr>}
            </tbody>
          </table>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ borderBottom: "1px solid #e5e7eb" }}>
              <th style={th}>SKU</th><th style={th}>Descripción</th><th style={th}>Bodega</th><th style={{ ...th, textAlign: "right" }}>Stock Actual</th>
            </tr></thead>
            <tbody>
              {Array.isArray(data) && data.length > 0 ? data.map((r: any, i: number) => (
                <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ ...td, fontWeight: 600, color: "#6366f1" }}>{r.codigo_sku}</td>
                  <td style={td}>{r.descripcion}</td><td style={td}>{r.bodega}</td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>{(r.cantidad ?? 0).toLocaleString()}</td>
                </tr>
              )) : <tr><td colSpan={4} style={td}>Todos los productos tienen movimiento reciente</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const card: React.CSSProperties = { background: "#fff", padding: 20, borderRadius: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.08)", overflowX: "auto" };
const tabBtn: React.CSSProperties = { background: "none", border: "none", padding: "10px 20px", cursor: "pointer", fontSize: 14, fontWeight: 600, fontFamily: "inherit" };
const btnRetry: React.CSSProperties = { padding: "8px 20px", background: "#6366f1", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 };
const th: React.CSSProperties = { padding: "10px 12px", textAlign: "left", fontSize: 12, color: "#6b7280", textTransform: "uppercase", fontWeight: 600 };
const td: React.CSSProperties = { padding: "10px 12px", fontSize: 14 };
