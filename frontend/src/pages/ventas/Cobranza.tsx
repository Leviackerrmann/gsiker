import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import api from "../../lib/api";
import Modal from "../../components/Modal";
import SearchableSelect from "../../components/SearchableSelect";
import { useToast } from "../../components/Toast";
import { useAuth } from "../../contexts/AuthContext";
import { formatMoney } from "../../lib/money";

interface Cuenta {
  id: number; cliente_id: number; origen: string; origen_id: number | null;
  concepto: string | null; moneda: string; monto_total: number; saldo_pendiente: number;
  estado: string; fecha: string; fecha_vencimiento: string | null; notas: string | null;
}
interface Abono { id: number; cuenta_id: number; monto: number; metodo: string; fecha: string; notas: string | null; }
interface CuentaDetalle extends Cuenta { abonos: Abono[]; }
interface Cliente { id: number; codigo: string; nombre: string; }
interface Resumen { cuentas_abiertas: number; por_cobrar: number; vencido: number; }

const ESTADO_META: Record<string, { label: string; bg: string; fg: string }> = {
  pendiente: { label: "Pendiente", bg: "var(--warning-bg)", fg: "var(--warning-text)" },
  parcial: { label: "Parcial", bg: "var(--primary-light)", fg: "var(--primary)" },
  pagada: { label: "Pagada", bg: "var(--success-bg)", fg: "var(--success-text)" },
  anulada: { label: "Anulada", bg: "var(--border-light)", fg: "var(--text-muted)" },
};
const METODOS = ["efectivo", "tarjeta", "transferencia"];
const METODO_ICON: Record<string, string> = { efectivo: "fa-money-bill-wave", tarjeta: "fa-credit-card", transferencia: "fa-building-columns" };

// Iniciales para el avatar del cliente.
function iniciales(nombre: string): string {
  const parts = nombre.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
// Color estable a partir del id, para el avatar.
const AVATAR_COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];
function avatarColor(id: number): string { return AVATAR_COLORS[id % AVATAR_COLORS.length]; }

function fmtFecha(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("es-GT", { day: "2-digit", month: "short", year: "numeric" });
}
// Días hasta vencimiento (negativo = vencido).
function diasVenc(s: string | null): number | null {
  if (!s) return null;
  const ms = new Date(s).getTime() - Date.now();
  return Math.round(ms / 86400000);
}
function textoVenc(s: string | null, estado: string): { txt: string; cls: string } {
  if (!s) return { txt: "Sin fecha", cls: "muted" };
  if (estado === "pagada" || estado === "anulada") return { txt: fmtFecha(s), cls: "muted" };
  const d = diasVenc(s);
  if (d === null) return { txt: "—", cls: "muted" };
  if (d < 0) return { txt: `Hace ${Math.abs(d)} d`, cls: "danger" };
  if (d === 0) return { txt: "Hoy", cls: "danger" };
  if (d <= 7) return { txt: `En ${d} d`, cls: "warn" };
  return { txt: `En ${d} d`, cls: "muted" };
}

export default function CobranzaPage() {
  const toast = useToast();
  const { empresa } = useAuth();
  const moneda = empresa?.moneda || "GTQ";

  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState("");
  const [search, setSearch] = useState("");

  // Modal de creación de cargo.
  const [crearOpen, setCrearOpen] = useState(false);
  const [nuevoCliente, setNuevoCliente] = useState("");
  const [nuevoMonto, setNuevoMonto] = useState("");
  const [nuevoConcepto, setNuevoConcepto] = useState("");
  const [nuevoVenc, setNuevoVenc] = useState("");
  const [creando, setCreando] = useState(false);

  // Drawer de detalle + abono.
  const [detalle, setDetalle] = useState<CuentaDetalle | null>(null);
  const [abonoMonto, setAbonoMonto] = useState("");
  const [abonoMetodo, setAbonoMetodo] = useState("efectivo");
  const [abonando, setAbonando] = useState(false);

  const clienteById = useMemo(() => {
    const m: Record<number, Cliente> = {};
    for (const c of clientes) m[c.id] = c;
    return m;
  }, [clientes]);

  const load = () => {
    setLoading(true);
    // Cargamos TODAS las cuentas: el filtrado por estado y los conteos se hacen en el cliente.
    Promise.all([
      api.get("/cobranza/cuentas"),
      api.get("/cobranza/resumen"),
    ]).then(([cs, rs]) => { setCuentas(cs.data); setResumen(rs.data); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { api.get("/ventas/clientes").then((r) => setClientes(r.data)).catch(() => setClientes([])); }, []);
  useEffect(() => { load(); }, []);

  // Escape + bloqueo de scroll con el drawer abierto.
  useEffect(() => {
    if (!detalle) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDetalle(null); };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", onKey); };
  }, [detalle]);

  const esVencida = (c: Cuenta) => (c.estado === "pendiente" || c.estado === "parcial") && (diasVenc(c.fecha_vencimiento) ?? 1) < 0;

  const counts = useMemo(() => {
    const activas = cuentas.filter((c) => c.estado !== "anulada");
    return {
      todas: activas.length,
      pendiente: cuentas.filter((c) => c.estado === "pendiente").length,
      parcial: cuentas.filter((c) => c.estado === "parcial").length,
      vencida: cuentas.filter(esVencida).length,
      pagada: cuentas.filter((c) => c.estado === "pagada").length,
    };
  }, [cuentas]);

  // Recuperado a la fecha = suma de lo abonado en cuentas no anuladas.
  const recuperado = useMemo(
    () => cuentas.filter((c) => c.estado !== "anulada").reduce((a, c) => a + (c.monto_total - c.saldo_pendiente), 0),
    [cuentas]
  );

  const filtered = cuentas.filter((c) => {
    if (filtroEstado === "vencida" ? !esVencida(c) : filtroEstado && c.estado !== filtroEstado) return false;
    if (!filtroEstado && c.estado === "anulada") return false; // "Todas" oculta anuladas
    if (search) {
      const cli = clienteById[c.cliente_id];
      const hay = `${cli?.nombre || ""} ${cli?.codigo || ""} ${c.concepto || ""}`.toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const crearCuenta = async () => {
    if (!nuevoCliente || !(parseFloat(nuevoMonto) > 0)) { toast.error("Elige cliente y un monto válido"); return; }
    try {
      setCreando(true);
      await api.post("/cobranza/cuentas", {
        cliente_id: Number(nuevoCliente),
        monto_total: parseFloat(nuevoMonto),
        concepto: nuevoConcepto || null,
        fecha_vencimiento: nuevoVenc ? new Date(nuevoVenc).toISOString() : null,
      });
      toast.success("Cargo por cobrar creado");
      setCrearOpen(false); setNuevoCliente(""); setNuevoMonto(""); setNuevoConcepto(""); setNuevoVenc("");
      load();
    } catch (e: any) { toast.error(e.response?.data?.detail || "No se pudo crear el cargo"); }
    finally { setCreando(false); }
  };

  const abrirDetalle = async (id: number) => {
    try { const { data } = await api.get(`/cobranza/cuentas/${id}`); setDetalle(data); setAbonoMonto(""); setAbonoMetodo("efectivo"); }
    catch { toast.error("No se pudo abrir la cuenta"); }
  };

  const registrarAbono = async () => {
    if (!detalle) return;
    const monto = parseFloat(abonoMonto);
    if (!(monto > 0)) { toast.error("Ingresa un monto válido"); return; }
    if (monto > detalle.saldo_pendiente + 0.001) { toast.error(`El abono no puede exceder el saldo (${formatMoney(detalle.saldo_pendiente, detalle.moneda)})`); return; }
    try {
      setAbonando(true);
      await api.post(`/cobranza/cuentas/${detalle.id}/abonos`, { monto, metodo: abonoMetodo });
      toast.success("Abono registrado");
      await abrirDetalle(detalle.id);
      load();
    } catch (e: any) { toast.error(e.response?.data?.detail || "No se pudo registrar el abono"); }
    finally { setAbonando(false); }
  };

  const anular = async (id: number) => {
    if (!confirm("¿Anular esta cuenta por cobrar? Esta acción no se puede deshacer.")) return;
    try { await api.post(`/cobranza/cuentas/${id}/anular`); toast.success("Cuenta anulada"); setDetalle(null); load(); }
    catch (e: any) { toast.error(e.response?.data?.detail || "No se pudo anular"); }
  };

  const exportar = () => {
    const rows = [["Cliente", "Codigo", "Concepto", "Origen", "Emision", "Vence", "Total", "Saldo", "Estado"]];
    for (const c of filtered) {
      const cli = clienteById[c.cliente_id];
      rows.push([
        cli?.nombre || `#${c.cliente_id}`, cli?.codigo || "", c.concepto || "", c.origen,
        fmtFecha(c.fecha), fmtFecha(c.fecha_vencimiento),
        String(c.monto_total), String(c.saldo_pendiente), esVencida(c) ? "vencida" : c.estado,
      ]);
    }
    const csv = rows.map((r) => r.map((f) => `"${String(f).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url; a.download = `cobranza-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const chips: { key: string; label: string; count: number }[] = [
    { key: "", label: "Todas", count: counts.todas },
    { key: "pendiente", label: "Pendientes", count: counts.pendiente },
    { key: "parcial", label: "Parciales", count: counts.parcial },
    { key: "vencida", label: "Vencidas", count: counts.vencida },
    { key: "pagada", label: "Pagadas", count: counts.pagada },
  ];

  const dTotal = detalle?.monto_total ?? 0;
  const dAbonado = detalle ? detalle.monto_total - detalle.saldo_pendiente : 0;
  const dPct = detalle && dTotal > 0 ? Math.min((dAbonado / dTotal) * 100, 100) : 0;
  const dCli = detalle ? clienteById[detalle.cliente_id] : undefined;
  const dEstado = detalle ? (esVencida(detalle) ? "vencida" : detalle.estado) : "";
  const dMeta = ESTADO_META[detalle?.estado || "anulada"];
  const dPuedeAbonar = detalle && detalle.estado !== "pagada" && detalle.estado !== "anulada";

  return (
    <div style={{ animation: "fadeInUp .45s ease forwards" }}>
      <style>{CX_CSS}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: "'Space Grotesk'", fontSize: 26, fontWeight: 700, letterSpacing: "-0.5px", color: "var(--text-primary)", margin: 0 }}>Cobranza</h1>
          <p style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 4 }}>Cuentas por cobrar, fiado y abonos de tus clientes</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="cx-btn-ghost" onClick={exportar}><i className="fas fa-file-arrow-down" /> Exportar</button>
          <button className="cx-btn-primary" onClick={() => setCrearOpen(true)}><i className="fas fa-plus" /> Nuevo cargo</button>
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14, marginBottom: 24 }}>
        <div className="cx-stat cx-stat-dark">
          <div className="cx-stat-top"><span className="cx-stat-lbl" style={{ color: "rgba(255,255,255,.75)" }}>Total por cobrar</span><i className="fas fa-hand-holding-dollar" /></div>
          <div className="cx-stat-val" style={{ color: "#fff" }}>{formatMoney(resumen?.por_cobrar, moneda)}</div>
          <div className="cx-stat-foot" style={{ color: "rgba(255,255,255,.7)" }}>{counts.todas} cuentas abiertas</div>
        </div>
        <div className="cx-stat">
          <div className="cx-stat-top"><span className="cx-stat-lbl">Vencido</span><i className="fas fa-triangle-exclamation" style={{ color: "var(--danger)" }} /></div>
          <div className="cx-stat-val" style={{ color: "var(--danger)" }}>{formatMoney(resumen?.vencido, moneda)}</div>
          <div className="cx-stat-foot">{counts.vencida} cuentas vencidas</div>
        </div>
        <div className="cx-stat">
          <div className="cx-stat-top"><span className="cx-stat-lbl">Cuentas abiertas</span><i className="fas fa-folder-open" style={{ color: "var(--primary)" }} /></div>
          <div className="cx-stat-val">{resumen?.cuentas_abiertas ?? 0}</div>
          <div className="cx-stat-foot">{counts.pendiente} pendientes · {counts.parcial} parciales</div>
        </div>
        <div className="cx-stat">
          <div className="cx-stat-top"><span className="cx-stat-lbl">Recuperado</span><i className="fas fa-circle-check" style={{ color: "var(--success-text)" }} /></div>
          <div className="cx-stat-val" style={{ color: "var(--success-text)" }}>{formatMoney(recuperado, moneda)}</div>
          <div className="cx-stat-foot">cobrado a la fecha</div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 220, maxWidth: 340 }}>
          <i className="fas fa-search" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", fontSize: 13 }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por cliente o concepto..." className="cx-search" />
        </div>
        <div className="cx-chips">
          {chips.map((ch) => (
            <button key={ch.key || "todas"} className={`cx-chip ${filtroEstado === ch.key ? "active" : ""}`} onClick={() => setFiltroEstado(ch.key)}>
              {ch.label}<span className="cx-chip-count">{ch.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tabla */}
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--card-radius)", overflow: "hidden", boxShadow: "var(--card-shadow)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Cliente</th>
              <th style={th}>Concepto</th>
              <th style={th}>Emisión</th>
              <th style={th}>Vence</th>
              <th style={{ ...th, textAlign: "right" }}>Total</th>
              <th style={{ ...th, textAlign: "right" }}>Saldo</th>
              <th style={{ ...th, width: 150 }}>Progreso</th>
              <th style={th}>Estado</th>
              <th style={{ ...th, width: 36 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ ...td, textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Cargando...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} style={{ ...td, textAlign: "center", padding: 50, color: "var(--text-muted)" }}>
                <i className="fas fa-hand-holding-dollar" style={{ fontSize: 28, display: "block", marginBottom: 12, opacity: .3 }} />
                No hay cuentas por cobrar con estos filtros
              </td></tr>
            ) : filtered.map((c) => {
              const cli = clienteById[c.cliente_id];
              const nombre = cli?.nombre || `Cliente #${c.cliente_id}`;
              const abonado = c.monto_total - c.saldo_pendiente;
              const pct = c.monto_total > 0 ? Math.min((abonado / c.monto_total) * 100, 100) : 0;
              const venc = textoVenc(c.fecha_vencimiento, c.estado);
              const estadoKey = esVencida(c) ? "pendiente" : c.estado;
              const meta = ESTADO_META[estadoKey] || ESTADO_META.anulada;
              return (
                <tr key={c.id} className="cx-row" onClick={() => abrirDetalle(c.id)} style={{ borderBottom: "1px solid var(--row-border)" }}>
                  <td style={td}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span className="cx-avatar" style={{ background: avatarColor(c.cliente_id) }}>{iniciales(nombre)}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 170 }}>{nombre}</div>
                        {cli?.codigo && <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'Space Grotesk'" }}>{cli.codigo}</div>}
                      </div>
                    </div>
                  </td>
                  <td style={td}>{c.concepto || <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>{fmtFecha(c.fecha)}</td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}><span className={`cx-venc ${venc.cls}`}>{venc.txt}</span></td>
                  <td style={{ ...td, textAlign: "right", fontFamily: "'Space Grotesk'", fontWeight: 600 }}>{formatMoney(c.monto_total, c.moneda)}</td>
                  <td style={{ ...td, textAlign: "right", fontFamily: "'Space Grotesk'", fontWeight: 700, color: c.saldo_pendiente > 0 ? "var(--text-primary)" : "var(--success-text)" }}>{formatMoney(c.saldo_pendiente, c.moneda)}</td>
                  <td style={td}>
                    <div className="cx-bar"><div className="cx-bar-fill" style={{ width: `${pct}%`, background: pct >= 100 ? "var(--success-text)" : "var(--primary)" }} /></div>
                    <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 3, fontFamily: "'Space Grotesk'" }}>{Math.round(pct)}%</div>
                  </td>
                  <td style={td}><span className="cx-badge" style={{ background: meta.bg, color: meta.fg }}>{esVencida(c) ? "Vencida" : meta.label}</span></td>
                  <td style={{ ...td, textAlign: "right" }}><i className="fas fa-chevron-right cx-chevron" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal crear cargo */}
      <Modal isOpen={crearOpen} title="Nuevo cargo por cobrar" onClose={() => setCrearOpen(false)} maxWidth={440}>
        <label style={lbl}>Cliente</label>
        <SearchableSelect
          options={clientes.map((c) => ({ value: String(c.id), label: c.nombre, sublabel: c.codigo }))}
          value={nuevoCliente} onChange={setNuevoCliente} placeholder="Buscar cliente…" />
        <div style={{ height: 12 }} />
        <label style={lbl}>Monto total ({moneda})</label>
        <input type="number" min={0} step="0.01" value={nuevoMonto} onChange={(e) => setNuevoMonto(e.target.value)} style={inp} />
        <div style={{ height: 12 }} />
        <label style={lbl}>Concepto (opcional)</label>
        <input value={nuevoConcepto} onChange={(e) => setNuevoConcepto(e.target.value)} placeholder="Ej. Fiado de la semana" style={inp} />
        <div style={{ height: 12 }} />
        <label style={lbl}>Fecha de vencimiento (opcional)</label>
        <input type="date" value={nuevoVenc} onChange={(e) => setNuevoVenc(e.target.value)} style={inp} />
        <div style={{ display: "flex", gap: 8, marginTop: 18, justifyContent: "flex-end" }}>
          <button onClick={() => setCrearOpen(false)} className="cx-btn-ghost">Cancelar</button>
          <button onClick={crearCuenta} className="cx-btn-primary" disabled={creando}>{creando ? "Creando…" : "Crear cargo"}</button>
        </div>
      </Modal>

      {/* Drawer detalle */}
      {detalle && createPortal(
        <>
          <div className="cx-overlay" onClick={() => setDetalle(null)} />
          <aside className="cx-drawer" role="dialog" aria-modal="true">
            <div className="cx-drawer-head">
              <div>
                <div className="cx-drawer-title">Cuenta por cobrar</div>
                <div className="cx-drawer-sub">#{detalle.id} · {detalle.origen}</div>
              </div>
              <button className="cx-close" onClick={() => setDetalle(null)} aria-label="Cerrar"><i className="fas fa-xmark" /></button>
            </div>

            <div className="cx-drawer-body">
              {/* Hero */}
              <div className="cx-hero">
                <span className="cx-hero-avatar" style={{ background: avatarColor(detalle.cliente_id) }}>{iniciales(dCli?.nombre || "?")}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="cx-hero-name">{dCli?.nombre || `Cliente #${detalle.cliente_id}`}</div>
                  <div className="cx-hero-sub">{detalle.concepto || "Sin concepto"}</div>
                  <div className="cx-hero-badges">
                    <span className="cx-badge" style={{ background: dMeta.bg, color: dMeta.fg }}>{dEstado === "vencida" ? "Vencida" : dMeta.label}</span>
                    {dCli?.codigo && <span className="cx-tag">{dCli.codigo}</span>}
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="cx-stats">
                <div><div className="cx-s-val">{formatMoney(dTotal, detalle.moneda)}</div><div className="cx-s-lbl">Total</div></div>
                <div><div className="cx-s-val" style={{ color: "var(--success-text)" }}>{formatMoney(dAbonado, detalle.moneda)}</div><div className="cx-s-lbl">Abonado</div></div>
                <div><div className="cx-s-val" style={{ color: detalle.saldo_pendiente > 0 ? "var(--danger)" : "var(--success-text)" }}>{formatMoney(detalle.saldo_pendiente, detalle.moneda)}</div><div className="cx-s-lbl">Saldo</div></div>
              </div>
              <div className="cx-bar" style={{ height: 8, marginBottom: 24 }}><div className="cx-bar-fill" style={{ width: `${dPct}%`, background: dPct >= 100 ? "var(--success-text)" : "var(--primary)" }} /></div>

              {/* Registrar abono */}
              {dPuedeAbonar && (
                <div className="cx-section">
                  <div className="cx-section-title">Registrar abono</div>
                  <div className="cx-abono-form">
                    <div className="cx-field">
                      <label>Monto</label>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input type="number" min={0} step="0.01" value={abonoMonto} onChange={(e) => setAbonoMonto(e.target.value)} placeholder={String(detalle.saldo_pendiente)} className="cx-input" style={{ flex: 1 }} />
                        <button className="cx-btn-ghost" style={{ whiteSpace: "nowrap" }} onClick={() => setAbonoMonto(String(detalle.saldo_pendiente))}>Saldo total</button>
                      </div>
                    </div>
                    <div className="cx-field">
                      <label>Método de pago</label>
                      <div className="cx-metodos">
                        {METODOS.map((m) => (
                          <button key={m} className={`cx-metodo ${abonoMetodo === m ? "active" : ""}`} onClick={() => setAbonoMetodo(m)}>
                            <i className={`fas ${METODO_ICON[m]}`} /> {m.charAt(0).toUpperCase() + m.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button className="cx-btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={registrarAbono} disabled={abonando}>
                      {abonando ? <><i className="fas fa-spinner cx-spin" /> Registrando…</> : <><i className="fas fa-check" /> Registrar abono</>}
                    </button>
                  </div>
                </div>
              )}

              {/* Historial de abonos */}
              <div className="cx-section">
                <div className="cx-section-title">Historial de abonos</div>
                {detalle.abonos.length === 0 ? (
                  <div className="cx-empty"><i className="fas fa-receipt" /> Sin abonos registrados</div>
                ) : (
                  <div className="cx-timeline">
                    {detalle.abonos.map((a) => (
                      <div key={a.id} className="cx-abono">
                        <span className="cx-abono-icon"><i className={`fas ${METODO_ICON[a.metodo] || "fa-money-bill"}`} /></span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)", textTransform: "capitalize" }}>{a.metodo}</div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{fmtFecha(a.fecha)}</div>
                        </div>
                        <div style={{ fontFamily: "'Space Grotesk'", fontWeight: 700, color: "var(--success-text)" }}>+{formatMoney(a.monto, detalle.moneda)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Ficha */}
              <div className="cx-section">
                <div className="cx-section-title">Detalle</div>
                <div className="cx-facts">
                  <div className="cx-fact"><span className="cx-fact-lbl">Emisión</span><span className="cx-fact-val">{fmtFecha(detalle.fecha)}</span></div>
                  <div className="cx-fact"><span className="cx-fact-lbl">Vencimiento</span><span className="cx-fact-val">{fmtFecha(detalle.fecha_vencimiento)}</span></div>
                  <div className="cx-fact"><span className="cx-fact-lbl">Origen</span><span className="cx-fact-val" style={{ textTransform: "capitalize" }}>{detalle.origen}</span></div>
                  <div className="cx-fact"><span className="cx-fact-lbl">Moneda</span><span className="cx-fact-val">{detalle.moneda}</span></div>
                  {detalle.notas && <div className="cx-fact" style={{ gridColumn: "1 / -1" }}><span className="cx-fact-lbl">Notas</span><span className="cx-fact-val">{detalle.notas}</span></div>}
                </div>
              </div>
            </div>

            <div className="cx-drawer-foot">
              {dPuedeAbonar && <button className="cx-btn-danger" onClick={() => anular(detalle.id)}><i className="fas fa-ban" /> Anular</button>}
              <button className="cx-btn-ghost" onClick={() => setDetalle(null)} style={{ marginLeft: "auto" }}>Cerrar</button>
            </div>
          </aside>
        </>,
        document.body
      )}
    </div>
  );
}

const th: React.CSSProperties = { textAlign: "left", padding: "13px 16px", fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".8px", color: "var(--text-muted)", background: "var(--bg-table-head)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "12px 16px", fontSize: 13, color: "var(--text-secondary)", verticalAlign: "middle" };
const lbl: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 };
const inp: React.CSSProperties = { width: "100%", padding: "10px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 14, background: "var(--surface)", color: "var(--text)", boxSizing: "border-box" };

const CX_CSS = `
.cx-btn-primary{display:inline-flex;align-items:center;gap:8px;background:var(--primary);color:#fff;border:none;border-radius:10px;padding:9px 16px;font:inherit;font-weight:600;font-size:13px;cursor:pointer;transition:all .2s}
.cx-btn-primary:hover{background:var(--primary-hover)}
.cx-btn-primary:disabled{opacity:.6;cursor:not-allowed}
.cx-btn-ghost{display:inline-flex;align-items:center;gap:8px;background:transparent;border:1.5px solid var(--border);border-radius:10px;padding:9px 16px;font:inherit;font-weight:600;font-size:13px;color:var(--text);cursor:pointer;transition:all .2s}
.cx-btn-ghost:hover{background:var(--border-light)}
.cx-btn-danger{display:inline-flex;align-items:center;gap:8px;background:var(--danger-bg);color:var(--danger-text);border:none;border-radius:10px;padding:9px 16px;font:inherit;font-weight:600;font-size:13px;cursor:pointer;transition:all .2s}
.cx-btn-danger:hover{filter:brightness(.96)}
.cx-spin{animation:spin .7s linear infinite}

.cx-stat{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--card-radius);padding:18px;box-shadow:var(--card-shadow)}
.cx-stat-dark{background:linear-gradient(135deg,var(--primary),var(--primary-hover));border:none}
.cx-stat-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.cx-stat-top i{font-size:16px}
.cx-stat-lbl{font-size:11px;text-transform:uppercase;letter-spacing:.8px;color:var(--text-muted);font-weight:600}
.cx-stat-val{font-family:'Space Grotesk',sans-serif;font-size:24px;font-weight:700;color:var(--text-primary);letter-spacing:-.5px}
.cx-stat-foot{font-size:11.5px;color:var(--text-muted);margin-top:6px}

.cx-search{width:100%;padding:10px 14px 10px 40px;border-radius:8px;border:1px solid var(--input-border);background:var(--input-bg);color:var(--text-primary);font-size:13px;font-family:inherit;outline:none;box-sizing:border-box;transition:all .25s ease}
.cx-search:focus{border-color:var(--primary)}
.cx-chips{display:flex;gap:8px;flex-wrap:wrap}
.cx-chip{display:inline-flex;align-items:center;gap:7px;padding:7px 13px;border-radius:20px;border:1.5px solid var(--border);background:transparent;color:var(--text-secondary);font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;transition:all .18s}
.cx-chip:hover{border-color:var(--primary);color:var(--primary)}
.cx-chip.active{border-color:var(--primary);background:var(--primary);color:#fff}
.cx-chip-count{font-size:11px;background:var(--border-light);color:var(--text-muted);border-radius:10px;padding:1px 7px;font-weight:700}
.cx-chip.active .cx-chip-count{background:rgba(255,255,255,.25);color:#fff}

.cx-row{cursor:pointer;transition:background .15s}
.cx-row:hover{background:var(--bg-table-row-hover)}
.cx-chevron{color:var(--text-muted);font-size:12px;opacity:.4;transition:all .18s}
.cx-row:hover .cx-chevron{opacity:1;color:var(--primary);transform:translateX(2px)}
.cx-avatar{width:34px;height:34px;border-radius:10px;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;font-family:'Space Grotesk',sans-serif;flex-shrink:0}
.cx-badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;white-space:nowrap}
.cx-venc{font-weight:600;font-size:12.5px}
.cx-venc.muted{color:var(--text-muted)}
.cx-venc.warn{color:var(--warning-text)}
.cx-venc.danger{color:var(--danger)}
.cx-bar{width:100%;height:6px;background:var(--border-light);border-radius:4px;overflow:hidden}
.cx-bar-fill{height:100%;border-radius:4px;transition:width .3s ease}

.cx-overlay{position:fixed;inset:0;background:rgba(15,23,42,0.45);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);z-index:900;animation:fadeIn .25s ease}
.cx-drawer{position:fixed;top:0;right:0;bottom:0;width:500px;max-width:100vw;background:var(--surface);z-index:901;display:flex;flex-direction:column;box-shadow:-10px 0 40px rgba(0,0,0,0.2);animation:cxSlide .35s cubic-bezier(0.32,0.72,0,1)}
@keyframes cxSlide{from{transform:translateX(100%)}to{transform:translateX(0)}}
.cx-drawer-head{padding:22px 26px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-shrink:0}
.cx-drawer-title{font-size:18px;font-weight:800;letter-spacing:-0.3px;color:var(--text)}
.cx-drawer-sub{font-size:12px;color:var(--text-muted);margin-top:2px;font-family:'Space Grotesk',sans-serif;text-transform:capitalize}
.cx-close{width:36px;height:36px;border-radius:10px;background:var(--bg);border:1px solid var(--border);cursor:pointer;color:var(--text-muted);display:flex;align-items:center;justify-content:center;transition:all .2s}
.cx-close:hover{background:var(--danger-bg);color:var(--danger);border-color:transparent}
.cx-drawer-body{flex:1;overflow-y:auto;padding:22px 26px}
.cx-drawer-foot{padding:14px 26px;border-top:1px solid var(--border);display:flex;align-items:center;gap:12px;flex-shrink:0}

.cx-hero{display:flex;align-items:center;gap:16px;padding:18px;background:var(--primary-light);border:1px solid var(--border);border-radius:14px;margin-bottom:20px}
.cx-hero-avatar{width:52px;height:52px;border-radius:14px;color:#fff;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;font-family:'Space Grotesk',sans-serif;flex-shrink:0;box-shadow:0 8px 20px rgba(0,0,0,0.12)}
.cx-hero-name{font-weight:700;font-size:16px;color:var(--text);line-height:1.25}
.cx-hero-sub{font-size:13px;color:var(--text-muted);margin-top:2px}
.cx-hero-badges{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.cx-tag{display:inline-flex;align-items:center;padding:3px 9px;border-radius:20px;font-size:11px;font-weight:600;background:var(--surface);border:1px solid var(--border);color:var(--text-secondary);font-family:'Space Grotesk',sans-serif}

.cx-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px}
.cx-stats>div{background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:14px 10px;text-align:center}
.cx-s-val{font-family:'Space Grotesk',sans-serif;font-size:15px;font-weight:800;color:var(--text)}
.cx-s-lbl{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);font-weight:600;margin-top:3px}

.cx-section{margin-bottom:24px}
.cx-section-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:14px;display:flex;align-items:center;gap:8px}
.cx-section-title::before{content:'';width:3px;height:14px;background:var(--primary);border-radius:2px}
.cx-abono-form{background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:16px}
.cx-field{margin-bottom:14px}
.cx-field label{display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);margin-bottom:6px}
.cx-input{width:100%;background:var(--surface);border:1.5px solid var(--border);border-radius:10px;padding:10px 12px;font:inherit;font-size:13px;color:var(--text);outline:none;box-sizing:border-box;transition:all .2s}
.cx-input:focus{border-color:var(--primary);box-shadow:0 0 0 4px var(--primary-light)}
.cx-metodos{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.cx-metodo{display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 4px;border:1.5px solid var(--border);border-radius:10px;background:var(--surface);color:var(--text-secondary);font:inherit;font-size:11px;font-weight:600;cursor:pointer;transition:all .18s}
.cx-metodo i{font-size:14px}
.cx-metodo:hover{border-color:var(--primary);color:var(--primary)}
.cx-metodo.active{border-color:var(--primary);background:var(--primary-light);color:var(--primary)}

.cx-timeline{display:flex;flex-direction:column;gap:8px}
.cx-abono{display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--bg);border:1px solid var(--border);border-radius:12px}
.cx-abono-icon{width:34px;height:34px;border-radius:10px;background:var(--success-bg);color:var(--success-text);display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0}
.cx-empty{display:flex;align-items:center;gap:10px;padding:16px;background:var(--bg);border:1px dashed var(--border);border-radius:12px;color:var(--text-muted);font-size:13px}

.cx-facts{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--border);border:1px solid var(--border);border-radius:12px;overflow:hidden}
.cx-fact{background:var(--surface);padding:12px 14px;display:flex;flex-direction:column;gap:3px}
.cx-fact-lbl{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);font-weight:600}
.cx-fact-val{font-size:13px;font-weight:600;color:var(--text)}

@media(max-width:640px){.cx-drawer{width:100vw}}
`;
