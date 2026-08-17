import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import platformApi, { PLATFORM_TOKEN_KEY } from "../../lib/platformApi";

type Vista = "dashboard" | "empresas" | "vencimientos" | "planes";

const ESTADO_COLOR: Record<string, string> = {
  trial: "#0284c7", activa: "#16a34a", vencida: "#dc2626", suspendida: "#d97706", cancelada: "#6b7280",
};

const MODULO_LABEL: Record<string, string> = {
  pos: "Punto de Venta", inventario: "Inventario", compras: "Compras",
  ventas: "Ventas", cobranza: "Cobranza", ia: "Asistente IA",
};

function Badge({ estado }: { estado?: string }) {
  if (!estado) return <span style={{ color: "#94a3b8" }}>—</span>;
  return <span style={{ background: ESTADO_COLOR[estado] || "#64748b", color: "#fff", padding: "4px 10px", borderRadius: 99, fontSize: 12, fontWeight: 600, textTransform: "capitalize" }}>{estado}</span>;
}

function fmtFecha(s?: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("es-GT", { year: "numeric", month: "short", day: "numeric" });
}
function fmtQ(n?: number) { return `Q ${Number(n || 0).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function barColor(estado?: string) { return estado === "excedido" ? "#dc2626" : estado === "cerca" ? "#d97706" : "#4f46e5"; }

export default function Plataforma() {
  const navigate = useNavigate();
  const [vista, setVista] = useState<Vista>("dashboard");
  const [empresas, setEmpresas] = useState<any[]>([]);
  const [planes, setPlanes] = useState<any[]>([]);
  const [metricas, setMetricas] = useState<any | null>(null);
  const [vencimientos, setVencimientos] = useState<any[]>([]);
  const [detalle, setDetalle] = useState<any | null>(null);
  const [msg, setMsg] = useState("");
  const [narrow, setNarrow] = useState(typeof window !== "undefined" && window.innerWidth < 900);

  useEffect(() => {
    const h = () => setNarrow(window.innerWidth < 900);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

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
  const logout = () => { localStorage.removeItem(PLATFORM_TOKEN_KEY); navigate("/plataforma/login"); };

  const nav: { id: Vista; label: string; icon: string; badge?: number }[] = [
    { id: "dashboard", label: "Dashboard", icon: "fa-gauge-high" },
    { id: "empresas", label: "Empresas", icon: "fa-building" },
    { id: "vencimientos", label: "Vencimientos", icon: "fa-calendar-check", badge: vencimientos.length || undefined },
    { id: "planes", label: "Planes", icon: "fa-tags" },
  ];

  const Sidebar = (
    <aside style={{ width: narrow ? "100%" : 250, background: "#0f172a", color: "#fff", padding: narrow ? "12px 16px" : "24px 16px",
      display: "flex", flexDirection: narrow ? "row" : "column", gap: 8, flexShrink: 0, alignItems: narrow ? "center" : "stretch",
      overflowX: narrow ? "auto" : "visible", position: narrow ? "sticky" : "static", top: 0, zIndex: 10 }}>
      {!narrow && <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 24, paddingLeft: 8 }}>gsiker<span style={{ color: "#4f46e5" }}>.</span></div>}
      {nav.map((n) => {
        const active = vista === n.id && !detalle;
        return (
          <button key={n.id} onClick={() => { setVista(n.id); setDetalle(null); setMsg(""); }}
            style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, borderRadius: 8, border: "none", cursor: "pointer",
              fontWeight: 500, fontSize: 14, whiteSpace: "nowrap", textAlign: "left",
              background: active ? "#4f46e5" : "transparent", color: active ? "#fff" : "#cbd5e1" }}>
            <i className={`fa-solid ${n.icon}`} />{!narrow || active ? n.label : ""}
            {n.badge != null && <span style={{ marginLeft: "auto", background: "#dc2626", borderRadius: 99, padding: "2px 8px", fontSize: 12, fontWeight: 700 }}>{n.badge}</span>}
          </button>
        );
      })}
      {!narrow && <button onClick={logout} style={{ marginTop: "auto", background: "transparent", color: "#94a3b8", border: "1px solid #334155", borderRadius: 8, padding: "10px 12px", cursor: "pointer", fontSize: 13 }}><i className="fa-solid fa-right-from-bracket" style={{ marginRight: 8 }} />Salir</button>}
    </aside>
  );

  return (
    <div style={{ display: "flex", flexDirection: narrow ? "column" : "row", minHeight: "100vh", background: "#f1f5f9" }}>
      {Sidebar}
      <main style={{ flex: 1, padding: narrow ? 16 : 32, overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h1 style={{ fontSize: 26, margin: 0, color: "#0f172a" }}>{detalle ? detalle.nombre : nav.find((n) => n.id === vista)?.label}</h1>
          <button onClick={logout} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            <i className="fa-solid fa-user-shield" style={{ marginRight: 8, color: "#4f46e5" }} />Superadmin
          </button>
        </div>

        {msg && <div style={{ background: "#eef2ff", color: "#3730a3", padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{msg}</div>}

        {detalle ? (
          <DetalleEmpresa detalle={detalle} planes={planes} onBack={() => setDetalle(null)} accion={accion} />
        ) : vista === "dashboard" ? (
          <Dashboard metricas={metricas} empresas={empresas} vencimientos={vencimientos} onVer={abrirDetalle} onCobrar={cobrar} />
        ) : vista === "empresas" ? (
          <EmpresasView empresas={empresas} onVer={abrirDetalle} onCobrar={cobrar} />
        ) : vista === "vencimientos" ? (
          <Vencimientos onCobrar={cobrar} />
        ) : (
          <PlanesLista planes={planes} />
        )}
      </main>
    </div>
  );
}

/* ------------------------------ DASHBOARD ------------------------------ */
function Dashboard({ metricas, empresas, vencimientos, onVer, onCobrar }: any) {
  const n = metricas?.negocios || {};
  const kpis = [
    { icon: "fa-store", label: "Negocios activos", value: n.activa ?? "—", sub: `${n.trial || 0} en trial · ${n.suspendida || 0} suspendidos` },
    { icon: "fa-coins", label: "MRR estimado", value: fmtQ(metricas?.mrr), sub: "Ingreso recurrente mensual" },
    { icon: "fa-arrow-trend-up", label: "Altas del mes", value: metricas?.altas_mes ?? "—",
      sub: metricas?.altas_delta_pct != null ? `${metricas.altas_delta_pct >= 0 ? "+" : ""}${metricas.altas_delta_pct}% vs mes anterior` : "sin datos previos" },
    { icon: "fa-robot", label: "Costo IA (mes)", value: `$ ${(metricas?.costo_ia_mes_usd ?? 0).toFixed(2)}`, sub: "Consumo agregado tenants" },
  ];
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 16, marginBottom: 24 }}>
        {kpis.map((k) => (
          <div key={k.label} style={cardBox}>
            <div style={{ color: "#64748b", fontSize: 14, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}><i className={`fa-solid ${k.icon}`} />{k.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#0f172a" }}>{k.value}</div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>{k.sub}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)", gap: 16 }}>
        <div style={cardBox}>
          <h3 style={{ ...h3, marginBottom: 14 }}>Empresas</h3>
          <TablaEmpresas empresas={empresas.slice(0, 8)} onVer={onVer} onCobrar={onCobrar} />
        </div>
        <div style={cardBox}>
          <h3 style={{ ...h3, marginBottom: 6 }}>Cola de cobro</h3>
          {vencimientos.length === 0 && <div style={{ color: "#94a3b8", fontSize: 13, paddingTop: 8 }}>Nada por vencer en 7 días. 🎉</div>}
          {vencimientos.map((v: any, i: number) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: i < vencimientos.length - 1 ? "1px solid #f1f5f9" : "none" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{v.empresa}</div>
                <div style={{ fontSize: 12, color: v.vencida ? "#dc2626" : "#64748b", fontWeight: v.vencida ? 600 : 400 }}>
                  {v.vencida ? "Vencido" : "Vence"} {fmtFecha(v.vence)}
                </div>
              </div>
              <button onClick={() => onCobrar(v.empresa_id)} style={{ ...btn, padding: "8px 12px", fontSize: 12, background: v.vencida ? "#4f46e5" : "#eef2ff", color: v.vencida ? "#fff" : "#4f46e5" }}>Cobrar</button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* --------------------------- TABLA EMPRESAS --------------------------- */
function TablaEmpresas({ empresas, onVer, onCobrar }: any) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={tbl}>
        <thead><tr>{["Empresa", "Plan", "Estado", "Consumo IA", ""].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
        <tbody>
          {empresas.map((e: any) => {
            const c = e.consumo_ia;
            return (
              <tr key={e.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                <td style={td}><b>{e.nombre}</b></td>
                <td style={td}>{e.plan || "—"}</td>
                <td style={td}><Badge estado={e.suscripcion?.estado_efectivo} /></td>
                <td style={td}>
                  {c ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 80, height: 6, background: "#e2e8f0", borderRadius: 99, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${c.pct ?? 0}%`, background: barColor(c.estado) }} />
                      </div>
                      <span style={{ fontSize: 12, color: barColor(c.estado) }}>{c.pct != null ? `${c.pct}%` : "∞"}</span>
                    </div>
                  ) : <span style={{ fontSize: 12, color: "#94a3b8" }}>N/A</span>}
                </td>
                <td style={{ ...td, whiteSpace: "nowrap" }}>
                  <button onClick={() => onVer(e.id)} style={iconBtn} title="Ver"><i className="fa-solid fa-eye" /></button>
                  <button onClick={() => onCobrar(e.id)} style={{ ...iconBtn, background: "#16a34a", color: "#fff", marginLeft: 4 }} title="Registrar pago"><i className="fa-solid fa-money-bill" /></button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* --------------------------- EMPRESAS (full) -------------------------- */
function EmpresasView({ empresas, onVer, onCobrar }: any) {
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState("");
  const filtradas = useMemo(() => empresas.filter((e: any) => {
    const okQ = !q || e.nombre.toLowerCase().includes(q.toLowerCase());
    const okE = !estado || e.suscripcion?.estado_efectivo === estado;
    return okQ && okE;
  }), [empresas, q, estado]);
  return (
    <div style={cardBox}>
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar empresa…" style={{ ...inp, flex: 1, minWidth: 180 }} />
        <select value={estado} onChange={(e) => setEstado(e.target.value)} style={inp}>
          <option value="">Todos los estados</option>
          {["trial", "activa", "vencida", "suspendida", "cancelada"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <TablaEmpresas empresas={filtradas} onVer={onVer} onCobrar={onCobrar} />
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
      <button onClick={onBack} style={{ ...iconBtn, marginBottom: 12, padding: "6px 12px", width: "auto" }}>← Volver</button>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        <div style={cardBox}>
          <h3 style={h3}>Suscripción</h3>
          <Row k="Estado" v={<Badge estado={s?.estado_efectivo} />} />
          <Row k="Estado base" v={s?.estado_base} />
          <Row k="Precio" v={s ? `${fmtQ(s.precio)}/${s.intervalo}` : "—"} />
          <Row k="Fin de prueba" v={fmtFecha(s?.fin_trial)} />
          <Row k="Vigente hasta" v={fmtFecha(s?.vigente_hasta)} />
        </div>
        <div style={cardBox}>
          <h3 style={h3}>Consumo IA (período)</h3>
          {limIa ? (<>
            <Row k="Requests" v={`${cv?.requests_usados || 0} / ${limIa?.requests?.limite ?? "∞"}`} />
            <Row k="Tokens" v={`${cv?.tokens_usados || 0} / ${limIa?.tokens?.limite ?? "∞"}`} />
            <Row k="Costo estimado" v={`$${(cv?.costo_usd || 0).toFixed(4)} USD`} />
            <Row k="Crédito extra" v={`${cv?.credito_extra_requests || 0} req · ${cv?.credito_extra_tokens || 0} tok`} />
          </>) : <div style={{ color: "#94a3b8", fontSize: 13 }}>Este plan no incluye IA.</div>}
        </div>
      </div>
      <div style={{ ...cardBox, marginTop: 16 }}>
        <h3 style={h3}>Módulos de la empresa</h3>
        <p style={{ fontSize: 12, color: "#64748b", margin: "-4px 0 10px" }}>
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
                  border: `1px solid ${on ? "#4f46e5" : "#cbd5e1"}`, background: on ? "#4f46e5" : "#fff", color: on ? "#fff" : "#475569" }}>
                <i className={`fa-solid ${on ? "fa-check" : "fa-plus"}`} style={{ marginRight: 6, fontSize: 11 }} />{MODULO_LABEL[m] || m}
              </button>
            );
          })}
        </div>
        {detalle.modulos_override && (detalle.modulos_override.add?.length || detalle.modulos_override.remove?.length) ? (
          <div style={{ marginTop: 8, fontSize: 11, color: "#94a3b8" }}>
            Ajuste sobre el plan: {detalle.modulos_override.add?.length ? `+${detalle.modulos_override.add.join(", ")}` : ""} {detalle.modulos_override.remove?.length ? `−${detalle.modulos_override.remove.join(", ")}` : ""}
          </div>
        ) : null}
      </div>
      <div style={{ ...cardBox, marginTop: 16 }}>
        <h3 style={h3}>Acciones</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
          <div>
            <label style={lbl}>Cambiar plan</label>
            <div style={{ display: "flex", gap: 6 }}>
              <select value={planId} onChange={(e) => setPlanId(Number(e.target.value))} style={inp}>
                <option value="">Elegir…</option>
                {planes.filter((p: any) => p.activo).map((p: any) => <option key={p.id} value={p.id}>{p.nombre} ({fmtQ(p.precio)})</option>)}
              </select>
              <button disabled={!planId} onClick={() => cambiar(false)} style={btn}>Aplicar</button>
              <button disabled={!planId} onClick={() => cambiar(true)} style={{ ...btn, background: "#d97706" }} title="Forzar aunque exceda">Forzar</button>
            </div>
          </div>
          <div>
            <label style={lbl}>Pago / renovación</label>
            <button onClick={() => accion(() => platformApi.post(`/empresas/${detalle.id}/registrar-pago`, {}), "Pago registrado")} style={{ ...btn, background: "#16a34a" }}>Registrar pago (+1 período)</button>
          </div>
          <div>
            <label style={lbl}>Extender prueba (días)</label>
            <div style={{ display: "flex", gap: 6 }}>
              <input type="number" value={dias} onChange={(e) => setDias(Number(e.target.value))} style={{ ...inp, width: 70 }} />
              <button onClick={() => accion(() => platformApi.post(`/empresas/${detalle.id}/extender-trial`, { dias }), "Prueba extendida")} style={btn}>Extender</button>
            </div>
          </div>
          <div>
            <label style={lbl}>Suscripción</label>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => accion(() => platformApi.post(`/empresas/${detalle.id}/suspender`, {}), "Suspendida")} style={{ ...btn, background: "#dc2626" }}>Suspender</button>
              <button onClick={() => accion(() => platformApi.post(`/empresas/${detalle.id}/reactivar`, {}), "Reactivada")} style={{ ...btn, background: "#16a34a" }}>Reactivar</button>
            </div>
          </div>
          <div>
            <label style={lbl}>Crédito IA extra (período)</label>
            <div style={{ display: "flex", gap: 6 }}>
              <input type="number" value={credR} onChange={(e) => setCredR(Number(e.target.value))} placeholder="req" style={{ ...inp, width: 80 }} />
              <input type="number" value={credT} onChange={(e) => setCredT(Number(e.target.value))} placeholder="tok" style={{ ...inp, width: 100 }} />
              <button onClick={() => accion(() => platformApi.post(`/empresas/${detalle.id}/credito-ia`, { requests: credR, tokens: credT }), "Crédito otorgado")} style={btn}>Otorgar</button>
            </div>
          </div>
        </div>
      </div>
      {detalle.historico?.length > 0 && (
        <div style={{ ...cardBox, marginTop: 16 }}>
          <h3 style={h3}>Histórico de períodos</h3>
          <table style={tbl}>
            <thead><tr>{["Período", "Requests", "Tokens", "Costo USD"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {detalle.historico.map((p: any, i: number) => (
                <tr key={i} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={td}>{fmtFecha(p.periodo_inicio)}</td><td style={td}>{p.requests_usados}</td>
                  <td style={td}>{p.tokens_usados}</td><td style={td}>${(p.costo_usd || 0).toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ VENCIMIENTOS -------------------------- */
function Vencimientos({ onCobrar }: { onCobrar: (id: number) => void }) {
  const [dias, setDias] = useState(15);
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { platformApi.get(`/vencimientos?dias=${dias}`).then((r) => setRows(r.data)); }, [dias]);
  return (
    <div style={cardBox}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: "#475569" }}>Próximos</span>
        <input type="number" value={dias} onChange={(e) => setDias(Number(e.target.value))} style={{ ...inp, width: 70 }} />
        <span style={{ fontSize: 13, color: "#475569" }}>días</span>
      </div>
      <table style={tbl}>
        <thead><tr>{["Empresa", "Estado", "Vence", ""].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td style={{ ...td, color: "#94a3b8" }} colSpan={4}>Nada por vencer en el rango.</td></tr>}
          {rows.map((r, i) => (
            <tr key={i} style={{ borderTop: "1px solid #f1f5f9", background: r.vencida ? "#fef2f2" : undefined }}>
              <td style={td}><b>{r.empresa}</b></td>
              <td style={td}><Badge estado={r.estado_efectivo} /></td>
              <td style={td}>{fmtFecha(r.vence)}</td>
              <td style={td}><button onClick={() => onCobrar(r.empresa_id)} style={{ ...btn, padding: "6px 12px", fontSize: 12 }}>Cobrar</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------------------- PLANES ------------------------------ */
function PlanesLista({ planes }: { planes: any[] }) {
  const [verInactivos, setVerInactivos] = useState(false);
  const lista = verInactivos ? planes : planes.filter((p) => p.activo);
  return (
    <div style={cardBox}>
      <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, fontSize: 13, color: "#475569" }}>
        <input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} />
        Mostrar planes archivados (inactivos)
      </label>
      <table style={tbl}>
        <thead><tr>{["Código", "Nombre", "Precio", "IA", "Estado"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
        <tbody>
          {lista.map((p) => (
            <tr key={p.id} style={{ borderTop: "1px solid #f1f5f9" }}>
              <td style={td}><code>{p.codigo}</code></td>
              <td style={td}><b>{p.nombre}</b></td>
              <td style={td}>{fmtQ(p.precio)}/{p.intervalo}</td>
              <td style={td}>{p.limites?.modulos?.includes?.("ia") ? "✓" : "—"}</td>
              <td style={td}>{p.activo ? <span style={{ color: "#16a34a" }}>activo</span> : <span style={{ color: "#94a3b8" }}>archivado</span>}{p.es_personalizado ? " · a medida" : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 14, borderBottom: "1px solid #f8fafc" }}><span style={{ color: "#64748b" }}>{k}</span><span style={{ fontWeight: 600 }}>{v}</span></div>;
}

const cardBox: React.CSSProperties = { background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.08)", border: "1px solid #e2e8f0" };
const tbl: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };
const th: React.CSSProperties = { textAlign: "left", padding: "8px 10px", fontSize: 11, textTransform: "uppercase", color: "#94a3b8", fontWeight: 700 };
const td: React.CSSProperties = { padding: "12px 10px", fontSize: 14, color: "#1e293b" };
const h3: React.CSSProperties = { margin: "0 0 12px", fontSize: 15, color: "#0f172a" };
const lbl: React.CSSProperties = { display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 };
const inp: React.CSSProperties = { padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 13 };
const btn: React.CSSProperties = { padding: "8px 14px", background: "#4f46e5", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" };
const iconBtn: React.CSSProperties = { padding: "6px 10px", background: "#fff", color: "#334155", border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer", fontSize: 13 };
