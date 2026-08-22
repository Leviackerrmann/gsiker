import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../lib/api";

interface Alerta {
  id: number; sku_codigo: string; sku_descripcion: string; bodega_nombre: string;
  cantidad: number; cantidad_minima: number | null; cantidad_maxima: number | null; tipo_alerta: string;
}

export default function AlertasStockPage() {
  const navigate = useNavigate();
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filtro, setFiltro] = useState("");

  useEffect(() => { api.get("/inventario/alertas-stock").then((res) => { setAlertas(res.data); setLoading(false); }); }, []);

  const counts = useMemo(() => ({
    total: alertas.length,
    bajo: alertas.filter((a) => a.tipo_alerta === "bajo_minimo").length,
    sobre: alertas.filter((a) => a.tipo_alerta !== "bajo_minimo").length,
  }), [alertas]);

  const filtered = alertas.filter((a) => {
    if (filtro && a.tipo_alerta !== filtro) return false;
    if (search) { const h = `${a.sku_codigo} ${a.sku_descripcion} ${a.bodega_nombre}`.toLowerCase(); if (!h.includes(search.toLowerCase())) return false; }
    return true;
  });

  const chips = [
    { key: "", label: "Todas", count: counts.total },
    { key: "bajo_minimo", label: "Bajo mínimo", count: counts.bajo },
    { key: "sobre_maximo", label: "Sobre máximo", count: counts.sobre },
  ];

  return (
    <div style={{ animation: "fadeInUp .45s ease forwards" }}>
      <div className="ui-head">
        <div><h1 className="ui-title">Alertas de stock</h1><p className="ui-subtitle">Existencias fuera de los límites configurados</p></div>
        <button className="ui-btn-ghost" onClick={() => navigate("/inventario/stock")}><i className="fas fa-boxes-stacked" /> Ir a Stock</button>
      </div>

      <div className="ui-stats">
        <div className="ui-stat"><div className="ui-stat-top"><span className="ui-stat-lbl">Total alertas</span><i className="fas fa-triangle-exclamation" style={{ color: "var(--primary)" }} /></div><div className="ui-stat-val">{counts.total}</div></div>
        <div className="ui-stat"><div className="ui-stat-top"><span className="ui-stat-lbl">Bajo mínimo</span><i className="fas fa-arrow-down" style={{ color: "var(--danger)" }} /></div><div className="ui-stat-val" style={{ color: "var(--danger)" }}>{counts.bajo}</div></div>
        <div className="ui-stat"><div className="ui-stat-top"><span className="ui-stat-lbl">Sobre máximo</span><i className="fas fa-arrow-up" style={{ color: "var(--warning-text)" }} /></div><div className="ui-stat-val" style={{ color: "var(--warning-text)" }}>{counts.sobre}</div></div>
      </div>

      <div className="ui-toolbar">
        <div className="ui-search-wrap"><i className="fas fa-search" /><input className="ui-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por SKU o bodega..." /></div>
        <div className="ui-chips">{chips.map((ch) => <button key={ch.key || "todas"} className={`ui-chip ${filtro === ch.key ? "active" : ""}`} onClick={() => setFiltro(ch.key)}>{ch.label}<span className="ui-chip-count">{ch.count}</span></button>)}</div>
      </div>

      {!loading && alertas.length === 0 ? (
        <div className="ui-table-wrap" style={{ padding: 50, textAlign: "center" }}>
          <i className="fas fa-circle-check" style={{ fontSize: 34, color: "var(--success-text)", marginBottom: 12 }} />
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>No hay alertas</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>Todo el stock está dentro de los límites configurados</div>
        </div>
      ) : (
        <div className="ui-table-wrap">
          <table className="ui-table">
            <thead><tr><th>SKU</th><th>Descripción</th><th>Bodega</th><th style={{ textAlign: "right" }}>Actual</th><th style={{ textAlign: "right" }}>Mínimo</th><th style={{ textAlign: "right" }}>Máximo</th><th>Alerta</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={7} style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Cargando...</td></tr>
              : filtered.length === 0 ? <tr><td colSpan={7} className="ui-empty"><i className="fas fa-filter" />Ninguna alerta con estos filtros</td></tr>
              : filtered.map((a) => {
                const bajo = a.tipo_alerta === "bajo_minimo";
                return (
                  <tr key={a.id} style={{ borderBottom: "1px solid var(--row-border)" }}>
                    <td><span className="ui-code">{a.sku_codigo}</span></td>
                    <td style={{ color: "var(--text-primary)", fontWeight: 500 }}>{a.sku_descripcion}</td>
                    <td>{a.bodega_nombre}</td>
                    <td style={{ textAlign: "right", fontWeight: 700, color: bajo ? "var(--danger)" : "var(--warning-text)" }} className="ui-mono">{a.cantidad.toLocaleString()}</td>
                    <td style={{ textAlign: "right" }} className="ui-mono">{a.cantidad_minima?.toLocaleString() ?? "—"}</td>
                    <td style={{ textAlign: "right" }} className="ui-mono">{a.cantidad_maxima?.toLocaleString() ?? "—"}</td>
                    <td><span className="ui-badge" style={{ background: bajo ? "var(--danger-bg)" : "var(--warning-bg)", color: bajo ? "var(--danger-text)" : "var(--warning-text)" }}>{bajo ? "Bajo mínimo" : "Sobre máximo"}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
