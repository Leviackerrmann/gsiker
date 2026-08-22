import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import api from "../../lib/api";
import Modal from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { useAuth } from "../../contexts/AuthContext";
import { MONEDAS, formatMoney } from "../../lib/money";

interface Cliente {
  id: number; codigo: string; nombre: string; documento: string | null; direccion: string | null;
  telefono: string | null; email: string | null; moneda: string; activo: boolean; fecha_creacion: string;
}
interface CuentaResumen {
  id: number; concepto: string | null; monto_total: number; saldo_pendiente: number; estado: string;
  fecha: string; fecha_vencimiento: string | null; moneda: string;
}
interface EstadoCuenta {
  cliente_id: number; cliente_nombre: string; saldo_total: number;
  aging: Record<string, number>; cuentas: CuentaResumen[];
}

const AVATAR_COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];
function avatarColor(id: number) { return AVATAR_COLORS[id % AVATAR_COLORS.length]; }
function iniciales(nombre: string) {
  const p = nombre.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  return (p.length === 1 ? p[0].slice(0, 2) : p[0][0] + p[p.length - 1][0]).toUpperCase();
}
const AGING_LABEL: Record<string, string> = { corriente: "Corriente", "1_30": "1–30 días", "31_60": "31–60 días", "61_90": "61–90 días", mas_90: "+90 días" };

export default function ClientesPage() {
  const toast = useToast();
  const { empresa } = useAuth();
  const monedaEmp = empresa?.moneda || "GTQ";

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "activo" | "inactivo">("todos");

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Cliente | null>(null);
  const [form, setForm] = useState({ codigo: "", nombre: "", documento: "", direccion: "", telefono: "", email: "", moneda: "GTQ" });
  const [error, setError] = useState("");

  const [detail, setDetail] = useState<Cliente | null>(null);
  const [estado, setEstado] = useState<EstadoCuenta | null>(null);
  const [estadoLoading, setEstadoLoading] = useState(false);

  const load = async () => { const { data } = await api.get("/ventas/clientes"); setClientes(data); setLoading(false); };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!detail) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") cerrar(); };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", onKey); };
  }, [detail]);

  const reset = () => { setForm({ codigo: "", nombre: "", documento: "", direccion: "", telefono: "", email: "", moneda: monedaEmp }); setEditing(null); setError(""); };
  const openNuevo = () => { reset(); setShowForm(true); };
  const openEdit = (c: Cliente) => { setForm({ codigo: c.codigo, nombre: c.nombre, documento: c.documento || "", direccion: c.direccion || "", telefono: c.telefono || "", email: c.email || "", moneda: c.moneda || "GTQ" }); setEditing(c); setError(""); setShowForm(true); };

  const abrir = async (c: Cliente) => {
    setDetail(c); setEstado(null); setEstadoLoading(true);
    try { const { data } = await api.get(`/cobranza/clientes/${c.id}/estado-cuenta`); setEstado(data); }
    catch { setEstado(null); }
    finally { setEstadoLoading(false); }
  };
  const cerrar = () => { setDetail(null); setEstado(null); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    try {
      if (editing) await api.put(`/ventas/clientes/${editing.id}`, { nombre: form.nombre, documento: form.documento || null, direccion: form.direccion || null, telefono: form.telefono || null, email: form.email || null, moneda: form.moneda });
      else await api.post("/ventas/clientes", form);
      toast.success(editing ? "Cliente actualizado" : "Cliente creado");
      setShowForm(false); reset(); load();
    } catch (err: any) { setError(err.response?.data?.detail || "Error al guardar"); }
  };

  const toggle = async (c: Cliente) => {
    await api.put(`/ventas/clientes/${c.id}`, { activo: !c.activo });
    toast.success(c.activo ? "Cliente desactivado" : "Cliente activado");
    load();
    if (detail?.id === c.id) setDetail({ ...c, activo: !c.activo });
  };

  const filtered = useMemo(() => clientes.filter((c) => {
    if (filtro === "activo" && !c.activo) return false;
    if (filtro === "inactivo" && c.activo) return false;
    if (search) { const h = `${c.nombre} ${c.codigo} ${c.documento || ""} ${c.telefono || ""}`.toLowerCase(); if (!h.includes(search.toLowerCase())) return false; }
    return true;
  }), [clientes, filtro, search]);

  const totalActivos = clientes.filter((c) => c.activo).length;

  const chips: { key: typeof filtro; label: string; count: number }[] = [
    { key: "todos", label: "Todos", count: clientes.length },
    { key: "activo", label: "Activos", count: totalActivos },
    { key: "inactivo", label: "Inactivos", count: clientes.length - totalActivos },
  ];

  return (
    <div style={{ animation: "fadeInUp .45s ease forwards" }}>
      <style>{CL_CSS}</style>

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: "'Space Grotesk'", fontSize: 26, fontWeight: 700, letterSpacing: "-0.5px", color: "var(--text-primary)", margin: 0 }}>Clientes</h1>
          <p style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 4 }}>Directorio de clientes y su estado de cuenta</p>
        </div>
        <button className="cl-btn-primary" onClick={openNuevo}><i className="fas fa-plus" /> Nuevo cliente</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 24 }}>
        <div className="cl-stat"><div className="cl-stat-top"><span className="cl-stat-lbl">Total clientes</span><i className="fas fa-users" style={{ color: "var(--primary)" }} /></div><div className="cl-stat-val">{clientes.length}</div></div>
        <div className="cl-stat"><div className="cl-stat-top"><span className="cl-stat-lbl">Activos</span><i className="fas fa-user-check" style={{ color: "var(--success-text)" }} /></div><div className="cl-stat-val" style={{ color: "var(--success-text)" }}>{totalActivos}</div></div>
        <div className="cl-stat"><div className="cl-stat-top"><span className="cl-stat-lbl">Inactivos</span><i className="fas fa-user-slash" style={{ color: "var(--text-muted)" }} /></div><div className="cl-stat-val">{clientes.length - totalActivos}</div></div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 220, maxWidth: 340 }}>
          <i className="fas fa-search" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", fontSize: 13 }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre, código o documento..." className="cl-search" />
        </div>
        <div className="cl-chips">
          {chips.map((ch) => (
            <button key={ch.key} className={`cl-chip ${filtro === ch.key ? "active" : ""}`} onClick={() => setFiltro(ch.key)}>{ch.label}<span className="cl-chip-count">{ch.count}</span></button>
          ))}
        </div>
      </div>

      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--card-radius)", overflow: "hidden", boxShadow: "var(--card-shadow)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Cliente</th>
              <th style={th}>Documento</th>
              <th style={th}>Contacto</th>
              <th style={th}>Moneda</th>
              <th style={th}>Estado</th>
              <th style={{ ...th, width: 36 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ ...td, textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Cargando...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} style={{ ...td, textAlign: "center", padding: 50, color: "var(--text-muted)" }}>
                <i className="fas fa-users" style={{ fontSize: 28, display: "block", marginBottom: 12, opacity: .3 }} />No hay clientes con estos filtros
              </td></tr>
            ) : filtered.map((c) => (
              <tr key={c.id} className="cl-row" onClick={() => abrir(c)} style={{ borderBottom: "1px solid var(--row-border)" }}>
                <td style={td}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="cl-avatar" style={{ background: avatarColor(c.id) }}>{iniciales(c.nombre)}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 13 }}>{c.nombre}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'Space Grotesk'" }}>{c.codigo}</div>
                    </div>
                  </div>
                </td>
                <td style={td}>{c.documento || <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                <td style={td}>{c.telefono || c.email || <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                <td style={td}><span style={{ fontFamily: "'Space Grotesk'", fontWeight: 600 }}>{c.moneda || "GTQ"}</span></td>
                <td style={td}><span className="cl-badge" style={{ background: c.activo ? "var(--success-bg)" : "var(--border-light)", color: c.activo ? "var(--success-text)" : "var(--text-muted)" }}>{c.activo ? "Activo" : "Inactivo"}</span></td>
                <td style={{ ...td, textAlign: "right" }}><i className="fas fa-chevron-right cl-chevron" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal crear/editar */}
      <Modal isOpen={showForm} title={editing ? "Editar cliente" : "Nuevo cliente"} onClose={() => { setShowForm(false); reset(); }} maxWidth={560}>
        <form onSubmit={handleSubmit}>
          {error && <div style={{ background: "var(--danger-bg)", color: "var(--danger-text)", padding: "9px 12px", borderRadius: 8, marginBottom: 14, fontSize: 13 }}>{error}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><label style={lbl}>Código *</label><input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value.toUpperCase() })} style={inp} required disabled={!!editing} /></div>
            <div><label style={lbl}>Nombre *</label><input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} style={inp} required /></div>
            <div><label style={lbl}>Documento</label><input value={form.documento} onChange={(e) => setForm({ ...form, documento: e.target.value })} style={inp} /></div>
            <div><label style={lbl}>Teléfono</label><input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} style={inp} /></div>
            <div><label style={lbl}>Email</label><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={inp} /></div>
            <div><label style={lbl}>Moneda</label><select value={form.moneda} onChange={(e) => setForm({ ...form, moneda: e.target.value })} style={inp}>{MONEDAS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></div>
            <div style={{ gridColumn: "1 / -1" }}><label style={lbl}>Dirección</label><input value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} style={inp} /></div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 18, justifyContent: "flex-end" }}>
            <button type="button" onClick={() => { setShowForm(false); reset(); }} className="cl-btn-ghost">Cancelar</button>
            <button type="submit" className="cl-btn-primary">{editing ? "Guardar cambios" : "Crear cliente"}</button>
          </div>
        </form>
      </Modal>

      {/* Drawer detalle */}
      {detail && createPortal(
        <>
          <div className="cl-overlay" onClick={cerrar} />
          <aside className="cl-drawer" role="dialog" aria-modal="true">
            <div className="cl-drawer-head">
              <div><div className="cl-drawer-title">Cliente</div><div className="cl-drawer-sub">{detail.codigo}</div></div>
              <button className="cl-close" onClick={cerrar} aria-label="Cerrar"><i className="fas fa-xmark" /></button>
            </div>
            <div className="cl-drawer-body">
              <div className="cl-hero">
                <span className="cl-hero-avatar" style={{ background: avatarColor(detail.id) }}>{iniciales(detail.nombre)}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="cl-hero-name">{detail.nombre}</div>
                  <div className="cl-hero-badges">
                    <span className="cl-badge" style={{ background: detail.activo ? "var(--success-bg)" : "var(--border-light)", color: detail.activo ? "var(--success-text)" : "var(--text-muted)" }}>{detail.activo ? "Activo" : "Inactivo"}</span>
                    <span className="cl-tag">{detail.moneda || "GTQ"}</span>
                  </div>
                </div>
              </div>

              {/* Estado de cuenta */}
              <div className="cl-section">
                <div className="cl-section-title">Estado de cuenta</div>
                {estadoLoading ? (
                  <div className="cl-muted"><i className="fas fa-spinner cl-spin" /> Cargando…</div>
                ) : estado ? (
                  <>
                    <div className="cl-saldo-card">
                      <div><div className="cl-s-lbl">Saldo total pendiente</div><div className="cl-saldo-val" style={{ color: estado.saldo_total > 0 ? "var(--danger)" : "var(--success-text)" }}>{formatMoney(estado.saldo_total, detail.moneda)}</div></div>
                      <i className="fas fa-hand-holding-dollar" style={{ fontSize: 28, opacity: .25 }} />
                    </div>
                    {estado.saldo_total > 0 && (
                      <div className="cl-aging">
                        {Object.entries(estado.aging).filter(([, v]) => v > 0).map(([k, v]) => (
                          <div key={k} className="cl-aging-row"><span>{AGING_LABEL[k] || k}</span><span style={{ fontFamily: "'Space Grotesk'", fontWeight: 600, color: k === "mas_90" || k === "61_90" ? "var(--danger)" : "var(--text)" }}>{formatMoney(v, detail.moneda)}</span></div>
                        ))}
                      </div>
                    )}
                    {estado.cuentas.length > 0 && (
                      <div style={{ marginTop: 12 }}>
                        {estado.cuentas.map((cu) => (
                          <div key={cu.id} className="cl-cuenta">
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{cu.concepto || "Cargo"}</div>
                              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{new Date(cu.fecha).toLocaleDateString("es-GT")}</div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontFamily: "'Space Grotesk'", fontWeight: 700, color: cu.saldo_pendiente > 0 ? "var(--text)" : "var(--success-text)" }}>{formatMoney(cu.saldo_pendiente, cu.moneda)}</div>
                              <div style={{ fontSize: 10.5, color: "var(--text-muted)", textTransform: "capitalize" }}>{cu.estado}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="cl-muted">Sin cuentas por cobrar</div>
                )}
              </div>

              {/* Contacto */}
              <div className="cl-section">
                <div className="cl-section-title">Contacto</div>
                <div className="cl-facts">
                  <div className="cl-fact"><span className="cl-fact-lbl">Documento</span><span className="cl-fact-val">{detail.documento || "—"}</span></div>
                  <div className="cl-fact"><span className="cl-fact-lbl">Teléfono</span><span className="cl-fact-val">{detail.telefono || "—"}</span></div>
                  <div className="cl-fact" style={{ gridColumn: "1 / -1" }}><span className="cl-fact-lbl">Email</span><span className="cl-fact-val">{detail.email || "—"}</span></div>
                  <div className="cl-fact" style={{ gridColumn: "1 / -1" }}><span className="cl-fact-lbl">Dirección</span><span className="cl-fact-val">{detail.direccion || "—"}</span></div>
                  <div className="cl-fact"><span className="cl-fact-lbl">Alta</span><span className="cl-fact-val">{new Date(detail.fecha_creacion).toLocaleDateString("es-GT")}</span></div>
                </div>
              </div>
            </div>
            <div className="cl-drawer-foot">
              <button className="cl-btn-ghost" onClick={() => toggle(detail)}>{detail.activo ? "Desactivar" : "Activar"}</button>
              <button className="cl-btn-primary" style={{ marginLeft: "auto" }} onClick={() => { openEdit(detail); cerrar(); }}><i className="fas fa-pen" /> Editar</button>
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

const CL_CSS = `
.cl-btn-primary{display:inline-flex;align-items:center;gap:8px;background:var(--primary);color:#fff;border:none;border-radius:10px;padding:9px 16px;font:inherit;font-weight:600;font-size:13px;cursor:pointer;transition:all .2s}
.cl-btn-primary:hover{background:var(--primary-hover)}
.cl-btn-ghost{display:inline-flex;align-items:center;gap:8px;background:transparent;border:1.5px solid var(--border);border-radius:10px;padding:9px 16px;font:inherit;font-weight:600;font-size:13px;color:var(--text);cursor:pointer;transition:all .2s}
.cl-btn-ghost:hover{background:var(--border-light)}
.cl-spin{animation:spin .7s linear infinite}

.cl-stat{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--card-radius);padding:18px;box-shadow:var(--card-shadow)}
.cl-stat-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.cl-stat-top i{font-size:16px}
.cl-stat-lbl{font-size:11px;text-transform:uppercase;letter-spacing:.8px;color:var(--text-muted);font-weight:600}
.cl-stat-val{font-family:'Space Grotesk',sans-serif;font-size:24px;font-weight:700;color:var(--text-primary);letter-spacing:-.5px}

.cl-search{width:100%;padding:10px 14px 10px 40px;border-radius:8px;border:1px solid var(--input-border);background:var(--input-bg);color:var(--text-primary);font-size:13px;font-family:inherit;outline:none;box-sizing:border-box;transition:all .25s ease}
.cl-search:focus{border-color:var(--primary)}
.cl-chips{display:flex;gap:8px;flex-wrap:wrap}
.cl-chip{display:inline-flex;align-items:center;gap:7px;padding:7px 13px;border-radius:20px;border:1.5px solid var(--border);background:transparent;color:var(--text-secondary);font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;transition:all .18s}
.cl-chip:hover{border-color:var(--primary);color:var(--primary)}
.cl-chip.active{border-color:var(--primary);background:var(--primary);color:#fff}
.cl-chip-count{font-size:11px;background:var(--border-light);color:var(--text-muted);border-radius:10px;padding:1px 7px;font-weight:700}
.cl-chip.active .cl-chip-count{background:rgba(255,255,255,.25);color:#fff}

.cl-row{cursor:pointer;transition:background .15s}
.cl-row:hover{background:var(--bg-table-row-hover)}
.cl-chevron{color:var(--text-muted);font-size:12px;opacity:.4;transition:all .18s}
.cl-row:hover .cl-chevron{opacity:1;color:var(--primary);transform:translateX(2px)}
.cl-avatar{width:34px;height:34px;border-radius:10px;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;font-family:'Space Grotesk',sans-serif;flex-shrink:0}
.cl-badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;white-space:nowrap}

.cl-overlay{position:fixed;inset:0;background:rgba(15,23,42,0.45);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);z-index:900;animation:fadeIn .25s ease}
.cl-drawer{position:fixed;top:0;right:0;bottom:0;width:480px;max-width:100vw;background:var(--surface);z-index:901;display:flex;flex-direction:column;box-shadow:-10px 0 40px rgba(0,0,0,0.2);animation:clSlide .35s cubic-bezier(0.32,0.72,0,1)}
@keyframes clSlide{from{transform:translateX(100%)}to{transform:translateX(0)}}
.cl-drawer-head{padding:22px 26px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-shrink:0}
.cl-drawer-title{font-size:18px;font-weight:800;letter-spacing:-0.3px;color:var(--text)}
.cl-drawer-sub{font-size:12px;color:var(--text-muted);margin-top:2px;font-family:'Space Grotesk',sans-serif}
.cl-close{width:36px;height:36px;border-radius:10px;background:var(--bg);border:1px solid var(--border);cursor:pointer;color:var(--text-muted);display:flex;align-items:center;justify-content:center;transition:all .2s}
.cl-close:hover{background:var(--danger-bg);color:var(--danger);border-color:transparent}
.cl-drawer-body{flex:1;overflow-y:auto;padding:22px 26px}
.cl-drawer-foot{padding:14px 26px;border-top:1px solid var(--border);display:flex;align-items:center;gap:12px;flex-shrink:0}

.cl-hero{display:flex;align-items:center;gap:16px;padding:18px;background:var(--primary-light);border:1px solid var(--border);border-radius:14px;margin-bottom:20px}
.cl-hero-avatar{width:52px;height:52px;border-radius:14px;color:#fff;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;font-family:'Space Grotesk',sans-serif;flex-shrink:0;box-shadow:0 8px 20px rgba(0,0,0,0.12)}
.cl-hero-name{font-weight:700;font-size:16px;color:var(--text);line-height:1.25}
.cl-hero-badges{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.cl-tag{display:inline-flex;align-items:center;padding:3px 9px;border-radius:20px;font-size:11px;font-weight:600;background:var(--surface);border:1px solid var(--border);color:var(--text-secondary);font-family:'Space Grotesk',sans-serif}

.cl-section{margin-bottom:24px}
.cl-section-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:14px;display:flex;align-items:center;gap:8px}
.cl-section-title::before{content:'';width:3px;height:14px;background:var(--primary);border-radius:2px}
.cl-muted{color:var(--text-muted);font-size:13px;padding:8px 0}
.cl-saldo-card{display:flex;align-items:center;justify-content:space-between;padding:16px;background:var(--bg);border:1px solid var(--border);border-radius:12px;margin-bottom:12px}
.cl-s-lbl{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);font-weight:600;margin-bottom:4px}
.cl-saldo-val{font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:800}
.cl-aging{display:flex;flex-direction:column;gap:1px;background:var(--border);border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:4px}
.cl-aging-row{display:flex;justify-content:space-between;padding:9px 12px;background:var(--surface);font-size:12.5px;color:var(--text-secondary)}
.cl-cuenta{display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid var(--row-border)}
.cl-cuenta:last-child{border-bottom:none}

.cl-facts{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--border);border:1px solid var(--border);border-radius:12px;overflow:hidden}
.cl-fact{background:var(--surface);padding:12px 14px;display:flex;flex-direction:column;gap:3px}
.cl-fact-lbl{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);font-weight:600}
.cl-fact-val{font-size:13px;font-weight:600;color:var(--text);word-break:break-word}

@media(max-width:640px){.cl-drawer{width:100vw}}
`;
