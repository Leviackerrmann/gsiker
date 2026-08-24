import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import platformApi, { PLATFORM_TOKEN_KEY } from "../../lib/platformApi";

type Vista = "dashboard" | "empresas" | "vencimientos" | "planes";

/* Paleta del panel (frontera separada del app de tenants). */
const P = {
  bg: "#f8fafc", card: "#ffffff", fg: "#0f172a", muted: "#64748b", mutedLight: "#94a3b8",
  border: "#e2e8f0", borderLight: "#f1f5f9", dark: "#0f172a",
  accent: "#3b82f6", accentDark: "#2563eb", accentLight: "#eff6ff",
  success: "#10b981", successLight: "#ecfdf5", successDark: "#059669",
  warning: "#f59e0b", warningLight: "#fffbeb", warningDark: "#d97706",
  danger: "#ef4444", dangerLight: "#fef2f2", dangerDark: "#dc2626",
  purple: "#8b5cf6", purpleLight: "#f5f3ff", purpleDark: "#7c3aed",
  slate: "#64748b", slateLight: "#f1f5f9", slateDark: "#475569",
};

const ESTADO_BADGE: Record<string, { bg: string; fg: string; label: string }> = {
  trial: { bg: P.warningLight, fg: P.warningDark, label: "Trial" },
  activa: { bg: P.successLight, fg: P.successDark, label: "Activa" },
  vencida: { bg: P.dangerLight, fg: P.dangerDark, label: "Vencida" },
  suspendida: { bg: P.warningLight, fg: P.warningDark, label: "Suspendida" },
  cancelada: { bg: P.slateLight, fg: P.slateDark, label: "Cancelada" },
};

const PLAN_STYLE: Record<string, { icon: string; grad: string }> = {
  basico: { icon: "fa-seedling", grad: "linear-gradient(135deg,#3b82f6,#2563eb)" },
  pro: { icon: "fa-rocket", grad: "linear-gradient(135deg,#8b5cf6,#7c3aed)" },
  enterprise: { icon: "fa-building-shield", grad: "linear-gradient(135deg,#0f172a,#334155)" },
  trial: { icon: "fa-clock", grad: "linear-gradient(135deg,#94a3b8,#64748b)" },
};
const AVATAR_GRAD = [
  "linear-gradient(135deg,#3b82f6,#2563eb)", "linear-gradient(135deg,#8b5cf6,#7c3aed)",
  "linear-gradient(135deg,#10b981,#059669)", "linear-gradient(135deg,#f59e0b,#d97706)",
  "linear-gradient(135deg,#ec4899,#db2777)", "linear-gradient(135deg,#0ea5e9,#0284c7)",
];

const MODULO_LABEL: Record<string, string> = {
  pos: "Punto de Venta", inventario: "Inventario", compras: "Compras",
  ventas: "Ventas", cobranza: "Cobranza", ia: "Asistente IA",
};

function fmtFecha(s?: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("es-GT", { year: "numeric", month: "short", day: "numeric" });
}
function fmtQ(n?: number) { return `Q ${Number(n || 0).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function barColor(estado?: string) { return estado === "excedido" ? P.danger : estado === "cerca" ? P.warning : P.accent; }
function iniciales(nombre?: string) { return (nombre || "?").trim().slice(0, 1).toUpperCase(); }
function planIcono(codigo?: string) { return PLAN_STYLE[codigo || ""] || { icon: "fa-box", grad: `linear-gradient(135deg,${P.accent},${P.accentDark})` }; }
/** MRR real de una empresa: solo cuenta si la suscripción está efectivamente activa. */
function mrrEmpresa(e: any) { return e?.suscripcion?.estado_efectivo === "activa" ? Number(e.suscripcion.precio || 0) : 0; }

function Badge({ estado }: { estado?: string }) {
  if (!estado) return <span style={{ color: P.mutedLight }}>—</span>;
  const b = ESTADO_BADGE[estado] || { bg: P.slateLight, fg: P.slateDark, label: estado };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600, background: b.bg, color: b.fg }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />{b.label}
    </span>
  );
}

/** Días calendario desde hoy hasta la fecha (negativo = ya pasó). */
function diasHasta(fecha?: string | null): number {
  if (!fecha) return 0;
  const d = 86400000, h = new Date(); h.setHours(0, 0, 0, 0);
  const v = new Date(fecha); v.setHours(0, 0, 0, 0);
  return Math.round((v.getTime() - h.getTime()) / d);
}
/** Fecha de vencimiento efectiva de una empresa (fin de trial o vigencia pagada). */
function vencEmpresa(e: any): string | null {
  const s = e?.suscripcion; if (!s) return null;
  return s.estado_base === "trial" ? s.fin_trial : s.vigente_hasta;
}

interface Stat { icon: string; bg: string; color: string; label: string; value: React.ReactNode; valueColor?: string; sub: string; subIcon: string; subColor?: string }
function StatCard({ s, i }: { s: Stat; i: number }) {
  return (
    <div className={`sa-stat sa-fade sa-d${i + 1}`}>
      <div className="sa-stat-icon" style={{ background: s.bg, color: s.color }}><i className={`fa-solid ${s.icon}`} /></div>
      <div className="sa-stat-label">{s.label}</div>
      <div className="sa-stat-value" style={{ color: s.valueColor }}>{s.value}</div>
      <div className="sa-stat-sub" style={{ color: s.subColor || P.mutedLight }}><i className={`fa-solid ${s.subIcon}`} />{s.sub}</div>
    </div>
  );
}

function ConsumoBar({ c }: { c: any }) {
  if (!c) return <span style={{ fontSize: 12, color: P.mutedLight }}>N/A</span>;
  const col = barColor(c.estado);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div className="sa-cbar"><div className="sa-cfill" style={{ width: `${Math.min(c.pct ?? 0, 100)}%`, background: col }} /></div>
      <span style={{ fontSize: 12, fontWeight: 700, color: col, minWidth: 35 }}>{c.pct != null ? `${c.pct}%` : "∞"}</span>
    </div>
  );
}

function Avatar({ nombre, id, size = 38, radius = 10 }: { nombre?: string; id?: number; size?: number; radius?: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: radius, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: size * 0.37, background: AVATAR_GRAD[(id || 0) % AVATAR_GRAD.length] }}>
      {iniciales(nombre)}
    </div>
  );
}

const SA_CSS = `
.sa-app{display:flex;min-height:100vh;background:${P.bg};color:${P.fg};}
.sa-app *{box-sizing:border-box;}
.sa-side{width:240px;background:${P.dark};color:#fff;padding:24px 16px;flex-shrink:0;display:flex;flex-direction:column;position:sticky;top:0;height:100vh;}
.sa-logo{display:flex;align-items:center;gap:10px;padding:0 8px 22px;margin-bottom:12px;border-bottom:1px solid rgba(255,255,255,.08);}
.sa-logo-icon{width:34px;height:34px;border-radius:9px;background:linear-gradient(135deg,${P.accent},#60a5fa);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;font-family:'Space Grotesk',inherit;}
.sa-logo-txt{font-weight:800;font-size:16px;font-family:'Space Grotesk',inherit;}
.sa-navsec{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#64748b;font-weight:700;padding:16px 8px 8px;}
.sa-nav{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:8px;color:#94a3b8;font-size:13px;font-weight:500;cursor:pointer;transition:all .18s;margin-bottom:2px;border:none;background:transparent;width:100%;text-align:left;font-family:inherit;}
.sa-nav i{width:16px;font-size:13px;}
.sa-nav:hover{background:rgba(255,255,255,.05);color:#fff;}
.sa-nav.active{background:rgba(59,130,246,.15);color:#fff;border-left:3px solid ${P.accent};padding-left:9px;}
.sa-nav .sa-navbadge{margin-left:auto;background:${P.danger};border-radius:99px;padding:2px 8px;font-size:11px;font-weight:700;}
.sa-side-foot{margin-top:auto;padding:16px 4px 0;border-top:1px solid rgba(255,255,255,.08);}
.sa-usercard{display:flex;align-items:center;gap:10px;padding:8px;border-radius:8px;background:rgba(255,255,255,.05);cursor:pointer;transition:background .18s;}
.sa-usercard:hover{background:rgba(255,255,255,.1);}
.sa-main{flex:1;padding:32px 40px;overflow-x:hidden;}
.sa-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:26px;gap:20px;flex-wrap:wrap;}
.sa-head h1{font-size:26px;font-weight:800;letter-spacing:-.5px;margin:0 0 4px;font-family:'Space Grotesk',inherit;}
.sa-head p{color:${P.muted};font-size:14px;margin:0;}
.sa-btn-sec{background:${P.card};border:1.5px solid ${P.border};border-radius:10px;padding:10px 16px;font-family:inherit;font-weight:600;font-size:13px;color:${P.fg};cursor:pointer;transition:all .2s;display:inline-flex;align-items:center;gap:8px;}
.sa-btn-sec:hover{background:${P.borderLight};border-color:${P.accent};color:${P.accent};}
.sa-btn-pri{background:${P.accent};color:#fff;border:none;border-radius:10px;padding:10px 18px;font-family:inherit;font-weight:600;font-size:13px;cursor:pointer;transition:all .2s;display:inline-flex;align-items:center;gap:8px;box-shadow:0 4px 12px rgba(59,130,246,.25);}
.sa-btn-pri:hover{background:${P.accentDark};transform:translateY(-1px);box-shadow:0 6px 16px rgba(59,130,246,.35);}
.sa-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:26px;}
.sa-stat{background:${P.card};border:1px solid ${P.border};border-radius:14px;padding:20px;transition:all .2s;position:relative;overflow:hidden;}
.sa-stat:hover{box-shadow:0 4px 12px rgba(15,23,42,.05);transform:translateY(-2px);}
.sa-stat-icon{position:absolute;top:16px;right:16px;width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:14px;}
.sa-stat-label{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:${P.muted};font-weight:600;}
.sa-stat-value{font-size:26px;font-weight:800;margin-top:8px;letter-spacing:-.5px;font-family:'Space Grotesk',inherit;}
.sa-stat-sub{font-size:11px;font-weight:600;margin-top:6px;display:flex;align-items:center;gap:5px;}
.sa-grid{display:grid;grid-template-columns:2fr 1fr;gap:20px;align-items:start;}
.sa-cardbox{background:${P.card};border:1px solid ${P.border};border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,.04);}
.sa-cardhead{padding:18px 24px;border-bottom:1px solid ${P.border};display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;}
.sa-cardhead h3{font-size:15px;font-weight:700;margin:0;}
.sa-cardhead .meta{font-size:12px;color:${P.muted};display:flex;align-items:center;gap:8px;}
.sa-table{width:100%;border-collapse:collapse;}
.sa-table thead{background:${P.bg};}
.sa-table th{text-align:left;padding:14px 24px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:${P.muted};border-bottom:1px solid ${P.border};white-space:nowrap;}
.sa-table th.right{text-align:right;}
.sa-table td{padding:14px 24px;border-bottom:1px solid ${P.borderLight};font-size:13px;vertical-align:middle;}
.sa-table tr:last-child td{border-bottom:none;}
.sa-table tbody tr{transition:background .15s;}
.sa-table tbody tr:hover{background:${P.bg};}
.sa-company{display:flex;align-items:center;gap:12px;}
.sa-company .name{font-weight:600;color:${P.fg};font-size:13px;}
.sa-company .sub{font-size:11px;color:${P.muted};margin-top:1px;}
.sa-plan-badge{padding:4px 10px;border-radius:6px;font-size:11px;font-weight:600;background:${P.borderLight};color:${P.slateDark};}
.sa-actions{display:flex;gap:4px;justify-content:flex-end;}
.sa-abtn{width:32px;height:32px;border-radius:8px;background:transparent;border:1px solid transparent;cursor:pointer;color:${P.muted};display:flex;align-items:center;justify-content:center;transition:all .2s;}
.sa-abtn:hover{background:${P.bg};color:${P.fg};}
.sa-abtn.view:hover{background:${P.accentLight};color:${P.accent};}
.sa-abtn.pay:hover{background:${P.successLight};color:${P.successDark};}
.sa-side-card{padding:20px;}
.sa-side-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${P.muted};margin-bottom:16px;display:flex;align-items:center;gap:8px;}
.sa-side-title i{color:${P.accent};}
.sa-empty{text-align:center;padding:24px 12px;background:${P.successLight};border:1px dashed rgba(16,185,129,.3);border-radius:12px;}
.sa-empty-icon{width:48px;height:48px;border-radius:50%;background:${P.card};color:${P.success};display:flex;align-items:center;justify-content:center;font-size:20px;margin:0 auto 12px;box-shadow:0 4px 10px rgba(0,0,0,.05);}
.sa-empty h4{font-size:14px;font-weight:700;color:${P.successDark};margin:0 0 4px;}
.sa-empty p{font-size:12px;color:${P.muted};margin:0;}
.sa-qa-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
.sa-qa{background:${P.bg};border:1px solid ${P.border};border-radius:12px;padding:14px;cursor:pointer;transition:all .2s;display:flex;align-items:center;gap:10px;}
.sa-qa:hover{background:${P.card};border-color:${P.accent};box-shadow:0 4px 12px rgba(59,130,246,.1);}
.sa-qa-icon{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;}
.sa-qa-text{font-size:12px;font-weight:600;color:${P.fg};}
.sa-toolbar{background:${P.card};border:1px solid ${P.border};border-radius:14px;padding:16px 20px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;}
.sa-search{position:relative;flex:1;min-width:200px;max-width:400px;}
.sa-search input{width:100%;background:${P.bg};border:1.5px solid ${P.border};border-radius:10px;padding:10px 14px 10px 38px;font-family:inherit;font-size:13px;outline:none;transition:all .2s;}
.sa-search input:focus{border-color:${P.accent};box-shadow:0 0 0 4px rgba(59,130,246,.1);background:${P.card};}
.sa-search i{position:absolute;left:14px;top:50%;transform:translateY(-50%);color:${P.mutedLight};font-size:13px;}
.sa-sel{padding:10px 14px;border:1.5px solid ${P.border};border-radius:10px;font-size:13px;font-family:inherit;background:${P.bg};color:${P.fg};cursor:pointer;outline:none;}
.sa-switch-wrap{display:flex;align-items:center;gap:12px;padding:8px 14px;background:${P.bg};border:1px solid ${P.border};border-radius:10px;cursor:pointer;user-select:none;}
.sa-switch{position:relative;width:38px;height:22px;background:${P.border};border-radius:20px;transition:background .25s;flex-shrink:0;}
.sa-switch::after{content:'';position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;transition:all .25s cubic-bezier(.34,1.56,.64,1);box-shadow:0 1px 3px rgba(0,0,0,.2);}
.sa-switch.on{background:${P.success};}
.sa-switch.on::after{left:18px;}
.sa-switch-label{font-size:13px;font-weight:500;color:${P.muted};}
.sa-badge-ia-yes{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;background:${P.purpleLight};color:${P.purpleDark};}
.sa-badge-ia-no{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;background:${P.slateLight};color:${P.slateDark};}
.sa-code{font-size:11px;color:${P.muted};margin-top:2px;background:${P.bg};padding:2px 6px;border-radius:4px;display:inline-block;font-family:monospace;}
.sa-count-avatars{display:flex;}
.sa-count-avatars .av{width:24px;height:24px;border-radius:50%;border:2px solid ${P.card};margin-left:-8px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff;}
.sa-count-avatars .av:first-child{margin-left:0;}
.sa-tabs{display:flex;gap:4px;background:${P.bg};border:1px solid ${P.border};border-radius:10px;padding:4px;flex-wrap:wrap;}
.sa-tab{padding:8px 16px;border-radius:8px;font-size:12px;font-weight:600;color:${P.muted};cursor:pointer;transition:all .2s;display:flex;align-items:center;gap:6px;white-space:nowrap;border:none;background:transparent;font-family:inherit;}
.sa-tab:hover{color:${P.fg};}
.sa-tab.active{background:${P.card};color:${P.accentDark};box-shadow:0 1px 3px rgba(0,0,0,.05);}
.sa-tab .cnt{background:${P.border};color:${P.muted};padding:1px 7px;border-radius:10px;font-size:10px;font-weight:700;}
.sa-tab.active .cnt{background:${P.accentLight};color:${P.accentDark};}
.sa-cbar{flex:1;max-width:100px;height:6px;border-radius:3px;background:${P.borderLight};overflow:hidden;}
.sa-cfill{height:100%;border-radius:3px;transition:width .4s ease;}
.sa-abtn.edit:hover{background:${P.warningLight};color:${P.warning};}
.sa-abtn.power:hover{background:${P.dangerLight};color:${P.danger};}
.sa-fade{opacity:0;transform:translateY(15px);animation:saFade .5s ease forwards;}
@keyframes saFade{to{opacity:1;transform:translateY(0);}}
.sa-d1{animation-delay:.05s;}.sa-d2{animation-delay:.1s;}.sa-d3{animation-delay:.15s;}.sa-d4{animation-delay:.2s;}.sa-d5{animation-delay:.25s;}
@media(max-width:1024px){.sa-side{display:none;}.sa-main{padding:20px;}.sa-stats{grid-template-columns:repeat(2,1fr);}.sa-grid{grid-template-columns:1fr;}}
@media(max-width:768px){.sa-stats{grid-template-columns:1fr;}.sa-cardbox.scroll{overflow-x:auto;}}
`;

export default function Plataforma() {
  const navigate = useNavigate();
  const [vista, setVista] = useState<Vista>("dashboard");
  const [empresas, setEmpresas] = useState<any[]>([]);
  const [planes, setPlanes] = useState<any[]>([]);
  const [metricas, setMetricas] = useState<any | null>(null);
  const [vencimientos, setVencimientos] = useState<any[]>([]);
  const [detalle, setDetalle] = useState<any | null>(null);
  const [msg, setMsg] = useState("");

  const cargar = async () => {
    const [e, p, m, v] = await Promise.all([
      platformApi.get("/empresas"), platformApi.get("/planes"),
      platformApi.get("/metricas"), platformApi.get("/vencimientos?dias=7"),
    ]);
    setEmpresas(e.data); setPlanes(p.data); setMetricas(m.data); setVencimientos(v.data);
  };
  useEffect(() => { cargar(); }, []);

  const abrirDetalle = async (id: number) => {
    setMsg(""); setVista("empresas");
    setDetalle((await platformApi.get(`/empresas/${id}`)).data);
  };

  const accion = async (fn: () => Promise<any>, ok: string) => {
    setMsg("");
    try {
      await fn(); setMsg(ok); await cargar();
      if (detalle) setDetalle((await platformApi.get(`/empresas/${detalle.id}`)).data);
    } catch (err: any) {
      const d = err?.response?.data?.detail;
      setMsg(typeof d === "string" ? d : d?.mensaje || "Error en la acción");
    }
  };

  const cobrar = (id: number) => accion(() => platformApi.post(`/empresas/${id}/registrar-pago`, {}), "Pago registrado");
  const toggleEmpresa = (e: any) => e.suscripcion?.estado_efectivo === "suspendida"
    ? accion(() => platformApi.post(`/empresas/${e.id}/reactivar`, {}), "Empresa reactivada")
    : accion(() => platformApi.post(`/empresas/${e.id}/suspender`, {}), "Empresa suspendida");
  const logout = () => { localStorage.removeItem(PLATFORM_TOKEN_KEY); navigate("/plataforma/login"); };
  const irA = (v: Vista) => { setVista(v); setDetalle(null); setMsg(""); };

  /** Crea (POST) o actualiza (PUT) un plan. Devuelve true si guardó. */
  const guardarPlan = async (payload: any, id?: number): Promise<boolean> => {
    setMsg("");
    try {
      if (id) await platformApi.put(`/planes/${id}`, payload);
      else await platformApi.post("/planes", payload);
      setMsg(id ? "Plan actualizado" : "Plan creado");
      await cargar();
      return true;
    } catch (err: any) {
      const d = err?.response?.data?.detail;
      setMsg(typeof d === "string" ? d : d?.mensaje || "No se pudo guardar el plan");
      return false;
    }
  };

  const nav: { id: Vista; label: string; icon: string; badge?: number; sec: string }[] = [
    { id: "dashboard", label: "Dashboard", icon: "fa-grip", sec: "Principal" },
    { id: "empresas", label: "Empresas", icon: "fa-building", sec: "Principal" },
    { id: "vencimientos", label: "Vencimientos", icon: "fa-hand-holding-dollar", badge: vencimientos.length || undefined, sec: "Principal" },
    { id: "planes", label: "Planes", icon: "fa-tags", sec: "Administración" },
  ];
  const secciones = ["Principal", "Administración"];

  const META: Record<Vista, { titulo: string; sub: string }> = {
    dashboard: { titulo: "Dashboard", sub: "Resumen general de la plataforma y estado de tus negocios" },
    empresas: { titulo: "Empresas", sub: "Administra las empresas registradas en la plataforma" },
    vencimientos: { titulo: "Vencimientos", sub: "Suscripciones próximas a vencer y cobros pendientes" },
    planes: { titulo: "Planes", sub: "Administra las suscripciones disponibles para las empresas" },
  };
  const head = detalle ? { titulo: detalle.nombre, sub: "Detalle de la empresa y su suscripción" } : META[vista];

  return (
    <div className="sa-app">
      <style>{SA_CSS}</style>
      <aside className="sa-side">
        <div className="sa-logo">
          <div className="sa-logo-icon">g</div>
          <div className="sa-logo-txt">gsiker</div>
        </div>
        {secciones.map((sec) => (
          <div key={sec}>
            <div className="sa-navsec">{sec}</div>
            {nav.filter((n) => n.sec === sec).map((n) => {
              const active = vista === n.id && !detalle;
              return (
                <button key={n.id} className={`sa-nav${active ? " active" : ""}`} onClick={() => irA(n.id)}>
                  <i className={`fa-solid ${n.icon}`} /><span>{n.label}</span>
                  {n.badge != null && <span className="sa-navbadge">{n.badge}</span>}
                </button>
              );
            })}
          </div>
        ))}
        <div className="sa-side-foot">
          <div className="sa-usercard" onClick={logout} title="Cerrar sesión">
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg,#f59e0b,#d97706)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12, color: "#fff" }}>SA</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>SuperAdmin</div>
              <div style={{ fontSize: 10, color: "#94a3b8" }}>Acceso total</div>
            </div>
            <i className="fa-solid fa-right-from-bracket" style={{ color: "#94a3b8", fontSize: 13 }} />
          </div>
        </div>
      </aside>

      <main className="sa-main">
        <div className="sa-head">
          <div>
            <h1>{head.titulo}</h1>
            <p>{head.sub}</p>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <button className="sa-btn-sec" onClick={() => cargar()}><i className="fa-solid fa-rotate" /><span>Refrescar</span></button>
            <button className="sa-btn-sec" onClick={logout}><i className="fa-solid fa-user-shield" style={{ color: P.accent }} /><span>Salir</span></button>
          </div>
        </div>

        {msg && <div style={{ background: P.accentLight, color: P.accentDark, padding: "10px 14px", borderRadius: 10, marginBottom: 16, fontSize: 13, fontWeight: 500 }}>{msg}</div>}

        {detalle ? (
          <DetalleEmpresa detalle={detalle} planes={planes} onBack={() => setDetalle(null)} accion={accion} />
        ) : vista === "dashboard" ? (
          <Dashboard metricas={metricas} empresas={empresas} vencimientos={vencimientos} onVer={abrirDetalle} onCobrar={cobrar} onNav={irA} />
        ) : vista === "empresas" ? (
          <EmpresasView empresas={empresas} onVer={abrirDetalle} onToggle={toggleEmpresa} />
        ) : vista === "vencimientos" ? (
          <Vencimientos onCobrar={cobrar} onVer={abrirDetalle} empresas={empresas} />
        ) : (
          <PlanesLista planes={planes} empresas={empresas} onGuardar={guardarPlan} />
        )}
      </main>
    </div>
  );
}

/* ------------------------------ DASHBOARD ------------------------------ */
function Dashboard({ metricas, empresas, vencimientos, onVer, onCobrar, onNav }: any) {
  const n = metricas?.negocios || {};
  const altasPct = metricas?.altas_delta_pct;
  const costoIa = metricas?.costo_ia_mes_usd ?? 0;
  const stats = [
    { icon: "fa-store", bg: P.accentLight, color: P.accent, label: "Negocios activos", value: n.activa ?? "—",
      sub: `${n.trial || 0} en trial · ${n.suspendida || 0} suspendidos`, subColor: P.mutedLight, subIcon: "fa-layer-group" },
    { icon: "fa-dollar-sign", bg: P.successLight, color: P.success, label: "MRR estimado", value: fmtQ(metricas?.mrr),
      sub: "Ingreso recurrente mensual", subColor: P.successDark, subIcon: "fa-arrow-trend-up" },
    { icon: "fa-user-plus", bg: P.purpleLight, color: P.purple, label: "Altas del mes", value: metricas?.altas_mes ?? "—",
      sub: altasPct != null ? `${altasPct >= 0 ? "+" : ""}${altasPct}% vs mes anterior` : "sin datos previos",
      subColor: altasPct != null && altasPct >= 0 ? P.successDark : P.mutedLight, subIcon: altasPct != null ? (altasPct >= 0 ? "fa-arrow-up" : "fa-arrow-down") : "fa-minus" },
    { icon: "fa-microchip", bg: P.warningLight, color: P.warning, label: "Costo IA (mes)", value: `$ ${costoIa.toFixed(2)}`,
      sub: costoIa === 0 ? "Dentro del free tier" : "Consumo agregado tenants", subColor: costoIa === 0 ? P.successDark : P.mutedLight, subIcon: costoIa === 0 ? "fa-check" : "fa-gauge" },
  ];
  return (
    <>
      <div className="sa-stats">
        {stats.map((s, i) => (
          <div key={s.label} className={`sa-stat sa-fade sa-d${i + 1}`}>
            <div className="sa-stat-icon" style={{ background: s.bg, color: s.color }}><i className={`fa-solid ${s.icon}`} /></div>
            <div className="sa-stat-label">{s.label}</div>
            <div className="sa-stat-value">{s.value}</div>
            <div className="sa-stat-sub" style={{ color: s.subColor }}><i className={`fa-solid ${s.subIcon}`} />{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="sa-grid">
        <div className="sa-cardbox scroll sa-fade sa-d5">
          <div className="sa-cardhead">
            <h3>Empresas</h3>
            <span className="meta"><i className="fa-solid fa-building" /><span>{empresas.length} registradas</span></span>
          </div>
          <TablaEmpresas empresas={empresas.slice(0, 8)} onVer={onVer} onCobrar={onCobrar} />
          {empresas.length > 8 && (
            <div style={{ padding: "14px 24px", borderTop: `1px solid ${P.border}`, textAlign: "right" }}>
              <button className="sa-btn-sec" onClick={() => onNav("empresas")}>Ver todas <i className="fa-solid fa-arrow-right" /></button>
            </div>
          )}
        </div>

        <div className="sa-fade sa-d5">
          <div className="sa-cardbox" style={{ marginBottom: 20 }}>
            <div className="sa-side-card">
              <div className="sa-side-title"><i className="fa-solid fa-cash-register" /><span>Cola de cobro</span></div>
              {vencimientos.length === 0 ? (
                <div className="sa-empty">
                  <div className="sa-empty-icon"><i className="fa-solid fa-circle-check" /></div>
                  <h4>¡Todo al día!</h4>
                  <p>No hay cobros pendientes en 7 días.</p>
                </div>
              ) : (
                vencimientos.map((v: any, i: number) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: i < vencimientos.length - 1 ? `1px solid ${P.borderLight}` : "none" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Avatar nombre={v.empresa} id={v.empresa_id} size={32} radius={8} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{v.empresa}</div>
                        <div style={{ fontSize: 11, color: v.vencida ? P.danger : P.muted, fontWeight: v.vencida ? 600 : 400 }}>{v.vencida ? "Vencido" : "Vence"} {fmtFecha(v.vence)}</div>
                      </div>
                    </div>
                    <button className={v.vencida ? "sa-btn-pri" : "sa-btn-sec"} style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => onCobrar(v.empresa_id)}>Cobrar</button>
                  </div>
                ))
              )}
              <button className="sa-btn-sec" style={{ width: "100%", justifyContent: "center", marginTop: 16 }} onClick={() => onNav("vencimientos")}>
                <i className="fa-solid fa-list-check" /><span>Ver vencimientos</span>
              </button>
            </div>
          </div>

          <div className="sa-cardbox">
            <div className="sa-side-card">
              <div className="sa-side-title"><i className="fa-solid fa-bolt" /><span>Accesos rápidos</span></div>
              <div className="sa-qa-grid">
                {[
                  { icon: "fa-tags", bg: P.purpleLight, color: P.purple, text: "Ver planes", to: "planes" as Vista },
                  { icon: "fa-building", bg: P.accentLight, color: P.accent, text: "Empresas", to: "empresas" as Vista },
                  { icon: "fa-hand-holding-dollar", bg: P.successLight, color: P.success, text: "Cobranza", to: "vencimientos" as Vista },
                  { icon: "fa-rotate", bg: P.warningLight, color: P.warning, text: "Refrescar", to: "dashboard" as Vista },
                ].map((q) => (
                  <div key={q.text} className="sa-qa" onClick={() => onNav(q.to)}>
                    <div className="sa-qa-icon" style={{ background: q.bg, color: q.color }}><i className={`fa-solid ${q.icon}`} /></div>
                    <div className="sa-qa-text">{q.text}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* --------------------------- TABLA EMPRESAS --------------------------- */
function TablaEmpresas({ empresas, onVer, onCobrar }: any) {
  return (
    <table className="sa-table">
      <thead><tr><th>Empresa</th><th>Plan</th><th>Estado</th><th className="right">MRR</th><th>Consumo IA</th><th className="right">Acciones</th></tr></thead>
      <tbody>
        {empresas.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", padding: 40, color: P.mutedLight }}>Sin empresas registradas</td></tr>}
        {empresas.map((e: any) => {
          const c = e.consumo_ia;
          const mrr = mrrEmpresa(e);
          return (
            <tr key={e.id} style={{ cursor: "pointer" }} onClick={() => onVer(e.id)}>
              <td>
                <div className="sa-company">
                  <Avatar nombre={e.nombre} id={e.id} />
                  <div><div className="name">{e.nombre}</div><div className="sub">#{e.id}</div></div>
                </div>
              </td>
              <td><span className="sa-plan-badge">{e.plan || "—"}</span></td>
              <td><Badge estado={e.suscripcion?.estado_efectivo} /></td>
              <td className="right">
                {mrr > 0 ? <span style={{ color: P.successDark, fontWeight: 700 }}>{fmtQ(mrr)}</span> : <span style={{ color: P.muted }}>{fmtQ(0)}</span>}
              </td>
              <td>
                {c ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 70, height: 6, background: P.border, borderRadius: 99, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.min(c.pct ?? 0, 100)}%`, background: barColor(c.estado) }} />
                    </div>
                    <span style={{ fontSize: 12, color: barColor(c.estado), fontWeight: 600 }}>{c.pct != null ? `${c.pct}%` : "∞"}</span>
                  </div>
                ) : <span style={{ fontSize: 12, color: P.mutedLight }}>N/A</span>}
              </td>
              <td className="right">
                <div className="sa-actions">
                  <button className="sa-abtn view" title="Ver detalle" onClick={(ev) => { ev.stopPropagation(); onVer(e.id); }}><i className="fa-solid fa-eye" /></button>
                  <button className="sa-abtn pay" title="Registrar pago" onClick={(ev) => { ev.stopPropagation(); onCobrar(e.id); }}><i className="fa-solid fa-money-bill" /></button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* --------------------------- EMPRESAS (full) -------------------------- */
function EmpresasView({ empresas, onVer, onToggle }: any) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("all");
  const cnt = (est: string) => empresas.filter((e: any) => e.suscripcion?.estado_efectivo === est).length;
  const conIa = empresas.filter((e: any) => e.consumo_ia && e.consumo_ia.pct != null);
  const promIa = conIa.length ? Math.round(conIa.reduce((a: number, e: any) => a + e.consumo_ia.pct, 0) / conIa.length) : null;
  const activas = cnt("activa");
  const stats: Stat[] = [
    { icon: "fa-building", bg: P.accentLight, color: P.accent, label: "Total empresas", value: empresas.length, sub: "en la plataforma", subIcon: "fa-database" },
    { icon: "fa-circle-check", bg: P.successLight, color: P.success, label: "Activas", value: activas, valueColor: P.success, sub: `${empresas.length ? Math.round((activas / empresas.length) * 100) : 0}% del total`, subIcon: "fa-percent" },
    { icon: "fa-clock", bg: P.warningLight, color: P.warning, label: "En trial", value: cnt("trial"), valueColor: P.warning, sub: "en prueba", subIcon: "fa-hourglass-half" },
    { icon: "fa-microchip", bg: P.purpleLight, color: P.purple, label: "Consumo IA prom.", value: promIa != null ? `${promIa}%` : "—", valueColor: P.purple, sub: promIa == null || promIa < 80 ? "Dentro del límite" : "Cerca del límite", subIcon: "fa-check" },
  ];
  const tabs = [
    { id: "all", label: "Todos", count: empresas.length },
    { id: "activa", label: "Activas", count: activas },
    { id: "trial", label: "Trial", count: cnt("trial") },
    { id: "suspendida", label: "Suspendidas", count: cnt("suspendida") },
  ];
  const filtradas = useMemo(() => empresas.filter((e: any) => {
    const okQ = !q || e.nombre.toLowerCase().includes(q.toLowerCase());
    const okT = tab === "all" || e.suscripcion?.estado_efectivo === tab;
    return okQ && okT;
  }), [empresas, q, tab]);

  return (
    <>
      <div className="sa-stats">{stats.map((s, i) => <StatCard key={s.label} s={s} i={i} />)}</div>
      <div className="sa-toolbar sa-fade sa-d5">
        <div className="sa-search">
          <i className="fa-solid fa-magnifying-glass" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar empresa por nombre…" />
        </div>
        <div className="sa-tabs">
          {tabs.map((t) => (
            <button key={t.id} className={`sa-tab${tab === t.id ? " active" : ""}`} onClick={() => setTab(t.id)}>
              <span>{t.label}</span><span className="cnt">{t.count}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="sa-cardbox scroll sa-fade sa-d5">
        <div className="sa-cardhead">
          <h3>Listado de Empresas</h3>
          <span className="meta"><i className="fa-solid fa-database" /><span>Mostrando {filtradas.length} empresas</span></span>
        </div>
        <table className="sa-table">
          <thead><tr><th>Empresa</th><th>Plan</th><th>Estado</th><th>Consumo IA</th><th>Vencimiento</th><th className="right">Acciones</th></tr></thead>
          <tbody>
            {filtradas.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", padding: 40, color: P.mutedLight }}>
              <i className="fa-solid fa-building-circle-exclamation" style={{ fontSize: 30, marginBottom: 8, display: "block" }} />No se encontraron empresas con estos criterios
            </td></tr>}
            {filtradas.map((e: any) => {
              const venc = vencEmpresa(e);
              const vencido = venc ? diasHasta(venc) < 0 : false;
              const suspendida = e.suscripcion?.estado_efectivo === "suspendida";
              return (
                <tr key={e.id} style={{ cursor: "pointer" }} onClick={() => onVer(e.id)}>
                  <td><div className="sa-company"><Avatar nombre={e.nombre} id={e.id} radius={10} /><div><div className="name">{e.nombre}</div><div className="sub">#{e.id}</div></div></div></td>
                  <td><span className="sa-plan-badge">{e.plan || "—"}</span></td>
                  <td><Badge estado={e.suscripcion?.estado_efectivo} /></td>
                  <td><ConsumoBar c={e.consumo_ia} /></td>
                  <td><span style={{ fontSize: 13, fontWeight: 500, color: vencido ? P.dangerDark : P.fg }}>{fmtFecha(venc)}</span></td>
                  <td className="right">
                    <div className="sa-actions">
                      <button className="sa-abtn view" title="Ver detalle" onClick={(ev) => { ev.stopPropagation(); onVer(e.id); }}><i className="fa-solid fa-eye" /></button>
                      <button className="sa-abtn edit" title="Gestionar" onClick={(ev) => { ev.stopPropagation(); onVer(e.id); }}><i className="fa-solid fa-pen" /></button>
                      <button className="sa-abtn power" title={suspendida ? "Reactivar" : "Suspender"} onClick={(ev) => { ev.stopPropagation(); onToggle(e); }}><i className="fa-solid fa-power-off" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ------------------------------ VENCIMIENTOS -------------------------- */
function Vencimientos({ onCobrar, onVer, empresas }: { onCobrar: (id: number) => void; onVer: (id: number) => void; empresas: any[] }) {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("all");
  useEffect(() => { platformApi.get(`/vencimientos?dias=15`).then((r) => setRows(r.data)); }, []);

  const empresaDe = (id: number) => empresas.find((e) => e.id === id);
  const datos = useMemo(() => rows.map((r) => {
    const e = empresaDe(r.empresa_id);
    return { ...r, dias: diasHasta(r.vence), monto: Number(e?.suscripcion?.precio || 0), plan: e?.plan };
  }), [rows, empresas]);

  const hoyN = datos.filter((r) => r.dias === 0).length;
  const proxN = datos.filter((r) => r.dias > 0 && r.dias <= 15).length;
  const vencN = datos.filter((r) => r.dias < 0).length;
  const cobranza = datos.filter((r) => r.dias >= 0 && r.dias <= 15).reduce((a, r) => a + r.monto, 0);
  const stats: Stat[] = [
    { icon: "fa-calendar-day", bg: P.accentLight, color: P.accent, label: "Vencen hoy", value: hoyN, valueColor: P.accent, sub: "Requiere cobro hoy", subIcon: "fa-bell" },
    { icon: "fa-hourglass-half", bg: P.warningLight, color: P.warning, label: "Próximos 15 días", value: proxN, valueColor: P.warning, sub: "Programar cobros", subIcon: "fa-clock" },
    { icon: "fa-triangle-exclamation", bg: P.dangerLight, color: P.danger, label: "Vencidos", value: vencN, valueColor: P.danger, sub: "Suspender servicios", subColor: P.dangerDark, subIcon: "fa-exclamation" },
    { icon: "fa-sack-dollar", bg: P.successLight, color: P.success, label: "Cobranza estimada", value: `Q ${Math.round(cobranza).toLocaleString("es-GT")}`, valueColor: P.success, sub: "Próximos 15 días", subColor: P.successDark, subIcon: "fa-arrow-up" },
  ];
  const tabs = [
    { id: "all", label: "Todos", count: datos.length },
    { id: "hoy", label: "Hoy", count: hoyN },
    { id: "prox", label: "Próx 15 días", count: proxN },
    { id: "venc", label: "Vencidos", count: vencN },
  ];
  const filtradas = datos.filter((r) => {
    const okQ = !q || (r.empresa || "").toLowerCase().includes(q.toLowerCase());
    const okT = tab === "all" || (tab === "hoy" && r.dias === 0) || (tab === "prox" && r.dias > 0 && r.dias <= 15) || (tab === "venc" && r.dias < 0);
    return okQ && okT;
  });

  const relLabel = (d: number) => d < 0 ? `Vencido hace ${Math.abs(d)} días` : d === 0 ? "Vence hoy" : `En ${d} días`;
  const relColor = (d: number) => d <= 0 ? P.dangerDark : d <= 15 ? P.warningDark : P.muted;

  return (
    <>
      <div className="sa-stats">{stats.map((s, i) => <StatCard key={s.label} s={s} i={i} />)}</div>
      <div className="sa-toolbar sa-fade sa-d5">
        <div className="sa-search">
          <i className="fa-solid fa-magnifying-glass" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar empresa…" />
        </div>
        <div className="sa-tabs">
          {tabs.map((t) => (
            <button key={t.id} className={`sa-tab${tab === t.id ? " active" : ""}`} onClick={() => setTab(t.id)}>
              <span>{t.label}</span><span className="cnt">{t.count}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="sa-cardbox scroll sa-fade sa-d5">
        <div className="sa-cardhead">
          <h3>Cobranza Programada</h3>
          <span className="meta"><i className="fa-solid fa-database" /><span>Corte: {fmtFecha(new Date().toISOString())}</span></span>
        </div>
        <table className="sa-table">
          <thead><tr><th>Empresa</th><th>Plan</th><th>Estado</th><th>Vencimiento</th><th className="right">Monto</th><th className="right">Acción</th></tr></thead>
          <tbody>
            {filtradas.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", padding: 40, color: P.mutedLight }}>
              <i className="fa-solid fa-calendar-check" style={{ fontSize: 30, marginBottom: 8, display: "block" }} />No hay vencimientos en este rango
            </td></tr>}
            {filtradas.map((r, i) => {
              const overdue = r.dias < 0;
              return (
                <tr key={i} style={{ background: overdue ? P.dangerLight : undefined, cursor: "pointer" }} onClick={() => onVer(r.empresa_id)}>
                  <td><div className="sa-company"><Avatar nombre={r.empresa} id={r.empresa_id} radius={10} /><div className="name">{r.empresa}</div></div></td>
                  <td><span className="sa-plan-badge">{r.plan || "—"}</span></td>
                  <td><Badge estado={r.estado_efectivo} /></td>
                  <td>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{fmtFecha(r.vence)}</div>
                    <div style={{ fontSize: 11, marginTop: 2, fontWeight: 600, color: relColor(r.dias) }}>{relLabel(r.dias)}</div>
                  </td>
                  <td className="right"><span style={{ fontSize: 15, fontWeight: 800 }}>{fmtQ(r.monto)}</span></td>
                  <td className="right">
                    <button onClick={(ev) => { ev.stopPropagation(); onCobrar(r.empresa_id); }}
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "none", borderRadius: 8, padding: "8px 14px", fontFamily: "inherit", fontWeight: 600, fontSize: 12, cursor: "pointer", color: "#fff",
                        background: overdue ? P.danger : P.success, boxShadow: `0 2px 8px ${overdue ? "rgba(239,68,68,.2)" : "rgba(16,185,129,.2)"}` }}>
                      <i className="fa-solid fa-hand-holding-dollar" />{overdue ? "Cobro vencido" : "Cobrar"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* -------------------------------- PLANES ------------------------------ */
function PlanesLista({ planes, empresas, onGuardar }: { planes: any[]; empresas: any[]; onGuardar: (payload: any, id?: number) => Promise<boolean> }) {
  const [q, setQ] = useState("");
  const [verInactivos, setVerInactivos] = useState(false);
  const [editando, setEditando] = useState<any | "nuevo" | null>(null);
  const lista = useMemo(() => planes.filter((p) => {
    const okA = verInactivos || p.activo;
    const okQ = !q || p.nombre.toLowerCase().includes(q.toLowerCase()) || (p.codigo || "").toLowerCase().includes(q.toLowerCase());
    return okA && okQ;
  }), [planes, q, verInactivos]);
  const empresasDe = (p: any) => empresas.filter((e) => e.suscripcion?.plan_id === p.id);
  const activos = planes.filter((p) => p.activo).length;
  const toggleActivo = (p: any) => onGuardar({ activo: !p.activo }, p.id);

  return (
    <>
      <div className="sa-toolbar sa-fade sa-d1">
        <div className="sa-search">
          <i className="fa-solid fa-magnifying-glass" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o código de plan…" />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div className="sa-switch-wrap" onClick={() => setVerInactivos((v) => !v)}>
            <div className={`sa-switch${verInactivos ? " on" : ""}`} />
            <span className="sa-switch-label">Mostrar archivados</span>
          </div>
          <button className="sa-btn-pri" onClick={() => setEditando("nuevo")}><i className="fa-solid fa-plus" /><span>Nuevo Plan</span></button>
        </div>
      </div>

      <div className="sa-cardbox scroll sa-fade sa-d2">
        <div className="sa-cardhead">
          <h3>Listado de Planes</h3>
          <span className="meta"><i className="fa-solid fa-tags" /><span>{activos} activos</span></span>
        </div>
        <table className="sa-table">
          <thead><tr><th>Plan</th><th>Precio</th><th>IA incluida</th><th>Empresas</th><th>Estado</th><th className="right">Acciones</th></tr></thead>
          <tbody>
            {lista.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: 40, color: P.mutedLight }}>
                <i className="fa-solid fa-box-open" style={{ fontSize: 30, marginBottom: 8, display: "block" }} />No se encontraron planes con estos criterios
              </td></tr>
            )}
            {lista.map((p) => {
              const st = planIcono(p.codigo);
              const tieneIa = !!p.limites?.modulos?.includes?.("ia");
              const emp = empresasDe(p);
              return (
                <tr key={p.id} style={{ cursor: "pointer" }} onClick={() => setEditando(p)} title="Editar plan">
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{ width: 42, height: 42, borderRadius: 12, background: st.grad, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 16, flexShrink: 0, boxShadow: "0 4px 10px rgba(0,0,0,.06)" }}>
                        <i className={`fa-solid ${st.icon}`} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{p.nombre}{p.es_personalizado ? <span style={{ fontSize: 11, color: P.mutedLight, fontWeight: 500 }}> · a medida</span> : null}</div>
                        <span className="sa-code">{p.codigo}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span style={{ fontSize: 16, fontWeight: 800 }}>{fmtQ(p.precio)}</span>
                    <span style={{ fontSize: 12, color: P.muted, fontWeight: 500 }}>/{p.intervalo}</span>
                  </td>
                  <td>{tieneIa
                    ? <span className="sa-badge-ia-yes"><i className="fa-solid fa-check" /> Incluida</span>
                    : <span className="sa-badge-ia-no"><i className="fa-solid fa-minus" /> No incluida</span>}</td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div className="sa-count-avatars">
                        {emp.slice(0, 2).map((e, idx) => (
                          <div key={e.id} className="av" style={{ background: AVATAR_GRAD[(e.id ?? idx) % AVATAR_GRAD.length] }}>{iniciales(e.nombre)}</div>
                        ))}
                        {emp.length > 2 && <div className="av" style={{ background: P.slate }}>+{emp.length - 2}</div>}
                      </div>
                      <span style={{ fontWeight: 700, fontSize: 13, marginLeft: emp.length ? 4 : 0 }}>{emp.length}</span>
                    </div>
                  </td>
                  <td>{p.activo
                    ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: P.successLight, color: P.successDark }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />Activo</span>
                    : <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: P.slateLight, color: P.slateDark }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />Archivado</span>}</td>
                  <td className="right">
                    <div className="sa-actions">
                      <button className="sa-abtn view" title="Editar" onClick={(ev) => { ev.stopPropagation(); setEditando(p); }}><i className="fa-solid fa-pen" /></button>
                      <button className="sa-abtn" title={p.activo ? "Archivar" : "Activar"} onClick={(ev) => { ev.stopPropagation(); toggleActivo(p); }}>
                        <i className={`fa-solid ${p.activo ? "fa-box-archive" : "fa-rotate-left"}`} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editando && (
        <PlanEditor
          plan={editando === "nuevo" ? null : editando}
          onClose={() => setEditando(null)}
          onGuardar={async (payload, id) => { const ok = await onGuardar(payload, id); if (ok) setEditando(null); }}
        />
      )}
    </>
  );
}

/* --------------------------- EDITOR DE PLAN --------------------------- */
const MODULOS_EDITABLES = ["pos", "inventario", "compras", "ventas", "cobranza"];

function PlanEditor({ plan, onClose, onGuardar }: { plan: any | null; onClose: () => void; onGuardar: (payload: any, id?: number) => Promise<void> }) {
  const lim = plan?.limites || {};
  const [nombre, setNombre] = useState(plan?.nombre || "");
  const [descripcion, setDescripcion] = useState(plan?.descripcion || "");
  const [precio, setPrecio] = useState<string>(plan ? String(plan.precio ?? 0) : "0");
  const [moneda, setMoneda] = useState(plan?.moneda || "GTQ");
  const [intervalo, setIntervalo] = useState(plan?.intervalo || "mensual");
  const [activo, setActivo] = useState(plan ? !!plan.activo : true);
  const [usuarios, setUsuarios] = useState<string>(lim.usuarios == null ? "" : String(lim.usuarios));
  const [modulos, setModulos] = useState<string[]>((lim.modulos || []).filter((m: string) => m !== "ia"));
  const [iaOn, setIaOn] = useState<boolean>(!!(lim.modulos || []).includes("ia"));
  const [reqLim, setReqLim] = useState<string>(lim.ia?.requests?.limite == null ? "" : String(lim.ia.requests.limite));
  const [tokLim, setTokLim] = useState<string>(lim.ia?.tokens?.limite == null ? "" : String(lim.ia.tokens.limite));
  const [guardando, setGuardando] = useState(false);
  const esNuevo = !plan;

  const toggleMod = (m: string) => setModulos((prev) => prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]);

  const guardar = async () => {
    if (!nombre.trim()) return;
    const modsFinal = iaOn ? [...new Set([...modulos, "ia"])] : modulos;
    const limites: any = {
      usuarios: usuarios === "" ? null : Number(usuarios),
      registros: lim.registros || {},
      modulos: modsFinal,
      ia: iaOn ? {
        requests: { limite: reqLim === "" ? null : Number(reqLim), al_exceder: lim.ia?.requests?.al_exceder || "bloquear" },
        tokens: { limite: tokLim === "" ? null : Number(tokLim), al_exceder: lim.ia?.tokens?.al_exceder || "bloquear" },
      } : null,
      umbral_alerta: lim.umbral_alerta ?? 0.8,
    };
    const base: any = { nombre: nombre.trim(), descripcion: descripcion || null, precio: Number(precio) || 0, moneda, intervalo, limites };
    setGuardando(true);
    if (esNuevo) await onGuardar({ ...base, es_personalizado: false }, undefined);
    else await onGuardar({ ...base, activo }, plan.id);
    setGuardando(false);
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", backdropFilter: "blur(2px)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(460px, 100%)", height: "100%", background: P.card, boxShadow: "-10px 0 40px rgba(0,0,0,.15)", display: "flex", flexDirection: "column", animation: "saSlide .25s ease" }}>
        <style>{`@keyframes saSlide{from{transform:translateX(30px);opacity:.4}to{transform:translateX(0);opacity:1}}`}</style>
        <div style={{ padding: "20px 24px", borderBottom: `1px solid ${P.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, fontFamily: "'Space Grotesk',inherit" }}>{esNuevo ? "Nuevo Plan" : "Editar Plan"}</div>
            {!esNuevo && <span className="sa-code" style={{ marginTop: 4 }}>{plan.codigo}</span>}
          </div>
          <button className="sa-abtn" onClick={onClose}><i className="fa-solid fa-xmark" /></button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          <Campo label="Nombre">
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="sa-sel" style={{ width: "100%" }} placeholder="Ej. Pro" />
          </Campo>
          <Campo label="Descripción">
            <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className="sa-sel" style={{ width: "100%", minHeight: 60, resize: "vertical", fontFamily: "inherit" }} placeholder="Breve descripción del plan" />
          </Campo>
          <div style={{ display: "flex", gap: 12 }}>
            <Campo label="Precio" style={{ flex: 1 }}>
              <input type="number" value={precio} onChange={(e) => setPrecio(e.target.value)} className="sa-sel" style={{ width: "100%" }} />
            </Campo>
            <Campo label="Moneda">
              <select value={moneda} onChange={(e) => setMoneda(e.target.value)} className="sa-sel"><option value="GTQ">GTQ</option><option value="USD">USD</option></select>
            </Campo>
            <Campo label="Intervalo">
              <select value={intervalo} onChange={(e) => setIntervalo(e.target.value)} className="sa-sel"><option value="mensual">Mensual</option><option value="anual">Anual</option></select>
            </Campo>
          </div>
          <Campo label="Límite de usuarios (vacío = ilimitado)">
            <input type="number" value={usuarios} onChange={(e) => setUsuarios(e.target.value)} className="sa-sel" style={{ width: "100%" }} placeholder="∞" />
          </Campo>

          <Campo label="Módulos incluidos">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {MODULOS_EDITABLES.map((m) => {
                const on = modulos.includes(m);
                return (
                  <button key={m} onClick={() => toggleMod(m)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 99, cursor: "pointer", fontSize: 13, fontWeight: 600, border: `1px solid ${on ? P.accent : "#cbd5e1"}`, background: on ? P.accent : "#fff", color: on ? "#fff" : P.slateDark }}>
                    <i className={`fa-solid ${on ? "fa-check" : "fa-plus"}`} style={{ fontSize: 11 }} />{MODULO_LABEL[m] || m}
                  </button>
                );
              })}
            </div>
          </Campo>

          <div style={{ border: `1px solid ${P.border}`, borderRadius: 12, padding: 14 }}>
            <div className="sa-switch-wrap" style={{ border: "none", background: "transparent", padding: 0, marginBottom: iaOn ? 12 : 0 }} onClick={() => setIaOn((v) => !v)}>
              <div className={`sa-switch${iaOn ? " on" : ""}`} />
              <span className="sa-switch-label" style={{ color: P.fg, fontWeight: 600 }}>Incluir Asistente IA</span>
            </div>
            {iaOn && (
              <div style={{ display: "flex", gap: 12 }}>
                <Campo label="Requests / período" style={{ flex: 1 }}>
                  <input type="number" value={reqLim} onChange={(e) => setReqLim(e.target.value)} className="sa-sel" style={{ width: "100%" }} placeholder="∞" />
                </Campo>
                <Campo label="Tokens / período" style={{ flex: 1 }}>
                  <input type="number" value={tokLim} onChange={(e) => setTokLim(e.target.value)} className="sa-sel" style={{ width: "100%" }} placeholder="∞" />
                </Campo>
              </div>
            )}
          </div>

          {!esNuevo && (
            <div className="sa-switch-wrap" onClick={() => setActivo((v) => !v)}>
              <div className={`sa-switch${activo ? " on" : ""}`} />
              <span className="sa-switch-label" style={{ color: P.fg, fontWeight: 600 }}>Plan activo (visible para asignar)</span>
            </div>
          )}
        </div>

        <div style={{ padding: "16px 24px", borderTop: `1px solid ${P.border}`, display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="sa-btn-sec" onClick={onClose}>Cancelar</button>
          <button className="sa-btn-pri" disabled={!nombre.trim() || guardando} onClick={guardar} style={{ opacity: !nombre.trim() || guardando ? 0.6 : 1 }}>
            <i className={`fa-solid ${guardando ? "fa-spinner fa-spin" : "fa-check"}`} /><span>{esNuevo ? "Crear plan" : "Guardar cambios"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function Campo({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={style}>
      <label style={{ display: "block", fontSize: 12, color: P.muted, marginBottom: 5, fontWeight: 600 }}>{label}</label>
      {children}
    </div>
  );
}

/* ---------------------------- DETALLE (reuse) ------------------------- */
function DetalleEmpresa({ detalle, planes, onBack, accion }: any) {
  const [planId, setPlanId] = useState<number | "">("");
  const [dias, setDias] = useState(15);
  const [credR, setCredR] = useState(0);
  const [credT, setCredT] = useState(0);
  const s = detalle.suscripcion;
  const cv = detalle.consumo_vigente;
  const limIa = detalle.limites?.ia;
  const cambiar = (confirmar: boolean) => accion(
    () => platformApi.post(`/empresas/${detalle.id}/cambiar-plan${confirmar ? "?confirmar=true" : ""}`, { plan_id: planId }),
    "Plan actualizado");
  return (
    <div>
      <button className="sa-btn-sec" style={{ marginBottom: 16 }} onClick={onBack}><i className="fa-solid fa-arrow-left" /> Volver</button>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        <div style={detCard}>
          <h3 style={h3}>Suscripción</h3>
          <Row k="Estado" v={<Badge estado={s?.estado_efectivo} />} />
          <Row k="Estado base" v={s?.estado_base} />
          <Row k="Precio" v={s ? `${fmtQ(s.precio)}/${s.intervalo}` : "—"} />
          <Row k="Fin de prueba" v={fmtFecha(s?.fin_trial)} />
          <Row k="Vigente hasta" v={fmtFecha(s?.vigente_hasta)} />
        </div>
        <div style={detCard}>
          <h3 style={h3}>Consumo IA (período)</h3>
          {limIa ? (<>
            <Row k="Requests" v={`${cv?.requests_usados || 0} / ${limIa?.requests?.limite ?? "∞"}`} />
            <Row k="Tokens" v={`${cv?.tokens_usados || 0} / ${limIa?.tokens?.limite ?? "∞"}`} />
            <Row k="Costo estimado" v={`$${(cv?.costo_usd || 0).toFixed(4)} USD`} />
            <Row k="Crédito extra" v={`${cv?.credito_extra_requests || 0} req · ${cv?.credito_extra_tokens || 0} tok`} />
          </>) : <div style={{ color: P.mutedLight, fontSize: 13 }}>Este plan no incluye IA.</div>}
        </div>
      </div>
      <div style={{ ...detCard, marginTop: 16 }}>
        <h3 style={h3}>Módulos de la empresa</h3>
        <p style={{ fontSize: 12, color: P.muted, margin: "-4px 0 10px" }}>
          Lo que esta empresa puede usar (override sobre el plan). Los operadores solo pueden ver, como mucho, estos módulos.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {(detalle.modulos_disponibles || []).map((m: string) => {
            const activos: string[] = detalle.modulos_efectivos || [];
            const on = activos.includes(m);
            const nuevo = on ? activos.filter((x) => x !== m) : [...activos, m];
            return (
              <button key={m} onClick={() => accion(() => platformApi.post(`/empresas/${detalle.id}/modulos`, { modulos: nuevo }), "Módulos actualizados")}
                style={{ display: "inline-flex", alignItems: "center", padding: "7px 12px", borderRadius: 99, cursor: "pointer", fontSize: 13, fontWeight: 600,
                  border: `1px solid ${on ? P.accent : "#cbd5e1"}`, background: on ? P.accent : "#fff", color: on ? "#fff" : P.slateDark }}>
                <i className={`fa-solid ${on ? "fa-check" : "fa-plus"}`} style={{ marginRight: 6, fontSize: 11 }} />{MODULO_LABEL[m] || m}
              </button>
            );
          })}
        </div>
        {detalle.modulos_override && (detalle.modulos_override.add?.length || detalle.modulos_override.remove?.length) ? (
          <div style={{ marginTop: 8, fontSize: 11, color: P.mutedLight }}>
            Ajuste sobre el plan: {detalle.modulos_override.add?.length ? `+${detalle.modulos_override.add.join(", ")}` : ""} {detalle.modulos_override.remove?.length ? `−${detalle.modulos_override.remove.join(", ")}` : ""}
          </div>
        ) : null}
      </div>
      <div style={{ ...detCard, marginTop: 16 }}>
        <h3 style={h3}>Acciones</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
          <div>
            <label style={lbl}>Cambiar plan</label>
            <div style={{ display: "flex", gap: 6 }}>
              <select value={planId} onChange={(e) => setPlanId(Number(e.target.value))} className="sa-sel">
                <option value="">Elegir…</option>
                {planes.filter((p: any) => p.activo).map((p: any) => <option key={p.id} value={p.id}>{p.nombre} ({fmtQ(p.precio)})</option>)}
              </select>
              <button disabled={!planId} onClick={() => cambiar(false)} style={btn}>Aplicar</button>
              <button disabled={!planId} onClick={() => cambiar(true)} style={{ ...btn, background: P.warning }} title="Forzar aunque exceda">Forzar</button>
            </div>
          </div>
          <div>
            <label style={lbl}>Pago / renovación</label>
            <button onClick={() => accion(() => platformApi.post(`/empresas/${detalle.id}/registrar-pago`, {}), "Pago registrado")} style={{ ...btn, background: P.success }}>Registrar pago (+1 período)</button>
          </div>
          <div>
            <label style={lbl}>Extender prueba (días)</label>
            <div style={{ display: "flex", gap: 6 }}>
              <input type="number" value={dias} onChange={(e) => setDias(Number(e.target.value))} className="sa-sel" style={{ width: 80 }} />
              <button onClick={() => accion(() => platformApi.post(`/empresas/${detalle.id}/extender-trial`, { dias }), "Prueba extendida")} style={btn}>Extender</button>
            </div>
          </div>
          <div>
            <label style={lbl}>Suscripción</label>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => accion(() => platformApi.post(`/empresas/${detalle.id}/suspender`, {}), "Suspendida")} style={{ ...btn, background: P.danger }}>Suspender</button>
              <button onClick={() => accion(() => platformApi.post(`/empresas/${detalle.id}/reactivar`, {}), "Reactivada")} style={{ ...btn, background: P.success }}>Reactivar</button>
            </div>
          </div>
          <div>
            <label style={lbl}>Crédito IA extra (período)</label>
            <div style={{ display: "flex", gap: 6 }}>
              <input type="number" value={credR} onChange={(e) => setCredR(Number(e.target.value))} placeholder="req" className="sa-sel" style={{ width: 80 }} />
              <input type="number" value={credT} onChange={(e) => setCredT(Number(e.target.value))} placeholder="tok" className="sa-sel" style={{ width: 100 }} />
              <button onClick={() => accion(() => platformApi.post(`/empresas/${detalle.id}/credito-ia`, { requests: credR, tokens: credT }), "Crédito otorgado")} style={btn}>Otorgar</button>
            </div>
          </div>
        </div>
      </div>
      {detalle.historico?.length > 0 && (
        <div style={{ ...detCard, marginTop: 16, padding: 0, overflow: "hidden" }}>
          <h3 style={{ ...h3, padding: "20px 24px 0" }}>Histórico de períodos</h3>
          <table className="sa-table" style={{ marginTop: 12 }}>
            <thead><tr><th>Período</th><th>Requests</th><th>Tokens</th><th>Costo USD</th></tr></thead>
            <tbody>
              {detalle.historico.map((p: any, i: number) => (
                <tr key={i}>
                  <td>{fmtFecha(p.periodo_inicio)}</td><td>{p.requests_usados}</td>
                  <td>{p.tokens_usados}</td><td>${(p.costo_usd || 0).toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontSize: 14, borderBottom: `1px solid ${P.borderLight}` }}><span style={{ color: P.muted }}>{k}</span><span style={{ fontWeight: 600 }}>{v}</span></div>;
}

const detCard: React.CSSProperties = { background: P.card, borderRadius: 16, padding: 20, boxShadow: "0 1px 3px rgba(15,23,42,.04)", border: `1px solid ${P.border}` };
const h3: React.CSSProperties = { margin: "0 0 12px", fontSize: 15, fontWeight: 700, color: P.fg };
const lbl: React.CSSProperties = { display: "block", fontSize: 12, color: P.muted, marginBottom: 4 };
const btn: React.CSSProperties = { padding: "9px 14px", background: P.accent, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" };
