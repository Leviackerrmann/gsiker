import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import RespaldoBanner from "../components/RespaldoBanner";

type Periodo = "hoy" | "semana" | "mes";

interface DashboardData {
  periodo: Periodo;
  generado_at: string;
  sku_count: number;
  valor_stock: number | null;
  alertas_count: number;
  oc_pendientes_count: number;
  movs_periodo: number;
  movs_trend: number | null;
  skus_nuevos: number;
  skus_trend: number | null;
  oc_creadas: number;
  oc_trend: number | null;
  movimientos_serie: { label: string; total: number }[];
  top_skus: { codigo: string; descripcion: string; cantidad: number }[];
  stock_por_bodega: { bodega: string; total: number }[];
}

const PERIODOS: { value: Periodo; label: string; sufijo: string }[] = [
  { value: "hoy", label: "Hoy", sufijo: "hoy" },
  { value: "semana", label: "7 días", sufijo: "7 días" },
  { value: "mes", label: "30 días", sufijo: "30 días" },
];

const CHART_COLORS = ["var(--accent)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)"];

function AnimatedNumber({ target, prefix = "", isMoney = false }: { target: number; prefix?: string; isMoney?: boolean }) {
  const [val, setVal] = useState(0);
  const animRef = useRef<number>(0);
  useEffect(() => {
    const dur = 900; const start = performance.now(); const from = 0;
    function tick(now: number) {
      const p = Math.min((now - start) / dur, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(from + ease * (target - from)));
      if (p < 1) animRef.current = requestAnimationFrame(tick);
    }
    animRef.current = requestAnimationFrame(tick);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [target]);
  return <span style={{ fontFamily: "'Space Grotesk'", fontSize: target > 9999 ? 22 : 28, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-1px", lineHeight: 1 }}>{prefix}{isMoney ? val.toLocaleString() : val}</span>;
}

/** Chip de tendencia real (verde sube / rojo baja / gris igual). null = sin base previa. */
function TrendChip({ pct, hint }: { pct: number | null; hint?: string }) {
  if (pct === null) {
    return <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{hint || "sin datos previos"}</span>;
  }
  const up = pct > 0, flat = pct === 0;
  const color = flat ? "var(--text-muted)" : up ? "var(--c3)" : "#ef4444";
  const icon = flat ? "fa-minus" : up ? "fa-arrow-up" : "fa-arrow-down";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, flexWrap: "wrap" }}>
      <span style={{ color, fontWeight: 600 }}><i className={`fas ${icon}`} style={{ fontSize: 10 }} /> {Math.abs(pct)}%</span>
      {hint && <span style={{ color: "var(--text-muted)" }}>{hint}</span>}
    </span>
  );
}

/** Gráfica de área SVG de la serie de movimientos. */
function AreaChart({ serie }: { serie: { label: string; total: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = 180, padX = 8, padTop = 16, padBottom = 26;
  const n = serie.length;
  const max = Math.max(...serie.map(s => s.total), 1);
  const innerW = W - padX * 2, innerH = H - padTop - padBottom;
  const x = (i: number) => (n <= 1 ? W / 2 : padX + (i / (n - 1)) * innerW);
  const y = (v: number) => padTop + innerH - (v / max) * innerH;
  const linePts = serie.map((s, i) => `${x(i)},${y(s.total)}`).join(" ");
  const areaPath = n >= 1
    ? `M ${x(0)},${padTop + innerH} L ${serie.map((s, i) => `${x(i)},${y(s.total)}`).join(" L ")} L ${x(n - 1)},${padTop + innerH} Z`
    : "";
  const hayDatos = serie.some(s => s.total > 0);
  // Cuántas etiquetas del eje X mostrar (para que no se amontonen).
  const step = Math.max(1, Math.ceil(n / 8));

  return (
    <div style={{ position: "relative", padding: "6px 12px 4px" }}>
      {!hayDatos && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 13, pointerEvents: "none" }}>
          Sin movimientos en el período
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: "block", overflow: "visible" }}>
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {areaPath && <path d={areaPath} fill="url(#areaFill)" />}
        {n > 1 && <polyline points={linePts} fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />}
        {serie.map((s, i) => (
          <g key={i}>
            {/* zona de hover invisible por punto */}
            <rect x={x(i) - (innerW / Math.max(n, 1)) / 2} y={0} width={innerW / Math.max(n, 1) + 2} height={H} fill="transparent"
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: "pointer" }} />
            <circle cx={x(i)} cy={y(s.total)} r={hover === i ? 5 : n <= 30 ? 3 : 0} fill="var(--bg-card)" stroke="var(--accent)" strokeWidth={2} style={{ transition: "r .15s ease", pointerEvents: "none" }} />
            {(i % step === 0 || i === n - 1) && (
              <text x={x(i)} y={H - 8} textAnchor="middle" fontSize={10} fill="var(--text-muted)" style={{ pointerEvents: "none" }}>{s.label}</text>
            )}
          </g>
        ))}
      </svg>
      {hover !== null && serie[hover] && (
        <div style={{ position: "absolute", top: 0, left: `${(x(hover) / W) * 100}%`, transform: "translateX(-50%)", background: "var(--text-primary)", color: "var(--bg-card)", padding: "4px 9px", borderRadius: 6, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", pointerEvents: "none", boxShadow: "0 4px 12px rgba(0,0,0,.18)" }}>
          {serie[hover].label} · {serie[hover].total} mov.
        </div>
      )}
    </div>
  );
}

/** Dona SVG de distribución de stock por bodega. */
function Donut({ data }: { data: { bodega: string; total: number }[] }) {
  const total = data.reduce((a, b) => a + b.total, 0);
  const r = 52, sw = 20, C = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap", padding: "18px 22px" }}>
      <svg width={140} height={140} viewBox="0 0 140 140" style={{ flexShrink: 0 }}>
        <circle cx={70} cy={70} r={r} fill="none" stroke="rgba(128,128,128,0.12)" strokeWidth={sw} />
        {total > 0 && data.map((b, i) => {
          const frac = b.total / total;
          const dash = frac * C;
          const el = (
            <circle key={i} cx={70} cy={70} r={r} fill="none" stroke={CHART_COLORS[i % CHART_COLORS.length]}
              strokeWidth={sw} strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-acc * C}
              transform="rotate(-90 70 70)" strokeLinecap="butt">
              <title>{b.bodega}: {b.total.toLocaleString()} ({Math.round(frac * 100)}%)</title>
            </circle>
          );
          acc += frac;
          return el;
        })}
        <text x={70} y={65} textAnchor="middle" fontFamily="'Space Grotesk'" fontWeight={700} fontSize={20} fill="var(--text-primary)">{total.toLocaleString()}</text>
        <text x={70} y={83} textAnchor="middle" fontSize={10} fill="var(--text-muted)">unidades</text>
      </svg>
      <div style={{ flex: 1, minWidth: 140, display: "flex", flexDirection: "column", gap: 8 }}>
        {data.length === 0 ? <span style={{ color: "var(--text-muted)", fontSize: 13 }}>Sin bodegas con stock</span>
          : data.map((b, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: CHART_COLORS[i % CHART_COLORS.length], flexShrink: 0 }} />
              <span style={{ color: "var(--text-secondary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.bodega}</span>
              <span style={{ fontFamily: "'Space Grotesk'", fontWeight: 600, color: "var(--text-primary)" }}>{total > 0 ? Math.round((b.total / total) * 100) : 0}%</span>
            </div>
          ))}
      </div>
    </div>
  );
}

function hace(iso: string, tick: number): string {
  void tick;
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 5) return "ahora mismo";
  if (s < 60) return `hace ${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  return `hace ${Math.round(m / 60)} h`;
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [periodo, setPeriodo] = useState<Periodo>("hoy");
  const [refreshing, setRefreshing] = useState(false);
  const [tick, setTick] = useState(0);
  const navigate = useNavigate();

  const cargar = useCallback((p: Periodo, silent = false) => {
    if (!silent) setData(null);
    setRefreshing(true);
    api.get("/dashboard", { params: { periodo: p } })
      .then((res) => setData(res.data))
      .finally(() => setRefreshing(false));
  }, []);

  useEffect(() => { cargar(periodo); }, [periodo, cargar]);
  // Auto-refresh silencioso cada 60s.
  useEffect(() => {
    const id = setInterval(() => cargar(periodo, true), 60_000);
    return () => clearInterval(id);
  }, [periodo, cargar]);
  // Ticker para el "actualizado hace X".
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  const sufijo = useMemo(() => PERIODOS.find(p => p.value === periodo)?.sufijo ?? "", [periodo]);

  if (!data) return <div style={{ display: "flex", justifyContent: "center", padding: 60, color: "var(--text-muted)" }}>Cargando...</div>;

  const cards = [
    { label: "SKUs Registrados", target: data.sku_count, icon: "fa-barcode", color: "c1", to: "/catalogo/skus",
      trend: <TrendChip pct={data.skus_trend} hint={data.skus_nuevos > 0 ? `${data.skus_nuevos} nuevos · ${sufijo}` : `sin altas · ${sufijo}`} /> },
    { label: "Valor Stock", target: data.valor_stock, icon: "fa-coins", color: "c2", prefix: "Q ", isMoney: true, to: "/inventario/stock",
      trend: <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{data.valor_stock === null ? "solo administradores" : "a costo, inventario actual"}</span> },
    { label: "Alertas Stock", target: data.alertas_count, icon: "fa-shield-halved", color: "c3", to: "/inventario/alertas",
      trend: data.alertas_count === 0
        ? <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: "var(--badge-radius)", fontSize: 11, fontWeight: 600, background: "var(--c3-soft)", color: "var(--c3)" }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} /> Sin alertas</span>
        : <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: "var(--badge-radius)", fontSize: 11, fontWeight: 600, background: "var(--c2-soft)", color: "var(--c2)" }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} /> Requieren atención</span> },
    { label: "OC Pendientes", target: data.oc_pendientes_count, icon: "fa-file-circle-exclamation", color: "c4", to: "/compras/ordenes",
      trend: <TrendChip pct={data.oc_trend} hint={data.oc_creadas > 0 ? `${data.oc_creadas} creadas · ${sufijo}` : `sin nuevas · ${sufijo}`} /> },
    { label: `Movimientos ${sufijo}`, target: data.movs_periodo, icon: "fa-arrow-right-arrow-left", color: "c5", to: "/inventario/movimientos",
      trend: <TrendChip pct={data.movs_trend} hint="vs. período anterior" /> },
  ];

  const cardBg = (c: string) => ({ c1: "var(--accent-soft)", c2: "var(--c2-soft)", c3: "var(--c3-soft)", c4: "var(--c4-soft)", c5: "var(--c5-soft)" }[c] || "var(--accent-soft)");
  const cardColor = (c: string) => ({ c1: "var(--accent)", c2: "var(--c2)", c3: "var(--c3)", c4: "var(--c4)", c5: "var(--c5)" }[c] || "var(--accent)");
  const maxTopSku = Math.max(...data.top_skus.map(s => s.cantidad), 1);

  return (
    <div>
      <style>{`
        .dash-card{cursor:pointer;transition:transform .2s ease, box-shadow .2s ease, border-color .2s ease;}
        .dash-card:hover{transform:translateY(-3px);box-shadow:0 10px 28px rgba(0,0,0,.10);border-color:var(--accent)!important;}
        .dash-row{cursor:pointer;transition:background .15s ease;}
        .dash-row:hover{background:var(--accent-soft);}
        .seg-btn{transition:all .18s ease;}
      `}</style>
      <RespaldoBanner />

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 14, position: "relative", zIndex: 1 }}>
        <div>
          <h1 style={{ fontFamily: "'Space Grotesk'", fontSize: 26, fontWeight: 700, letterSpacing: "-0.5px", color: "var(--text-primary)", margin: 0 }}>Dashboard</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: refreshing ? "var(--c2)" : "var(--c3)", display: "inline-block", animation: "pulse 2s infinite" }} />
            {refreshing ? "Actualizando…" : `Actualizado ${hace(data.generado_at, tick)}`}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {/* Selector de período */}
          <div style={{ display: "inline-flex", background: "var(--bg-table-head)", border: "1px solid var(--border)", borderRadius: 10, padding: 3 }}>
            {PERIODOS.map((p) => (
              <button key={p.value} className="seg-btn" onClick={() => setPeriodo(p.value)} style={{
                padding: "7px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none", fontFamily: "inherit",
                background: periodo === p.value ? "var(--bg-card)" : "transparent",
                color: periodo === p.value ? "var(--accent)" : "var(--text-muted)",
                boxShadow: periodo === p.value ? "var(--card-shadow)" : "none",
              }}>{p.label}</button>
            ))}
          </div>
          <button onClick={() => cargar(periodo)} title="Refrescar" style={btnGhost}>
            <i className="fas fa-rotate-right" style={{ fontSize: 12, animation: refreshing ? "spin 1s linear infinite" : "none" }} />
          </button>
          <button onClick={() => navigate("/compras/ordenes")} style={btnPri}><i className="fas fa-plus" style={{ fontSize: 11 }} /> Nueva OC</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 20, position: "relative", zIndex: 1 }}>
        {cards.map((c, i) => (
          <div key={c.label} className="dash-card" onClick={() => navigate(c.to)} style={{
            background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--card-radius)",
            padding: 20, position: "relative", overflow: "hidden", boxShadow: "var(--card-shadow)",
            animation: `fadeInUp .5s ease forwards`, animationDelay: `${0.04 + i * 0.04}s`, opacity: 0,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ width: 42, height: 42, borderRadius: 10, background: cardBg(c.color), color: cardColor(c.color), display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14, fontSize: 16 }}>
                <i className={`fas ${c.icon}`} />
              </div>
              <i className="fas fa-arrow-up-right-from-square" style={{ fontSize: 11, color: "var(--text-muted)", opacity: .5 }} />
            </div>
            <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 6 }}>{c.label}</div>
            {c.target === null
              ? <span style={{ fontFamily: "'Space Grotesk'", fontSize: 28, fontWeight: 700, color: "var(--text-muted)" }}>—</span>
              : <AnimatedNumber target={c.target} prefix={c.prefix || ""} isMoney={c.isMoney} />}
            <div style={{ marginTop: 10 }}>{c.trend}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 0.7fr", gap: 20, marginBottom: 20, position: "relative", zIndex: 1 }}>
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--card-radius)", overflow: "hidden", boxShadow: "var(--card-shadow)", animation: "fadeInUp .5s ease forwards", animationDelay: ".3s", opacity: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", borderBottom: "1px solid var(--border)" }}>
            <h3 style={{ fontFamily: "'Space Grotesk'", fontSize: 15, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>Movimientos · {sufijo}</h3>
            <button onClick={() => navigate("/inventario/movimientos")} style={linkBtn}>Ver todos <i className="fas fa-arrow-right" style={{ fontSize: 10, marginLeft: 4 }} /></button>
          </div>
          <AreaChart serie={data.movimientos_serie} />
        </div>
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--card-radius)", overflow: "hidden", boxShadow: "var(--card-shadow)", animation: "fadeInUp .5s ease forwards", animationDelay: ".35s", opacity: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", borderBottom: "1px solid var(--border)" }}>
            <h3 style={{ fontFamily: "'Space Grotesk'", fontSize: 15, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>Stock por Bodega</h3>
            <button onClick={() => navigate("/inventario/stock")} style={linkBtn}>Detalle <i className="fas fa-arrow-right" style={{ fontSize: 10, marginLeft: 4 }} /></button>
          </div>
          <Donut data={data.stock_por_bodega} />
        </div>
      </div>

      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--card-radius)", overflow: "hidden", boxShadow: "var(--card-shadow)", animation: "fadeInUp .5s ease forwards", animationDelay: ".4s", opacity: 0, position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", borderBottom: "1px solid var(--border)" }}>
          <h3 style={{ fontFamily: "'Space Grotesk'", fontSize: 15, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>Top 5 SKUs por Stock</h3>
          <button onClick={() => navigate("/catalogo/skus")} style={linkBtn}>Ver todos <i className="fas fa-arrow-right" style={{ fontSize: 10, marginLeft: 4 }} /></button>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={th}>SKU</th><th style={th}>Stock</th><th style={th}>Nivel</th></tr></thead>
          <tbody>
            {data.top_skus.length === 0 ? <tr><td colSpan={3} style={{ ...td, textAlign: "center", padding: 30, color: "var(--text-muted)" }}>Sin stock registrado</td></tr>
              : data.top_skus.map((s, i) => {
                const pct = Math.round((s.cantidad / maxTopSku) * 100);
                return (
                  <tr key={i} className="dash-row" onClick={() => navigate("/catalogo/skus")} style={{ borderBottom: "1px solid var(--row-border)" }}>
                    <td style={td}><div style={{ fontFamily: "'Space Grotesk'", fontWeight: 600, color: "var(--text-primary)", fontSize: 13 }}>{s.codigo}</div><div style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 2 }}>{s.descripcion}</div></td>
                    <td style={td}><div style={{ fontFamily: "'Space Grotesk'", fontWeight: 700, color: "var(--text-primary)", fontSize: 14 }}>{s.cantidad.toLocaleString()}</div>
                      <div style={{ width: "100%", maxWidth: 140, height: "var(--bar-h)", background: "rgba(128,128,128,0.1)", borderRadius: "var(--bar-radius)", overflow: "hidden", marginTop: 6 }}>
                        <div style={{ height: "100%", borderRadius: "var(--bar-radius)", transition: "width 1s ease", width: `${pct}%`, background: pct > 40 ? "linear-gradient(90deg, var(--bar-grad-start), var(--bar-grad-end))" : "linear-gradient(90deg, var(--bar2-grad-start), var(--bar2-grad-end))" }} />
                      </div>
                    </td>
                    <td style={td}><span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: "var(--badge-radius)", fontSize: 11, fontWeight: 600, background: pct > 40 ? "var(--c3-soft)" : "var(--c2-soft)", color: pct > 40 ? "var(--c3)" : "var(--c2)" }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />{pct > 40 ? "Óptimo" : "Normal"}</span></td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const btnPri: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none", color: "#fff", fontFamily: "inherit", background: "linear-gradient(135deg, var(--accent-grad-start), var(--accent-grad-end))", boxShadow: "0 4px 16px var(--accent-glow)", transition: "all .25s ease" };
const btnGhost: React.CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 38, height: 38, borderRadius: 8, cursor: "pointer", border: "1px solid var(--border)", color: "var(--text-secondary)", background: "var(--bg-card)", fontFamily: "inherit" };
const linkBtn: React.CSSProperties = { fontSize: 12, color: "var(--accent)", cursor: "pointer", fontWeight: 500, background: "none", border: "none", fontFamily: "inherit" };
const th: React.CSSProperties = { textAlign: "left", padding: "12px 22px", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".8px", color: "var(--text-muted)", background: "var(--bg-table-head)", borderBottom: "1px solid var(--border)" };
const td: React.CSSProperties = { padding: "14px 22px", fontSize: 13, color: "var(--text-secondary)", verticalAlign: "middle" };
