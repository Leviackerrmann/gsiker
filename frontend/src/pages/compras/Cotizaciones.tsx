import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import api from "../../lib/api";
import Modal from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { formatMoney } from "../../lib/money";

interface Item { id: number; sku_id: number; sku_codigo: string; sku_descripcion: string; cantidad: number; }
interface Propuesta { id: number; proveedor_nombre: string; fecha: string; adjudicada: boolean; notas: string | null; total: number; items: { item_cotizacion_id: number; costo_unitario: number }[]; }
interface Cotizacion { id: number; numero: string; fecha: string; estado: string; notas: string | null; usuario_nombre: string | null; items: Item[]; propuestas: Propuesta[]; }

const ESTADO_META: Record<string, { label: string; bg: string; fg: string }> = {
  pendiente: { label: "Pendiente", bg: "var(--warning-bg)", fg: "var(--warning-text)" },
  en_proceso: { label: "En proceso", bg: "var(--primary-light)", fg: "var(--primary)" },
  adjudicada: { label: "Adjudicada", bg: "var(--success-bg)", fg: "var(--success-text)" },
};
const fmtFecha = (s: string) => new Date(s).toLocaleDateString("es-GT", { day: "2-digit", month: "short", year: "numeric" });

export default function CotizacionesPage() {
  const toast = useToast();
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [provs, setProvs] = useState<any[]>([]);
  const [skus, setSkus] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filtro, setFiltro] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [lineItems, setLineItems] = useState<{ sku_id: string; cantidad: string }[]>([{ sku_id: "", cantidad: "" }]);

  const [detail, setDetail] = useState<Cotizacion | null>(null);
  const [showProp, setShowProp] = useState<Cotizacion | null>(null);
  const [propProv, setPropProv] = useState("");
  const [propCostos, setPropCostos] = useState<Record<number, string>>({});

  const load = async () => { const { data } = await api.get("/compras/cotizaciones"); setCotizaciones(data); setLoading(false); if (detail) setDetail(data.find((c: Cotizacion) => c.id === detail.id) || null); };
  useEffect(() => { api.get("/compras/proveedores").then((r) => setProvs(r.data)); api.get("/skus?limit=300").then((r) => setSkus(r.data)); load(); }, []);

  useEffect(() => {
    if (!detail) return;
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDetail(null); };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", onKey); };
  }, [detail]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/compras/cotizaciones", { items: lineItems.map((l) => ({ sku_id: Number(l.sku_id), cantidad: Number(l.cantidad) })) });
      toast.success("Cotización creada");
      setShowCreate(false); setLineItems([{ sku_id: "", cantidad: "" }]); load();
    } catch (err: any) { toast.error(err.response?.data?.detail || "Error"); }
  };

  const openPropuesta = (cot: Cotizacion) => {
    setShowProp(cot); setPropProv(provs[0]?.id?.toString() || "");
    const costs: Record<number, string> = {}; cot.items.forEach((i) => { costs[i.id] = ""; }); setPropCostos(costs);
  };
  const handleRegistrarPropuesta = async () => {
    const items = Object.entries(propCostos).filter(([, v]) => v !== "").map(([k, v]) => ({ item_cotizacion_id: Number(k), costo_unitario: Number(v) }));
    if (items.length === 0) { toast.error("Ingresa al menos un costo"); return; }
    try { await api.post(`/compras/cotizaciones/${showProp!.id}/propuestas`, { proveedor_id: Number(propProv), items }); toast.success("Propuesta registrada"); setShowProp(null); load(); }
    catch (err: any) { toast.error(err.response?.data?.detail || "Error"); }
  };
  const handleAdjudicar = async (cotId: number, propId: number) => {
    if (!confirm("¿Adjudicar esta propuesta? Se creará una OC automática.")) return;
    try { const { data } = await api.post(`/compras/cotizaciones/${cotId}/adjudicar`, { propuesta_id: propId }); toast.success(`OC ${data.numero_oc} creada`); setDetail(null); load(); }
    catch (err: any) { toast.error(err.response?.data?.detail || "Error"); }
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = { pendiente: 0, en_proceso: 0, adjudicada: 0 };
    for (const q of cotizaciones) c[q.estado] = (c[q.estado] || 0) + 1;
    return c;
  }, [cotizaciones]);

  const filtered = cotizaciones.filter((c) => {
    if (filtro && c.estado !== filtro) return false;
    if (search && !c.numero.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const chips = [
    { key: "", label: "Todas", count: cotizaciones.length },
    { key: "pendiente", label: "Pendientes", count: counts.pendiente },
    { key: "en_proceso", label: "En proceso", count: counts.en_proceso },
    { key: "adjudicada", label: "Adjudicadas", count: counts.adjudicada },
  ];
  const mejorPropuesta = (c: Cotizacion) => c.propuestas.length ? Math.min(...c.propuestas.map((p) => p.total)) : null;

  return (
    <div style={{ animation: "fadeInUp .45s ease forwards" }}>
      <div className="ui-head">
        <div><h1 className="ui-title">Cotizaciones de compra</h1><p className="ui-subtitle">Solicitudes de precio a proveedores, comparación y adjudicación</p></div>
        <button className="ui-btn-primary" onClick={() => setShowCreate(true)}><i className="fas fa-plus" /> Nueva cotización</button>
      </div>

      <div className="ui-stats">
        <div className="ui-stat"><div className="ui-stat-top"><span className="ui-stat-lbl">Total</span><i className="fas fa-scale-balanced" style={{ color: "var(--primary)" }} /></div><div className="ui-stat-val">{cotizaciones.length}</div></div>
        <div className="ui-stat"><div className="ui-stat-top"><span className="ui-stat-lbl">Abiertas</span><i className="fas fa-hourglass-half" style={{ color: "var(--warning-text)" }} /></div><div className="ui-stat-val" style={{ color: "var(--warning-text)" }}>{counts.pendiente + counts.en_proceso}</div></div>
        <div className="ui-stat"><div className="ui-stat-top"><span className="ui-stat-lbl">Adjudicadas</span><i className="fas fa-gavel" style={{ color: "var(--success-text)" }} /></div><div className="ui-stat-val" style={{ color: "var(--success-text)" }}>{counts.adjudicada}</div></div>
      </div>

      <div className="ui-toolbar">
        <div className="ui-search-wrap"><i className="fas fa-search" /><input className="ui-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por número..." /></div>
        <div className="ui-chips">{chips.map((ch) => <button key={ch.key || "todas"} className={`ui-chip ${filtro === ch.key ? "active" : ""}`} onClick={() => setFiltro(ch.key)}>{ch.label}<span className="ui-chip-count">{ch.count}</span></button>)}</div>
      </div>

      <div className="ui-table-wrap">
        <table className="ui-table">
          <thead><tr><th>Cotización</th><th>Fecha</th><th style={{ textAlign: "center" }}>Ítems</th><th style={{ textAlign: "center" }}>Propuestas</th><th style={{ textAlign: "right" }}>Mejor oferta</th><th>Estado</th><th style={{ width: 36 }}></th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={7} style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Cargando...</td></tr>
            : filtered.length === 0 ? <tr><td colSpan={7} className="ui-empty"><i className="fas fa-scale-balanced" />No hay cotizaciones con estos filtros</td></tr>
            : filtered.map((c) => {
              const meta = ESTADO_META[c.estado] || ESTADO_META.pendiente;
              const mejor = mejorPropuesta(c);
              return (
                <tr key={c.id} className="ui-row" onClick={() => setDetail(c)}>
                  <td><span className="ui-code">{c.numero}</span></td>
                  <td style={{ whiteSpace: "nowrap" }}>{fmtFecha(c.fecha)}</td>
                  <td style={{ textAlign: "center" }} className="ui-mono">{c.items.length}</td>
                  <td style={{ textAlign: "center" }} className="ui-mono">{c.propuestas.length}</td>
                  <td style={{ textAlign: "right" }} className="ui-mono">{mejor != null ? formatMoney(mejor, "GTQ") : <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                  <td><span className="ui-badge" style={{ background: meta.bg, color: meta.fg }}>{meta.label}</span></td>
                  <td style={{ textAlign: "right" }}><i className="fas fa-chevron-right ui-chevron" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal crear */}
      <Modal isOpen={showCreate} title="Nueva cotización de compra" onClose={() => setShowCreate(false)} maxWidth={560}>
        <form onSubmit={handleCreate}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--text-muted)", marginBottom: 8 }}>Ítems a cotizar</label>
          {lineItems.map((li, idx) => (
            <div key={idx} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 40px", gap: 8, marginBottom: 8 }}>
              <select value={li.sku_id} onChange={(e) => { const c = [...lineItems]; c[idx].sku_id = e.target.value; setLineItems(c); }} className="ui-input" required><option value="">SKU</option>{skus.map((s) => <option key={s.id} value={s.id}>{s.codigo_sku} - {s.descripcion}</option>)}</select>
              <input type="number" step="0.01" min="0.01" placeholder="Cant." value={li.cantidad} onChange={(e) => { const c = [...lineItems]; c[idx].cantidad = e.target.value; setLineItems(c); }} className="ui-input" required />
              <button type="button" onClick={() => { if (lineItems.length > 1) setLineItems(lineItems.filter((_, i) => i !== idx)); }} className="ui-btn-ghost" style={{ padding: "4px 8px" }}>×</button>
            </div>
          ))}
          <button type="button" onClick={() => setLineItems([...lineItems, { sku_id: "", cantidad: "" }])} className="ui-btn-ghost" style={{ margin: "6px 0 14px" }}>+ Agregar ítem</button>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" onClick={() => setShowCreate(false)} className="ui-btn-ghost">Cancelar</button>
            <button type="submit" className="ui-btn-primary">Crear cotización</button>
          </div>
        </form>
      </Modal>

      {/* Modal registrar propuesta */}
      {showProp && (
        <Modal isOpen={!!showProp} title={`Propuesta — ${showProp.numero}`} onClose={() => setShowProp(null)} maxWidth={520}>
          <div className="ui-field"><label>Proveedor</label><select value={propProv} onChange={(e) => setPropProv(e.target.value)} className="ui-input">{provs.map((p: any) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
          {showProp.items.map((i) => (
            <div key={i.id} style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}>
              <span style={{ flex: 1, fontSize: 13 }}>{i.sku_codigo} <span style={{ color: "var(--text-muted)" }}>({i.cantidad.toLocaleString()} u)</span></span>
              <input type="number" step="0.01" placeholder="Costo unit." value={propCostos[i.id] || ""} onChange={(e) => setPropCostos({ ...propCostos, [i.id]: e.target.value })} className="ui-input" style={{ width: 130 }} />
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
            <button onClick={() => setShowProp(null)} className="ui-btn-ghost">Cerrar</button>
            <button onClick={handleRegistrarPropuesta} className="ui-btn-primary">Registrar propuesta</button>
          </div>
        </Modal>
      )}

      {/* Drawer detalle */}
      {detail && createPortal(
        <>
          <div className="ui-overlay" onClick={() => setDetail(null)} />
          <aside className="ui-drawer" role="dialog" aria-modal="true">
            <div className="ui-drawer-head">
              <div><div className="ui-drawer-title">Cotización {detail.numero}</div><div className="ui-drawer-sub">{fmtFecha(detail.fecha)}</div></div>
              <button className="ui-close" onClick={() => setDetail(null)}><i className="fas fa-xmark" /></button>
            </div>
            <div className="ui-drawer-body">
              <div className="ui-hero">
                <div className="ui-hero-icon"><i className="fas fa-scale-balanced" /></div>
                <div style={{ minWidth: 0 }}>
                  <div className="ui-hero-name">{detail.items.length} ítems · {detail.propuestas.length} propuestas</div>
                  <div className="ui-hero-sub">{detail.usuario_nombre ? `Por ${detail.usuario_nombre}` : "—"}</div>
                  <div className="ui-hero-badges"><span className="ui-badge" style={{ background: (ESTADO_META[detail.estado] || ESTADO_META.pendiente).bg, color: (ESTADO_META[detail.estado] || ESTADO_META.pendiente).fg }}>{(ESTADO_META[detail.estado] || ESTADO_META.pendiente).label}</span></div>
                </div>
              </div>

              <div className="ui-section">
                <div className="ui-section-title">Ítems solicitados</div>
                <div className="ui-items">
                  {detail.items.map((it) => (
                    <div key={it.id} className="ui-item">
                      <div style={{ minWidth: 0, flex: 1 }}><div className="ui-item-title">{it.sku_descripcion}</div><div className="ui-item-sub">{it.sku_codigo}</div></div>
                      <div className="ui-item-val">{it.cantidad.toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="ui-section">
                <div className="ui-section-title">Propuestas de proveedores</div>
                {detail.propuestas.length === 0 ? (
                  <div className="ui-empty-box"><i className="fas fa-inbox" /> Aún sin propuestas registradas</div>
                ) : (
                  <div className="ui-items">
                    {detail.propuestas.slice().sort((a, b) => a.total - b.total).map((p, idx) => (
                      <div key={p.id} className="ui-item" style={p.adjudicada ? { borderColor: "var(--success-text)", background: "var(--success-bg)" } : idx === 0 ? { borderColor: "var(--primary)" } : undefined}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div className="ui-item-title">{p.proveedor_nombre} {idx === 0 && !p.adjudicada && <span style={{ fontSize: 10, color: "var(--primary)", fontWeight: 700 }}>· MEJOR</span>}</div>
                          <div className="ui-item-sub">{fmtFecha(p.fecha)}</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div className="ui-item-val">{formatMoney(p.total, "GTQ")}</div>
                          {p.adjudicada ? <div style={{ fontSize: 10.5, color: "var(--success-text)", fontWeight: 700 }}>ADJUDICADA</div>
                            : detail.estado !== "adjudicada" ? <button className="ui-btn-success" style={{ padding: "3px 10px", fontSize: 11, marginTop: 4 }} onClick={() => handleAdjudicar(detail.id, p.id)}>Adjudicar</button> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {detail.estado !== "adjudicada" && (
              <div className="ui-drawer-foot"><button className="ui-btn-primary" style={{ marginLeft: "auto" }} onClick={() => openPropuesta(detail)}><i className="fas fa-plus" /> Registrar propuesta</button></div>
            )}
          </aside>
        </>,
        document.body
      )}
    </div>
  );
}
