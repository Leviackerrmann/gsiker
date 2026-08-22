import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import api from "../../lib/api";
import Modal from "../../components/Modal";
import SearchableSelect from "../../components/SearchableSelect";
import { useToast } from "../../components/Toast";
import { formatMoney } from "../../lib/money";

interface Item { id: number; sku_id: number; sku_codigo: string; sku_descripcion: string; cantidad: number; precio_unitario: number; precio_total: number; }
interface Cotizacion { id: number; numero: string; cliente_id: number; cliente_nombre: string; fecha: string; estado: string; notas: string | null; usuario_nombre: string | null; items: Item[]; }

const ESTADO_META: Record<string, { label: string; bg: string; fg: string }> = {
  pendiente: { label: "Pendiente", bg: "var(--warning-bg)", fg: "var(--warning-text)" },
  aceptada: { label: "Aceptada", bg: "var(--primary-light)", fg: "var(--primary)" },
  convertida: { label: "Convertida", bg: "var(--success-bg)", fg: "var(--success-text)" },
  rechazada: { label: "Rechazada", bg: "var(--danger-bg)", fg: "var(--danger-text)" },
};
function fmtFecha(s: string) { return new Date(s).toLocaleDateString("es-GT", { day: "2-digit", month: "short", year: "numeric" }); }
const totalDe = (c: Cotizacion) => c.items.reduce((a, i) => a + i.precio_total, 0);

export default function CotizacionesVentaPage() {
  const toast = useToast();
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [skus, setSkus] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [clienteId, setClienteId] = useState("");
  const [lineItems, setLineItems] = useState<{ sku_id: string; cantidad: string; precio: string }[]>([{ sku_id: "", cantidad: "", precio: "" }]);
  const [search, setSearch] = useState("");
  const [filtro, setFiltro] = useState("");
  const [detail, setDetail] = useState<Cotizacion | null>(null);

  const load = async () => { const { data } = await api.get("/ventas/cotizaciones"); setCotizaciones(data); setLoading(false); };
  useEffect(() => { api.get("/ventas/clientes").then(r => setClientes(r.data.filter((c: any) => c.activo))); api.get("/skus?limit=300").then(r => setSkus(r.data)); load(); }, []);

  useEffect(() => {
    if (!detail) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDetail(null); };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", onKey); };
  }, [detail]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/ventas/cotizaciones", { cliente_id: Number(clienteId), items: lineItems.map(l => ({ sku_id: Number(l.sku_id), cantidad: Number(l.cantidad), precio_unitario: Number(l.precio) || 0 })) });
      toast.success("Cotización creada");
      setShowForm(false); setClienteId(""); setLineItems([{ sku_id: "", cantidad: "", precio: "" }]); load();
    } catch (err: any) { toast.error(err.response?.data?.detail || "Error al crear"); }
  };

  const handleAction = async (id: number, action: string) => {
    try {
      if (action === "convertir") { const r = await api.post(`/ventas/cotizaciones/${id}/convertir`); toast.success(`Pedido ${r.data.numero} creado`); }
      else { await api.post(`/ventas/cotizaciones/${id}/${action}`); toast.success("Cotización actualizada"); }
      setDetail(null); load();
    } catch (err: any) { toast.error(err.response?.data?.detail || "Error"); }
  };

  const skuOpts = skus.map((s: any) => ({ value: String(s.id), label: `${s.codigo_sku} - ${s.descripcion}` }));
  const clienteOpts = clientes.map((c: any) => ({ value: String(c.id), label: `${c.codigo} - ${c.nombre}` }));

  const counts = useMemo(() => {
    const c: Record<string, number> = { pendiente: 0, aceptada: 0, convertida: 0, rechazada: 0 };
    for (const q of cotizaciones) c[q.estado] = (c[q.estado] || 0) + 1;
    return c;
  }, [cotizaciones]);
  const valorPendiente = cotizaciones.filter((c) => c.estado === "pendiente" || c.estado === "aceptada").reduce((a, c) => a + totalDe(c), 0);

  const filtered = cotizaciones.filter((c) => {
    if (filtro && c.estado !== filtro) return false;
    if (search) { const h = `${c.numero} ${c.cliente_nombre}`.toLowerCase(); if (!h.includes(search.toLowerCase())) return false; }
    return true;
  });

  const chips = [
    { key: "", label: "Todas", count: cotizaciones.length },
    { key: "pendiente", label: "Pendientes", count: counts.pendiente },
    { key: "aceptada", label: "Aceptadas", count: counts.aceptada },
    { key: "convertida", label: "Convertidas", count: counts.convertida },
    { key: "rechazada", label: "Rechazadas", count: counts.rechazada },
  ];

  return (
    <div style={{ animation: "fadeInUp .45s ease forwards" }}>
      <style>{QV_CSS}</style>

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: "'Space Grotesk'", fontSize: 26, fontWeight: 700, letterSpacing: "-0.5px", color: "var(--text-primary)", margin: 0 }}>Cotizaciones de venta</h1>
          <p style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 4 }}>Presupuestos a clientes y conversión a pedido</p>
        </div>
        <button className="qv-btn-primary" onClick={() => setShowForm(true)}><i className="fas fa-plus" /> Nueva cotización</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 24 }}>
        <div className="qv-stat"><div className="qv-stat-top"><span className="qv-stat-lbl">Total</span><i className="fas fa-file-lines" style={{ color: "var(--primary)" }} /></div><div className="qv-stat-val">{cotizaciones.length}</div></div>
        <div className="qv-stat"><div className="qv-stat-top"><span className="qv-stat-lbl">Abiertas</span><i className="fas fa-hourglass-half" style={{ color: "var(--warning-text)" }} /></div><div className="qv-stat-val" style={{ color: "var(--warning-text)" }}>{counts.pendiente + counts.aceptada}</div></div>
        <div className="qv-stat"><div className="qv-stat-top"><span className="qv-stat-lbl">Convertidas</span><i className="fas fa-circle-check" style={{ color: "var(--success-text)" }} /></div><div className="qv-stat-val" style={{ color: "var(--success-text)" }}>{counts.convertida}</div></div>
        <div className="qv-stat"><div className="qv-stat-top"><span className="qv-stat-lbl">Valor en pipeline</span><i className="fas fa-coins" style={{ color: "var(--primary)" }} /></div><div className="qv-stat-val" style={{ fontSize: 19 }}>{formatMoney(valorPendiente, "GTQ")}</div></div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 220, maxWidth: 320 }}>
          <i className="fas fa-search" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", fontSize: 13 }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por número o cliente..." className="qv-search" />
        </div>
        <div className="qv-chips">
          {chips.map((ch) => <button key={ch.key || "todas"} className={`qv-chip ${filtro === ch.key ? "active" : ""}`} onClick={() => setFiltro(ch.key)}>{ch.label}<span className="qv-chip-count">{ch.count}</span></button>)}
        </div>
      </div>

      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--card-radius)", overflow: "hidden", boxShadow: "var(--card-shadow)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Cotización</th><th style={th}>Cliente</th><th style={th}>Fecha</th>
              <th style={{ ...th, textAlign: "center" }}>Ítems</th><th style={{ ...th, textAlign: "right" }}>Total</th><th style={th}>Estado</th><th style={{ ...th, width: 36 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ ...td, textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Cargando...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ ...td, textAlign: "center", padding: 50, color: "var(--text-muted)" }}><i className="fas fa-file-lines" style={{ fontSize: 28, display: "block", marginBottom: 12, opacity: .3 }} />No hay cotizaciones con estos filtros</td></tr>
            ) : filtered.map((c) => {
              const meta = ESTADO_META[c.estado] || ESTADO_META.rechazada;
              return (
                <tr key={c.id} className="qv-row" onClick={() => setDetail(c)} style={{ borderBottom: "1px solid var(--row-border)" }}>
                  <td style={td}><span style={{ fontFamily: "'Space Grotesk'", fontWeight: 700, color: "var(--primary)" }}>{c.numero}</span></td>
                  <td style={{ ...td, fontWeight: 600, color: "var(--text-primary)" }}>{c.cliente_nombre}</td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>{fmtFecha(c.fecha)}</td>
                  <td style={{ ...td, textAlign: "center", fontFamily: "'Space Grotesk'" }}>{c.items.length}</td>
                  <td style={{ ...td, textAlign: "right", fontFamily: "'Space Grotesk'", fontWeight: 700 }}>{formatMoney(totalDe(c), "GTQ")}</td>
                  <td style={td}><span className="qv-badge" style={{ background: meta.bg, color: meta.fg }}>{meta.label}</span></td>
                  <td style={{ ...td, textAlign: "right" }}><i className="fas fa-chevron-right qv-chevron" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal crear */}
      <Modal isOpen={showForm} title="Nueva cotización de venta" onClose={() => setShowForm(false)} maxWidth={620}>
        <form onSubmit={handleCreate}>
          <div style={{ marginBottom: 12 }}><label style={lbl}>Cliente</label><SearchableSelect options={clienteOpts} value={clienteId} onChange={setClienteId} placeholder="Seleccionar cliente" required /></div>
          <label style={lbl}>Ítems</label>
          {lineItems.map((li, idx) => (
            <div key={idx} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 40px", gap: 8, marginBottom: 8 }}>
              <SearchableSelect options={skuOpts} value={li.sku_id} onChange={(v) => { const c = [...lineItems]; c[idx].sku_id = v; setLineItems(c); }} placeholder="SKU" required />
              <input type="number" step="0.01" min="0.01" placeholder="Cant" value={li.cantidad} onChange={(e) => { const c2 = [...lineItems]; c2[idx].cantidad = e.target.value; setLineItems(c2); }} style={inp} required />
              <input type="number" step="0.01" min="0" placeholder="Precio" value={li.precio} onChange={(e) => { const c3 = [...lineItems]; c3[idx].precio = e.target.value; setLineItems(c3); }} style={inp} />
              <button type="button" onClick={() => { if (lineItems.length > 1) setLineItems(lineItems.filter((_, i) => i !== idx)); }} className="qv-btn-ghost" style={{ padding: "4px 8px" }}>×</button>
            </div>
          ))}
          <button type="button" onClick={() => setLineItems([...lineItems, { sku_id: "", cantidad: "", precio: "" }])} className="qv-btn-ghost" style={{ marginBottom: 14 }}>+ Agregar ítem</button>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" onClick={() => setShowForm(false)} className="qv-btn-ghost">Cancelar</button>
            <button type="submit" className="qv-btn-primary">Crear cotización</button>
          </div>
        </form>
      </Modal>

      {/* Drawer detalle */}
      {detail && createPortal(
        <>
          <div className="qv-overlay" onClick={() => setDetail(null)} />
          <aside className="qv-drawer" role="dialog" aria-modal="true">
            <div className="qv-drawer-head">
              <div><div className="qv-drawer-title">Cotización {detail.numero}</div><div className="qv-drawer-sub">{fmtFecha(detail.fecha)}</div></div>
              <button className="qv-close" onClick={() => setDetail(null)} aria-label="Cerrar"><i className="fas fa-xmark" /></button>
            </div>
            <div className="qv-drawer-body">
              <div className="qv-hero">
                <div className="qv-hero-icon"><i className="fas fa-file-lines" /></div>
                <div style={{ minWidth: 0 }}>
                  <div className="qv-hero-name">{detail.cliente_nombre}</div>
                  <div className="qv-hero-sub">{detail.usuario_nombre ? `Por ${detail.usuario_nombre}` : "—"}</div>
                  <div className="qv-hero-badges"><span className="qv-badge" style={{ background: (ESTADO_META[detail.estado] || ESTADO_META.rechazada).bg, color: (ESTADO_META[detail.estado] || ESTADO_META.rechazada).fg }}>{(ESTADO_META[detail.estado] || ESTADO_META.rechazada).label}</span></div>
                </div>
              </div>

              <div className="qv-section">
                <div className="qv-section-title">Ítems ({detail.items.length})</div>
                <div className="qv-items">
                  {detail.items.map((it) => (
                    <div key={it.id} className="qv-item">
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{it.sku_descripcion}</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'Space Grotesk'" }}>{it.sku_codigo} · {it.cantidad} × {formatMoney(it.precio_unitario, "GTQ")}</div>
                      </div>
                      <div style={{ fontFamily: "'Space Grotesk'", fontWeight: 700, color: "var(--text)" }}>{formatMoney(it.precio_total, "GTQ")}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="qv-totals">
                <div className="qv-total-row qv-total-grand"><span>Total</span><span>{formatMoney(totalDe(detail), "GTQ")}</span></div>
              </div>

              {detail.notas && <div className="qv-section" style={{ marginTop: 20 }}><div className="qv-section-title">Notas</div><div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{detail.notas}</div></div>}
            </div>
            {(detail.estado === "pendiente" || detail.estado === "aceptada") && (
              <div className="qv-drawer-foot">
                {detail.estado === "pendiente" && <>
                  <button className="qv-btn-danger" onClick={() => handleAction(detail.id, "rechazar")}>Rechazar</button>
                  <button className="qv-btn-primary" style={{ marginLeft: "auto" }} onClick={() => handleAction(detail.id, "aceptar")}><i className="fas fa-check" /> Aceptar</button>
                </>}
                {detail.estado === "aceptada" && <button className="qv-btn-success" style={{ marginLeft: "auto" }} onClick={() => handleAction(detail.id, "convertir")}><i className="fas fa-arrow-right-arrow-left" /> Convertir a pedido</button>}
              </div>
            )}
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

const QV_CSS = `
.qv-btn-primary{display:inline-flex;align-items:center;gap:8px;background:var(--primary);color:#fff;border:none;border-radius:10px;padding:9px 16px;font:inherit;font-weight:600;font-size:13px;cursor:pointer;transition:all .2s}
.qv-btn-primary:hover{background:var(--primary-hover)}
.qv-btn-success{display:inline-flex;align-items:center;gap:8px;background:var(--success-text);color:#fff;border:none;border-radius:10px;padding:9px 16px;font:inherit;font-weight:600;font-size:13px;cursor:pointer;transition:all .2s}
.qv-btn-success:hover{filter:brightness(1.05)}
.qv-btn-ghost{display:inline-flex;align-items:center;gap:8px;background:transparent;border:1.5px solid var(--border);border-radius:10px;padding:9px 16px;font:inherit;font-weight:600;font-size:13px;color:var(--text);cursor:pointer;transition:all .2s}
.qv-btn-ghost:hover{background:var(--border-light)}
.qv-btn-danger{display:inline-flex;align-items:center;gap:8px;background:var(--danger-bg);color:var(--danger-text);border:none;border-radius:10px;padding:9px 16px;font:inherit;font-weight:600;font-size:13px;cursor:pointer;transition:all .2s}
.qv-btn-danger:hover{filter:brightness(.96)}

.qv-stat{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--card-radius);padding:18px;box-shadow:var(--card-shadow)}
.qv-stat-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.qv-stat-top i{font-size:16px}
.qv-stat-lbl{font-size:11px;text-transform:uppercase;letter-spacing:.8px;color:var(--text-muted);font-weight:600}
.qv-stat-val{font-family:'Space Grotesk',sans-serif;font-size:24px;font-weight:700;color:var(--text-primary);letter-spacing:-.5px}

.qv-search{width:100%;padding:10px 14px 10px 40px;border-radius:8px;border:1px solid var(--input-border);background:var(--input-bg);color:var(--text-primary);font-size:13px;font-family:inherit;outline:none;box-sizing:border-box}
.qv-search:focus{border-color:var(--primary)}
.qv-chips{display:flex;gap:8px;flex-wrap:wrap}
.qv-chip{display:inline-flex;align-items:center;gap:7px;padding:7px 13px;border-radius:20px;border:1.5px solid var(--border);background:transparent;color:var(--text-secondary);font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;transition:all .18s}
.qv-chip:hover{border-color:var(--primary);color:var(--primary)}
.qv-chip.active{border-color:var(--primary);background:var(--primary);color:#fff}
.qv-chip-count{font-size:11px;background:var(--border-light);color:var(--text-muted);border-radius:10px;padding:1px 7px;font-weight:700}
.qv-chip.active .qv-chip-count{background:rgba(255,255,255,.25);color:#fff}

.qv-row{cursor:pointer;transition:background .15s}
.qv-row:hover{background:var(--bg-table-row-hover)}
.qv-chevron{color:var(--text-muted);font-size:12px;opacity:.4;transition:all .18s}
.qv-row:hover .qv-chevron{opacity:1;color:var(--primary);transform:translateX(2px)}
.qv-badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;white-space:nowrap}

.qv-overlay{position:fixed;inset:0;background:rgba(15,23,42,0.45);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);z-index:900;animation:fadeIn .25s ease}
.qv-drawer{position:fixed;top:0;right:0;bottom:0;width:480px;max-width:100vw;background:var(--surface);z-index:901;display:flex;flex-direction:column;box-shadow:-10px 0 40px rgba(0,0,0,0.2);animation:qvSlide .35s cubic-bezier(0.32,0.72,0,1)}
@keyframes qvSlide{from{transform:translateX(100%)}to{transform:translateX(0)}}
.qv-drawer-head{padding:22px 26px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-shrink:0}
.qv-drawer-title{font-size:18px;font-weight:800;letter-spacing:-0.3px;color:var(--text)}
.qv-drawer-sub{font-size:12px;color:var(--text-muted);margin-top:2px;font-family:'Space Grotesk',sans-serif}
.qv-close{width:36px;height:36px;border-radius:10px;background:var(--bg);border:1px solid var(--border);cursor:pointer;color:var(--text-muted);display:flex;align-items:center;justify-content:center;transition:all .2s}
.qv-close:hover{background:var(--danger-bg);color:var(--danger);border-color:transparent}
.qv-drawer-body{flex:1;overflow-y:auto;padding:22px 26px}
.qv-drawer-foot{padding:14px 26px;border-top:1px solid var(--border);display:flex;align-items:center;gap:10px;flex-shrink:0}

.qv-hero{display:flex;align-items:center;gap:16px;padding:18px;background:var(--primary-light);border:1px solid var(--border);border-radius:14px;margin-bottom:20px}
.qv-hero-icon{width:52px;height:52px;border-radius:14px;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;box-shadow:0 8px 20px rgba(0,0,0,0.12)}
.qv-hero-name{font-weight:700;font-size:16px;color:var(--text);line-height:1.25}
.qv-hero-sub{font-size:12.5px;color:var(--text-muted);margin-top:2px}
.qv-hero-badges{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}

.qv-section{margin-bottom:20px}
.qv-section-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:14px;display:flex;align-items:center;gap:8px}
.qv-section-title::before{content:'';width:3px;height:14px;background:var(--primary);border-radius:2px}
.qv-items{display:flex;flex-direction:column;gap:8px}
.qv-item{display:flex;align-items:center;gap:12px;padding:11px 14px;background:var(--bg);border:1px solid var(--border);border-radius:10px}
.qv-totals{background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:14px 16px}
.qv-total-row{display:flex;justify-content:space-between;font-size:13px;color:var(--text-secondary);padding:4px 0;font-family:'Space Grotesk',sans-serif}
.qv-total-grand{font-size:17px;font-weight:800;color:var(--text)}
.qv-total-grand span:last-child{color:var(--primary)}

@media(max-width:640px){.qv-drawer{width:100vw}}
`;
