import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";

interface DashboardData {
  sku_count: number; valor_stock: number; alertas_count: number;
  oc_pendientes_count: number; movs_hoy_count: number;
  top_skus: { codigo: string; descripcion: string; cantidad: number }[];
  stock_por_bodega: { bodega: string; total: number }[];
}

function AnimatedNumber({ target, prefix = "", isMoney = false }: { target: number; prefix?: string; isMoney?: boolean }) {
  const [val, setVal] = useState(0);
  const animRef = useRef<number>(0);
  useEffect(() => {
    const dur = 1200; const start = performance.now();
    function tick(now: number) {
      const p = Math.min((now - start) / dur, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(ease * target));
      if (p < 1) animRef.current = requestAnimationFrame(tick);
    }
    animRef.current = requestAnimationFrame(tick);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [target]);
  return <span style={{ fontFamily: "'Space Grotesk'", fontSize: target > 9999 ? 22 : 28, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-1px", lineHeight: 1, transition: "var(--transition)" }}>{prefix}{isMoney ? val.toLocaleString() : val}</span>;
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const navigate = useNavigate();
  const barsRef = useRef<HTMLDivElement>(null);
  useEffect(() => { api.get("/dashboard").then((res) => setData(res.data)); }, []);
  useEffect(() => {
    if (!data || !barsRef.current) return;
    setTimeout(() => {
      barsRef.current?.querySelectorAll<HTMLElement>("[data-w]").forEach((bar) => { bar.style.width = bar.getAttribute("data-w") + "%"; });
    }, 400);
  }, [data]);
  if (!data) return <div style={{ display: "flex", justifyContent: "center", padding: 60, color: "var(--text-muted)" }}>Cargando...</div>;

  const cards = [
    { label: "SKUs Registrados", target: data.sku_count, icon: "fa-barcode", color: "c1", trend: "+2", trendLabel: "vs. semana pasada" },
    { label: "Valor Stock", target: Math.round(data.valor_stock || 0), icon: "fa-coins", color: "c2", prefix: "Q ", isMoney: true, trend: "+5.3%", trendLabel: "vs. mes anterior" },
    { label: "Alertas Stock", target: data.alertas_count, icon: "fa-shield-halved", color: "c3", ok: data.alertas_count === 0 },
    { label: "OC Pendientes", target: data.oc_pendientes_count, icon: "fa-file-circle-exclamation", color: "c4", warn: data.oc_pendientes_count > 0 },
    { label: "Movimientos Hoy", target: data.movs_hoy_count, icon: "fa-arrow-right-arrow-left", color: "c5", trend: "+12", trendLabel: "vs. ayer" },
  ];

  const cardBg = (c: string) => ({ c1: "var(--accent-soft)", c2: "var(--c2-soft)", c3: "var(--c3-soft)", c4: "var(--c4-soft)", c5: "var(--c5-soft)" }[c] || "var(--accent-soft)");
  const cardColor = (c: string) => ({ c1: "var(--accent)", c2: "var(--c2)", c3: "var(--c3)", c4: "var(--c4)", c5: "var(--c5)" }[c] || "var(--accent)");
  const maxStock = Math.max(...data.stock_por_bodega.map(b => b.total), 1);
  const maxTopSku = Math.max(...data.top_skus.map(s => s.cantidad), 1);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 28, position: "relative", zIndex: 1 }}>
        <div>
          <h1 style={{ fontFamily: "'Space Grotesk'", fontSize: 26, fontWeight: 700, letterSpacing: "-0.5px", color: "var(--text-primary)", margin: 0 }}>Dashboard</h1>
          <p style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 4, display: "flex", alignItems: "center" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--c3)", display: "inline-block", animation: "pulse 2s infinite", marginRight: 6 }} />
            Resumen en tiempo real
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => navigate("/compras/ordenes")} style={btnPri}><i className="fas fa-plus" style={{ fontSize: 11 }} /> Nueva OC</button>
        </div>
      </div>

      <div ref={barsRef} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 28, position: "relative", zIndex: 1 }}>
        {cards.map((c, i) => (
          <div key={c.label} style={{
            background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--card-radius)",
            padding: 20, position: "relative", overflow: "hidden", boxShadow: "var(--card-shadow)",
            animation: `fadeInUp .5s ease forwards`, animationDelay: `${0.05 + i * 0.05}s`, opacity: 0,
          }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${cardColor(c.color)}, transparent)`, opacity: 0, transition: "opacity .3s ease", display: "var(--stat-line)" }} />
            <div style={{ width: 42, height: 42, borderRadius: 10, background: cardBg(c.color), color: cardColor(c.color), display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14, fontSize: 16 }}>
              <i className={`fas ${c.icon}`} />
            </div>
            <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 6 }}>{c.label}</div>
            <AnimatedNumber target={c.target} prefix={c.prefix || ""} isMoney={c.isMoney} />
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, fontSize: 12, flexWrap: "wrap" }}>
              {c.trend && <span style={{ color: "var(--c3)", fontWeight: 600 }}><i className="fas fa-arrow-up" style={{ fontSize: 10 }} /> {c.trend}</span>}
              {c.trendLabel && <span style={{ color: "var(--text-muted)" }}>{c.trendLabel}</span>}
              {c.ok && <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: "var(--badge-radius)", fontSize: 11, fontWeight: 600, background: "var(--c3-soft)", color: "var(--c3)" }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} /> Sin alertas</span>}
              {c.warn && <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: "var(--badge-radius)", fontSize: 11, fontWeight: 600, background: "var(--c2-soft)", color: "var(--c2)" }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} /> Requieren atención</span>}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 20, position: "relative", zIndex: 1 }}>
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--card-radius)", overflow: "hidden", boxShadow: "var(--card-shadow)", animation: "fadeInUp .5s ease forwards", animationDelay: ".35s", opacity: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", borderBottom: "1px solid var(--border)" }}>
            <h3 style={{ fontFamily: "'Space Grotesk'", fontSize: 15, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>Top 5 SKUs por Stock</h3>
            <button onClick={() => navigate("/catalogo/skus")} style={{ fontSize: 12, color: "var(--accent)", cursor: "pointer", fontWeight: 500, background: "none", border: "none", fontFamily: "inherit" }}>Ver todos <i className="fas fa-arrow-right" style={{ fontSize: 10, marginLeft: 4 }} /></button>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>SKU</th><th style={th}>Stock</th><th style={th}>Nivel</th></tr></thead>
            <tbody>
              {data.top_skus.length === 0 ? <tr><td colSpan={3} style={{ ...td, textAlign: "center", padding: 30, color: "var(--text-muted)" }}>Sin stock registrado</td></tr>
              : data.top_skus.map((s, i) => {
                const pct = Math.round((s.cantidad / maxTopSku) * 100);
                const fc = pct > 40 ? "f1" : "f2";
                return (
                  <tr key={i} style={{ borderBottom: "1px solid var(--row-border)" }}>
                    <td style={td}><div style={{ fontFamily: "'Space Grotesk'", fontWeight: 600, color: "var(--text-primary)", fontSize: 13 }}>{s.codigo}</div><div style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 2 }}>{s.descripcion}</div></td>
                    <td style={td}><div style={{ fontFamily: "'Space Grotesk'", fontWeight: 700, color: "var(--text-primary)", fontSize: 14 }}>{s.cantidad.toLocaleString()}</div>
                      <div style={{ width: "100%", maxWidth: 120, height: "var(--bar-h)", background: "rgba(128,128,128,0.1)", borderRadius: "var(--bar-radius)", overflow: "hidden", marginTop: 6 }}>
                        <div data-w={pct} style={{ height: "100%", borderRadius: "var(--bar-radius)", transition: "width 1s ease", width: 0, background: fc === "f1" ? "linear-gradient(90deg, var(--bar-grad-start), var(--bar-grad-end))" : "linear-gradient(90deg, var(--bar2-grad-start), var(--bar2-grad-end))" }} />
                      </div>
                    </td>
                    <td style={td}><span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: "var(--badge-radius)", fontSize: 11, fontWeight: 600, background: pct > 40 ? "var(--c3-soft)" : "var(--c2-soft)", color: pct > 40 ? "var(--c3)" : "var(--c2)" }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />{pct > 40 ? "Óptimo" : "Normal"}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--card-radius)", overflow: "hidden", boxShadow: "var(--card-shadow)", animation: "fadeInUp .5s ease forwards", animationDelay: ".4s", opacity: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", borderBottom: "1px solid var(--border)" }}>
            <h3 style={{ fontFamily: "'Space Grotesk'", fontSize: 15, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>Stock por Bodega</h3>
            <button onClick={() => navigate("/inventario/stock")} style={{ fontSize: 12, color: "var(--accent)", cursor: "pointer", fontWeight: 500, background: "none", border: "none", fontFamily: "inherit" }}>Detalle <i className="fas fa-arrow-right" style={{ fontSize: 10, marginLeft: 4 }} /></button>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>Bodega</th><th style={th}>Unidades</th><th style={th}>Distribución</th></tr></thead>
            <tbody>
              {data.stock_por_bodega.length === 0 ? <tr><td colSpan={3} style={{ ...td, textAlign: "center", padding: 30, color: "var(--text-muted)" }}>Sin bodegas con stock</td></tr>
              : data.stock_por_bodega.map((b, i) => {
                const pct = Math.round((b.total / maxStock) * 100);
                const total = data.stock_por_bodega.reduce((a, x) => a + x.total, 0);
                const share = total > 0 ? Math.round((b.total / total) * 100) : 0;
                return (
                  <tr key={i} style={{ borderBottom: "1px solid var(--row-border)" }}>
                    <td style={td}><div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 13 }}>{b.bodega}</div></td>
                    <td style={td}><div style={{ fontFamily: "'Space Grotesk'", fontWeight: 700, color: "var(--text-primary)", fontSize: 15 }}>{b.total.toLocaleString()}</div>
                      <div style={{ width: "100%", height: "var(--bar-h)", background: "rgba(128,128,128,0.1)", borderRadius: "var(--bar-radius)", overflow: "hidden", marginTop: 6 }}>
                        <div data-w={pct} style={{ height: "100%", borderRadius: "var(--bar-radius)", transition: "width 1.2s ease", width: 0, background: "linear-gradient(90deg, var(--bar-grad-start), var(--bar-grad-end))" }} />
                      </div>
                    </td>
                    <td style={td}><span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>{share}%</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const btnPri: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none", color: "#fff", fontFamily: "inherit", background: "linear-gradient(135deg, var(--accent-grad-start), var(--accent-grad-end))", boxShadow: "0 4px 16px var(--accent-glow)", transition: "all .25s ease" };
const th: React.CSSProperties = { textAlign: "left", padding: "12px 22px", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".8px", color: "var(--text-muted)", background: "var(--bg-table-head)", borderBottom: "1px solid var(--border)" };
const td: React.CSSProperties = { padding: "14px 22px", fontSize: 13, color: "var(--text-secondary)", verticalAlign: "middle" };
