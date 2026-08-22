import { useEffect, useState } from "react";
import api from "../../lib/api";
import { formatMoney } from "../../lib/money";

type Tab = "valorizado" | "rotacion" | "sin-mov";

export default function ReportesPage() {
  const [tab, setTab] = useState<Tab>("valorizado");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchData = () => {
    setLoading(true); setError("");
    const endpoint = tab === "valorizado" ? "/inventario/reportes/valorizado" : tab === "rotacion" ? "/inventario/reportes/rotacion" : "/inventario/reportes/sin-movimiento";
    api.get(endpoint).then((res) => { setData(res.data); setLoading(false); }).catch((err) => { setError(err.response?.data?.detail || "Error al cargar el reporte"); setLoading(false); });
  };
  useEffect(() => { fetchData(); }, [tab]);

  const tabs: { key: Tab; label: string }[] = [
    { key: "valorizado", label: "Stock valorizado" },
    { key: "rotacion", label: "Rotación (30d)" },
    { key: "sin-mov", label: "Sin movimiento (60d)" },
  ];

  return (
    <div style={{ animation: "fadeInUp .45s ease forwards" }}>
      <div className="ui-head">
        <div><h1 className="ui-title">Reportes de inventario</h1><p className="ui-subtitle">Valorización, rotación y productos sin movimiento</p></div>
      </div>

      <div className="ui-toolbar">
        <div className="ui-chips">{tabs.map((t) => <button key={t.key} className={`ui-chip ${tab === t.key ? "active" : ""}`} onClick={() => setTab(t.key)}>{t.label}</button>)}</div>
      </div>

      {tab === "valorizado" && data && !loading && !error && (
        <div className="ui-stats" style={{ gridTemplateColumns: "minmax(260px, 360px)" }}>
          <div className="ui-stat ui-stat-dark"><div className="ui-stat-top"><span className="ui-stat-lbl">Valor total del inventario</span><i className="fas fa-sack-dollar" /></div><div className="ui-stat-val">{formatMoney(data.valor_total_inventario ?? 0, "GTQ")}</div><div className="ui-stat-foot">{Array.isArray(data.items) ? data.items.length : 0} productos valorizados</div></div>
        </div>
      )}

      <div className="ui-table-wrap">
        {loading ? <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Cargando...</div>
        : error ? <div style={{ textAlign: "center", padding: 30 }}><p style={{ color: "var(--danger)", fontSize: 14, marginBottom: 12 }}>{error}</p><button onClick={fetchData} className="ui-btn-primary">Reintentar</button></div>
        : !data ? <div style={{ textAlign: "center", padding: 30, color: "var(--text-muted)" }}>Sin datos disponibles</div>
        : tab === "valorizado" ? (
          <table className="ui-table">
            <thead><tr><th>Código</th><th>Descripción</th><th>Categoría</th><th style={{ textAlign: "right" }}>Cant.</th><th style={{ textAlign: "right" }}>Costo U.</th><th style={{ textAlign: "right" }}>Valor total</th></tr></thead>
            <tbody>
              {Array.isArray(data.items) && data.items.length > 0 ? data.items.map((it: any, i: number) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--row-border)" }}>
                  <td><span className="ui-code">{it.codigo_sku}</span></td>
                  <td style={{ color: "var(--text-primary)", fontWeight: 500 }}>{it.descripcion}</td>
                  <td>{it.categoria || "—"}</td>
                  <td style={{ textAlign: "right" }} className="ui-mono">{(it.cantidad ?? 0).toLocaleString()}</td>
                  <td style={{ textAlign: "right" }} className="ui-mono">{formatMoney(it.costo_unitario ?? 0, "GTQ")}</td>
                  <td style={{ textAlign: "right", fontWeight: 700 }} className="ui-mono">{formatMoney(it.valor_total ?? 0, "GTQ")}</td>
                </tr>
              )) : <tr><td colSpan={6} className="ui-empty"><i className="fas fa-chart-pie" />Sin datos</td></tr>}
            </tbody>
          </table>
        ) : tab === "rotacion" ? (
          <table className="ui-table">
            <thead><tr><th>SKU</th><th>Descripción</th><th style={{ textAlign: "right" }}>Entradas</th><th style={{ textAlign: "right" }}>Salidas</th></tr></thead>
            <tbody>
              {Array.isArray(data) && data.length > 0 ? data.map((r: any, i: number) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--row-border)" }}>
                  <td><span className="ui-code">{r.codigo_sku}</span></td>
                  <td style={{ color: "var(--text-primary)", fontWeight: 500 }}>{r.descripcion}</td>
                  <td style={{ textAlign: "right", color: "var(--success-text)" }} className="ui-mono">{(r.entradas ?? 0).toLocaleString()}</td>
                  <td style={{ textAlign: "right", color: "var(--danger)" }} className="ui-mono">{(r.salidas ?? 0).toLocaleString()}</td>
                </tr>
              )) : <tr><td colSpan={4} className="ui-empty"><i className="fas fa-arrows-rotate" />Sin movimientos en el período</td></tr>}
            </tbody>
          </table>
        ) : (
          <table className="ui-table">
            <thead><tr><th>SKU</th><th>Descripción</th><th>Bodega</th><th style={{ textAlign: "right" }}>Stock actual</th></tr></thead>
            <tbody>
              {Array.isArray(data) && data.length > 0 ? data.map((r: any, i: number) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--row-border)" }}>
                  <td><span className="ui-code">{r.codigo_sku}</span></td>
                  <td style={{ color: "var(--text-primary)", fontWeight: 500 }}>{r.descripcion}</td>
                  <td>{r.bodega}</td>
                  <td style={{ textAlign: "right", fontWeight: 700 }} className="ui-mono">{(r.cantidad ?? 0).toLocaleString()}</td>
                </tr>
              )) : <tr><td colSpan={4} className="ui-empty"><i className="fas fa-box" />Todos los productos tienen movimiento reciente</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
