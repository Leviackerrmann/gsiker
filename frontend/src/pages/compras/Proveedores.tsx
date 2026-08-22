import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import api from "../../lib/api";
import Modal from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { useAuth } from "../../contexts/AuthContext";
import { MONEDAS } from "../../lib/money";

interface Proveedor {
  id: number; codigo: string; nombre: string; documento: string | null; direccion: string | null;
  telefono: string | null; email: string | null; moneda: string; activo: boolean; fecha_creacion: string;
}

const AVATAR_COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];
function avatarColor(id: number) { return AVATAR_COLORS[id % AVATAR_COLORS.length]; }
function iniciales(nombre: string) {
  const p = nombre.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  return (p.length === 1 ? p[0].slice(0, 2) : p[0][0] + p[p.length - 1][0]).toUpperCase();
}

export default function ProveedoresPage() {
  const toast = useToast();
  const { empresa } = useAuth();
  const monedaEmp = empresa?.moneda || "GTQ";

  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "activo" | "inactivo">("todos");

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Proveedor | null>(null);
  const [form, setForm] = useState({ codigo: "", nombre: "", documento: "", direccion: "", telefono: "", email: "", moneda: "GTQ" });
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<Proveedor | null>(null);

  const load = async () => { const { data } = await api.get("/compras/proveedores"); setProveedores(data); setLoading(false); };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!detail) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDetail(null); };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", onKey); };
  }, [detail]);

  const reset = () => { setForm({ codigo: "", nombre: "", documento: "", direccion: "", telefono: "", email: "", moneda: monedaEmp }); setEditing(null); setError(""); };
  const openCreate = () => { reset(); setShowForm(true); };
  const openEdit = (p: Proveedor) => { setForm({ codigo: p.codigo, nombre: p.nombre, documento: p.documento || "", direccion: p.direccion || "", telefono: p.telefono || "", email: p.email || "", moneda: p.moneda || "GTQ" }); setEditing(p); setError(""); setShowForm(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    try {
      if (editing) await api.put(`/compras/proveedores/${editing.id}`, { nombre: form.nombre, documento: form.documento || null, direccion: form.direccion || null, telefono: form.telefono || null, email: form.email || null, moneda: form.moneda });
      else await api.post("/compras/proveedores", form);
      toast.success(editing ? "Proveedor actualizado" : "Proveedor creado");
      setShowForm(false); reset(); load();
    } catch (err: any) { setError(err.response?.data?.detail || "Error al guardar"); }
  };

  const toggleActivo = async (p: Proveedor) => {
    await api.put(`/compras/proveedores/${p.id}`, { activo: !p.activo });
    toast.success(p.activo ? "Proveedor desactivado" : "Proveedor activado");
    load(); if (detail?.id === p.id) setDetail({ ...p, activo: !p.activo });
  };

  const filtered = useMemo(() => proveedores.filter((p) => {
    if (filtro === "activo" && !p.activo) return false;
    if (filtro === "inactivo" && p.activo) return false;
    if (search) { const h = `${p.nombre} ${p.codigo} ${p.documento || ""} ${p.telefono || ""}`.toLowerCase(); if (!h.includes(search.toLowerCase())) return false; }
    return true;
  }), [proveedores, filtro, search]);

  const totalActivos = proveedores.filter((p) => p.activo).length;
  const chips: { key: typeof filtro; label: string; count: number }[] = [
    { key: "todos", label: "Todos", count: proveedores.length },
    { key: "activo", label: "Activos", count: totalActivos },
    { key: "inactivo", label: "Inactivos", count: proveedores.length - totalActivos },
  ];

  return (
    <div style={{ animation: "fadeInUp .45s ease forwards" }}>
      <style>{PR_CSS}</style>

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: "'Space Grotesk'", fontSize: 26, fontWeight: 700, letterSpacing: "-0.5px", color: "var(--text-primary)", margin: 0 }}>Proveedores</h1>
          <p style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 4 }}>Directorio de proveedores y datos de contacto</p>
        </div>
        <button className="pr-btn-primary" onClick={openCreate}><i className="fas fa-plus" /> Nuevo proveedor</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 24 }}>
        <div className="pr-stat"><div className="pr-stat-top"><span className="pr-stat-lbl">Total proveedores</span><i className="fas fa-truck-field" style={{ color: "var(--primary)" }} /></div><div className="pr-stat-val">{proveedores.length}</div></div>
        <div className="pr-stat"><div className="pr-stat-top"><span className="pr-stat-lbl">Activos</span><i className="fas fa-circle-check" style={{ color: "var(--success-text)" }} /></div><div className="pr-stat-val" style={{ color: "var(--success-text)" }}>{totalActivos}</div></div>
        <div className="pr-stat"><div className="pr-stat-top"><span className="pr-stat-lbl">Inactivos</span><i className="fas fa-ban" style={{ color: "var(--text-muted)" }} /></div><div className="pr-stat-val">{proveedores.length - totalActivos}</div></div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 220, maxWidth: 340 }}>
          <i className="fas fa-search" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", fontSize: 13 }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre, código o documento..." className="pr-search" />
        </div>
        <div className="pr-chips">
          {chips.map((ch) => <button key={ch.key} className={`pr-chip ${filtro === ch.key ? "active" : ""}`} onClick={() => setFiltro(ch.key)}>{ch.label}<span className="pr-chip-count">{ch.count}</span></button>)}
        </div>
      </div>

      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--card-radius)", overflow: "hidden", boxShadow: "var(--card-shadow)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr><th style={th}>Proveedor</th><th style={th}>Documento</th><th style={th}>Contacto</th><th style={th}>Moneda</th><th style={th}>Estado</th><th style={{ ...th, width: 36 }}></th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ ...td, textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Cargando...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} style={{ ...td, textAlign: "center", padding: 50, color: "var(--text-muted)" }}><i className="fas fa-truck-field" style={{ fontSize: 28, display: "block", marginBottom: 12, opacity: .3 }} />No hay proveedores con estos filtros</td></tr>
            ) : filtered.map((p) => (
              <tr key={p.id} className="pr-row" onClick={() => setDetail(p)} style={{ borderBottom: "1px solid var(--row-border)" }}>
                <td style={td}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="pr-avatar" style={{ background: avatarColor(p.id) }}>{iniciales(p.nombre)}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 13 }}>{p.nombre}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'Space Grotesk'" }}>{p.codigo}</div>
                    </div>
                  </div>
                </td>
                <td style={td}>{p.documento || <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                <td style={td}>{p.telefono || p.email || <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                <td style={td}><span style={{ fontFamily: "'Space Grotesk'", fontWeight: 600 }}>{p.moneda || "GTQ"}</span></td>
                <td style={td}><span className="pr-badge" style={{ background: p.activo ? "var(--success-bg)" : "var(--border-light)", color: p.activo ? "var(--success-text)" : "var(--text-muted)" }}>{p.activo ? "Activo" : "Inactivo"}</span></td>
                <td style={{ ...td, textAlign: "right" }}><i className="fas fa-chevron-right pr-chevron" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal isOpen={showForm} title={editing ? "Editar proveedor" : "Nuevo proveedor"} onClose={() => { setShowForm(false); reset(); }} maxWidth={560}>
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
            <button type="button" onClick={() => { setShowForm(false); reset(); }} className="pr-btn-ghost">Cancelar</button>
            <button type="submit" className="pr-btn-primary">{editing ? "Guardar cambios" : "Crear proveedor"}</button>
          </div>
        </form>
      </Modal>

      {detail && createPortal(
        <>
          <div className="pr-overlay" onClick={() => setDetail(null)} />
          <aside className="pr-drawer" role="dialog" aria-modal="true">
            <div className="pr-drawer-head">
              <div><div className="pr-drawer-title">Proveedor</div><div className="pr-drawer-sub">{detail.codigo}</div></div>
              <button className="pr-close" onClick={() => setDetail(null)} aria-label="Cerrar"><i className="fas fa-xmark" /></button>
            </div>
            <div className="pr-drawer-body">
              <div className="pr-hero">
                <span className="pr-hero-avatar" style={{ background: avatarColor(detail.id) }}>{iniciales(detail.nombre)}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="pr-hero-name">{detail.nombre}</div>
                  <div className="pr-hero-badges">
                    <span className="pr-badge" style={{ background: detail.activo ? "var(--success-bg)" : "var(--border-light)", color: detail.activo ? "var(--success-text)" : "var(--text-muted)" }}>{detail.activo ? "Activo" : "Inactivo"}</span>
                    <span className="pr-tag">{detail.moneda || "GTQ"}</span>
                  </div>
                </div>
              </div>
              <div className="pr-section">
                <div className="pr-section-title">Contacto</div>
                <div className="pr-facts">
                  <div className="pr-fact"><span className="pr-fact-lbl">Documento</span><span className="pr-fact-val">{detail.documento || "—"}</span></div>
                  <div className="pr-fact"><span className="pr-fact-lbl">Teléfono</span><span className="pr-fact-val">{detail.telefono || "—"}</span></div>
                  <div className="pr-fact" style={{ gridColumn: "1 / -1" }}><span className="pr-fact-lbl">Email</span><span className="pr-fact-val">{detail.email || "—"}</span></div>
                  <div className="pr-fact" style={{ gridColumn: "1 / -1" }}><span className="pr-fact-lbl">Dirección</span><span className="pr-fact-val">{detail.direccion || "—"}</span></div>
                  <div className="pr-fact"><span className="pr-fact-lbl">Alta</span><span className="pr-fact-val">{new Date(detail.fecha_creacion).toLocaleDateString("es-GT")}</span></div>
                </div>
              </div>
            </div>
            <div className="pr-drawer-foot">
              <button className="pr-btn-ghost" onClick={() => toggleActivo(detail)}>{detail.activo ? "Desactivar" : "Activar"}</button>
              <button className="pr-btn-primary" style={{ marginLeft: "auto" }} onClick={() => { openEdit(detail); setDetail(null); }}><i className="fas fa-pen" /> Editar</button>
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

const PR_CSS = `
.pr-btn-primary{display:inline-flex;align-items:center;gap:8px;background:var(--primary);color:#fff;border:none;border-radius:10px;padding:9px 16px;font:inherit;font-weight:600;font-size:13px;cursor:pointer;transition:all .2s}
.pr-btn-primary:hover{background:var(--primary-hover)}
.pr-btn-ghost{display:inline-flex;align-items:center;gap:8px;background:transparent;border:1.5px solid var(--border);border-radius:10px;padding:9px 16px;font:inherit;font-weight:600;font-size:13px;color:var(--text);cursor:pointer;transition:all .2s}
.pr-btn-ghost:hover{background:var(--border-light)}

.pr-stat{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--card-radius);padding:18px;box-shadow:var(--card-shadow)}
.pr-stat-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.pr-stat-top i{font-size:16px}
.pr-stat-lbl{font-size:11px;text-transform:uppercase;letter-spacing:.8px;color:var(--text-muted);font-weight:600}
.pr-stat-val{font-family:'Space Grotesk',sans-serif;font-size:24px;font-weight:700;color:var(--text-primary);letter-spacing:-.5px}

.pr-search{width:100%;padding:10px 14px 10px 40px;border-radius:8px;border:1px solid var(--input-border);background:var(--input-bg);color:var(--text-primary);font-size:13px;font-family:inherit;outline:none;box-sizing:border-box}
.pr-search:focus{border-color:var(--primary)}
.pr-chips{display:flex;gap:8px;flex-wrap:wrap}
.pr-chip{display:inline-flex;align-items:center;gap:7px;padding:7px 13px;border-radius:20px;border:1.5px solid var(--border);background:transparent;color:var(--text-secondary);font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;transition:all .18s}
.pr-chip:hover{border-color:var(--primary);color:var(--primary)}
.pr-chip.active{border-color:var(--primary);background:var(--primary);color:#fff}
.pr-chip-count{font-size:11px;background:var(--border-light);color:var(--text-muted);border-radius:10px;padding:1px 7px;font-weight:700}
.pr-chip.active .pr-chip-count{background:rgba(255,255,255,.25);color:#fff}

.pr-row{cursor:pointer;transition:background .15s}
.pr-row:hover{background:var(--bg-table-row-hover)}
.pr-chevron{color:var(--text-muted);font-size:12px;opacity:.4;transition:all .18s}
.pr-row:hover .pr-chevron{opacity:1;color:var(--primary);transform:translateX(2px)}
.pr-avatar{width:34px;height:34px;border-radius:10px;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;font-family:'Space Grotesk',sans-serif;flex-shrink:0}
.pr-badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;white-space:nowrap}

.pr-overlay{position:fixed;inset:0;background:rgba(15,23,42,0.45);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);z-index:900;animation:fadeIn .25s ease}
.pr-drawer{position:fixed;top:0;right:0;bottom:0;width:460px;max-width:100vw;background:var(--surface);z-index:901;display:flex;flex-direction:column;box-shadow:-10px 0 40px rgba(0,0,0,0.2);animation:prSlide .35s cubic-bezier(0.32,0.72,0,1)}
@keyframes prSlide{from{transform:translateX(100%)}to{transform:translateX(0)}}
.pr-drawer-head{padding:22px 26px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-shrink:0}
.pr-drawer-title{font-size:18px;font-weight:800;letter-spacing:-0.3px;color:var(--text)}
.pr-drawer-sub{font-size:12px;color:var(--text-muted);margin-top:2px;font-family:'Space Grotesk',sans-serif}
.pr-close{width:36px;height:36px;border-radius:10px;background:var(--bg);border:1px solid var(--border);cursor:pointer;color:var(--text-muted);display:flex;align-items:center;justify-content:center;transition:all .2s}
.pr-close:hover{background:var(--danger-bg);color:var(--danger);border-color:transparent}
.pr-drawer-body{flex:1;overflow-y:auto;padding:22px 26px}
.pr-drawer-foot{padding:14px 26px;border-top:1px solid var(--border);display:flex;align-items:center;gap:12px;flex-shrink:0}

.pr-hero{display:flex;align-items:center;gap:16px;padding:18px;background:var(--primary-light);border:1px solid var(--border);border-radius:14px;margin-bottom:20px}
.pr-hero-avatar{width:52px;height:52px;border-radius:14px;color:#fff;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;font-family:'Space Grotesk',sans-serif;flex-shrink:0;box-shadow:0 8px 20px rgba(0,0,0,0.12)}
.pr-hero-name{font-weight:700;font-size:16px;color:var(--text);line-height:1.25}
.pr-hero-badges{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.pr-tag{display:inline-flex;align-items:center;padding:3px 9px;border-radius:20px;font-size:11px;font-weight:600;background:var(--surface);border:1px solid var(--border);color:var(--text-secondary);font-family:'Space Grotesk',sans-serif}

.pr-section{margin-bottom:24px}
.pr-section-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:14px;display:flex;align-items:center;gap:8px}
.pr-section-title::before{content:'';width:3px;height:14px;background:var(--primary);border-radius:2px}
.pr-facts{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--border);border:1px solid var(--border);border-radius:12px;overflow:hidden}
.pr-fact{background:var(--surface);padding:12px 14px;display:flex;flex-direction:column;gap:3px}
.pr-fact-lbl{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);font-weight:600}
.pr-fact-val{font-size:13px;font-weight:600;color:var(--text);word-break:break-word}

@media(max-width:640px){.pr-drawer{width:100vw}}
`;
