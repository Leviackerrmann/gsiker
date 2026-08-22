import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import api from "../../lib/api";
import Modal from "../../components/Modal";
import SearchableSelect from "../../components/SearchableSelect";
import { useToast } from "../../components/Toast";

interface ItemSol { id: number; sku_id: number; sku_codigo: string; sku_descripcion: string; cantidad: number; justificacion: string | null; }
interface Solicitud { id: number; numero: string; fecha: string; usuario_nombre: string | null; estado: string; notas: string | null; items: ItemSol[]; }
interface SKUItem { id: number; codigo_sku: string; descripcion: string; }

const ESTADO_META: Record<string, { label: string; bg: string; fg: string }> = {
  pendiente: { label: "Pendiente", bg: "var(--warning-bg)", fg: "var(--warning-text)" },
  aprobada: { label: "Aprobada", bg: "var(--success-bg)", fg: "var(--success-text)" },
  convertida: { label: "Convertida", bg: "var(--primary-light)", fg: "var(--primary)" },
  rechazada: { label: "Rechazada", bg: "var(--danger-bg)", fg: "var(--danger-text)" },
};
const fmtFecha = (s: string) => new Date(s).toLocaleDateString("es-GT", { day: "2-digit", month: "short", year: "numeric" });

export default function SolicitudesPage() {
  const toast = useToast();
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [skus, setSkus] = useState<SKUItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [lineItems, setLineItems] = useState<{ sku_id: string; cantidad: string; justificacion: string; stock: string }[]>([{ sku_id: "", cantidad: "", justificacion: "", stock: "" }]);
  const [detail, setDetail] = useState<Solicitud | null>(null);

  const load = async () => { const { data } = await api.get("/compras/solicitudes"); setSolicitudes(data); setLoading(false); };
  useEffect(() => { api.get("/skus?limit=500").then((r) => setSkus(r.data)); load(); }, []);

  useEffect(() => {
    if (!detail) return;
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDetail(null); };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", onKey); };
  }, [detail]);

  const onSkuChange = async (idx: number, skuId: string) => {
    const c = [...lineItems]; c[idx].sku_id = skuId;
    if (skuId) { try { const { data } = await api.get(`/inventario/stock?sku_id=${skuId}`); const total = data.reduce((a: number, s: any) => a + s.cantidad_disponible, 0); c[idx].stock = `${total.toLocaleString()} disponibles`; } catch { c[idx].stock = ""; } }
    else c[idx].stock = "";
    setLineItems(c);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    try {
      const res = await api.post("/compras/solicitudes", { items: lineItems.map((li) => ({ sku_id: Number(li.sku_id), cantidad: Number(li.cantidad), justificacion: li.justificacion || undefined })) });
      toast.success(`Solicitud ${res.data.numero} creada`);
      setShowForm(false); setLineItems([{ sku_id: "", cantidad: "", justificacion: "", stock: "" }]); load();
    } catch (err: any) { setError(err.response?.data?.detail || "Error"); }
  };

  const doAction = async (id: number, action: string) => {
    try {
      const res = await api.post(`/compras/solicitudes/${id}/${action}`);
      toast.success(action === "convertir" ? `Convertida en ${res.data.numero_oc}` : "Solicitud actualizada");
      setDetail(null); load();
    } catch (err: any) { toast.error(err.response?.data?.detail || "Error"); }
  };

  const skuOpts = skus.map((s) => ({ value: String(s.id), label: `${s.codigo_sku} - ${s.descripcion}` }));

  const counts = useMemo(() => {
    const c: Record<string, number> = { pendiente: 0, aprobada: 0, convertida: 0, rechazada: 0 };
    for (const s of solicitudes) c[s.estado] = (c[s.estado] || 0) + 1;
    return c;
  }, [solicitudes]);

  const filtered = solicitudes.filter((s) => {
    if (filtro && s.estado !== filtro) return false;
    if (search) { const h = `${s.numero} ${s.usuario_nombre || ""}`.toLowerCase(); if (!h.includes(search.toLowerCase())) return false; }
    return true;
  });

  const chips = [
    { key: "", label: "Todas", count: solicitudes.length },
    { key: "pendiente", label: "Pendientes", count: counts.pendiente },
    { key: "aprobada", label: "Aprobadas", count: counts.aprobada },
    { key: "convertida", label: "Convertidas", count: counts.convertida },
    { key: "rechazada", label: "Rechazadas", count: counts.rechazada },
  ];

  return (
    <div style={{ animation: "fadeInUp .45s ease forwards" }}>
      <div className="ui-head">
        <div><h1 className="ui-title">Solicitudes de compra</h1><p className="ui-subtitle">Requisiciones internas, aprobación y conversión a OC</p></div>
        <button className="ui-btn-primary" onClick={() => setShowForm(true)}><i className="fas fa-plus" /> Nueva solicitud</button>
      </div>

      <div className="ui-stats">
        <div className="ui-stat"><div className="ui-stat-top"><span className="ui-stat-lbl">Total</span><i className="fas fa-clipboard-check" style={{ color: "var(--primary)" }} /></div><div className="ui-stat-val">{solicitudes.length}</div></div>
        <div className="ui-stat"><div className="ui-stat-top"><span className="ui-stat-lbl">Pendientes</span><i className="fas fa-hourglass-half" style={{ color: "var(--warning-text)" }} /></div><div className="ui-stat-val" style={{ color: "var(--warning-text)" }}>{counts.pendiente}</div></div>
        <div className="ui-stat"><div className="ui-stat-top"><span className="ui-stat-lbl">Aprobadas</span><i className="fas fa-check" style={{ color: "var(--success-text)" }} /></div><div className="ui-stat-val" style={{ color: "var(--success-text)" }}>{counts.aprobada}</div></div>
        <div className="ui-stat"><div className="ui-stat-top"><span className="ui-stat-lbl">Convertidas</span><i className="fas fa-file-import" style={{ color: "var(--primary)" }} /></div><div className="ui-stat-val">{counts.convertida}</div></div>
      </div>

      <div className="ui-toolbar">
        <div className="ui-search-wrap"><i className="fas fa-search" /><input className="ui-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por número o solicitante..." /></div>
        <div className="ui-chips">{chips.map((ch) => <button key={ch.key || "todas"} className={`ui-chip ${filtro === ch.key ? "active" : ""}`} onClick={() => setFiltro(ch.key)}>{ch.label}<span className="ui-chip-count">{ch.count}</span></button>)}</div>
      </div>

      <div className="ui-table-wrap">
        <table className="ui-table">
          <thead><tr><th>Solicitud</th><th>Fecha</th><th>Solicitante</th><th style={{ textAlign: "center" }}>Ítems</th><th>Estado</th><th style={{ width: 36 }}></th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={6} style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Cargando...</td></tr>
            : filtered.length === 0 ? <tr><td colSpan={6} className="ui-empty"><i className="fas fa-clipboard-check" />No hay solicitudes con estos filtros</td></tr>
            : filtered.map((s) => {
              const meta = ESTADO_META[s.estado] || ESTADO_META.rechazada;
              return (
                <tr key={s.id} className="ui-row" onClick={() => setDetail(s)}>
                  <td><span className="ui-code">{s.numero}</span></td>
                  <td style={{ whiteSpace: "nowrap" }}>{fmtFecha(s.fecha)}</td>
                  <td style={{ color: "var(--text-primary)", fontWeight: 600 }}>{s.usuario_nombre || "—"}</td>
                  <td style={{ textAlign: "center" }} className="ui-mono">{s.items.length}</td>
                  <td><span className="ui-badge" style={{ background: meta.bg, color: meta.fg }}>{meta.label}</span></td>
                  <td style={{ textAlign: "right" }}><i className="fas fa-chevron-right ui-chevron" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal isOpen={showForm} title="Nueva solicitud de compra" onClose={() => setShowForm(false)} maxWidth={640}>
        <form onSubmit={handleCreate}>
          {error && <div className="ui-error">{error}</div>}
          <label className="ui-field" style={{ marginBottom: 6 }}><span style={{ display: "block", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--text-muted)", marginBottom: 6 }}>Ítems</span></label>
          {lineItems.map((li, idx) => (
            <div key={idx} style={{ marginBottom: 8 }}>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 2fr 40px", gap: 8 }}>
                <SearchableSelect options={skuOpts} value={li.sku_id} onChange={(v) => onSkuChange(idx, v)} placeholder="SKU" required />
                <input type="number" step="0.01" min="0.01" placeholder="Cant." value={li.cantidad} onChange={(e) => { const c = [...lineItems]; c[idx].cantidad = e.target.value; setLineItems(c); }} className="ui-input" required />
                <input placeholder="Justificación" value={li.justificacion} onChange={(e) => { const c = [...lineItems]; c[idx].justificacion = e.target.value; setLineItems(c); }} className="ui-input" />
                <button type="button" onClick={() => { if (lineItems.length > 1) setLineItems(lineItems.filter((_, i) => i !== idx)); }} className="ui-btn-ghost" style={{ padding: "4px 8px" }}>×</button>
              </div>
              {li.stock && <span style={{ fontSize: 11, color: "var(--success-text)", paddingLeft: 4 }}>{li.stock}</span>}
            </div>
          ))}
          <button type="button" onClick={() => setLineItems([...lineItems, { sku_id: "", cantidad: "", justificacion: "", stock: "" }])} className="ui-btn-ghost" style={{ margin: "6px 0 14px" }}>+ Agregar ítem</button>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" onClick={() => setShowForm(false)} className="ui-btn-ghost">Cancelar</button>
            <button type="submit" className="ui-btn-primary">Crear solicitud</button>
          </div>
        </form>
      </Modal>

      {detail && createPortal(
        <>
          <div className="ui-overlay" onClick={() => setDetail(null)} />
          <aside className="ui-drawer" role="dialog" aria-modal="true">
            <div className="ui-drawer-head">
              <div><div className="ui-drawer-title">Solicitud {detail.numero}</div><div className="ui-drawer-sub">{fmtFecha(detail.fecha)}</div></div>
              <button className="ui-close" onClick={() => setDetail(null)}><i className="fas fa-xmark" /></button>
            </div>
            <div className="ui-drawer-body">
              <div className="ui-hero">
                <div className="ui-hero-icon"><i className="fas fa-clipboard-check" /></div>
                <div style={{ minWidth: 0 }}>
                  <div className="ui-hero-name">{detail.usuario_nombre || "Sin solicitante"}</div>
                  <div className="ui-hero-sub">{detail.items.length} ítems solicitados</div>
                  <div className="ui-hero-badges"><span className="ui-badge" style={{ background: (ESTADO_META[detail.estado] || ESTADO_META.rechazada).bg, color: (ESTADO_META[detail.estado] || ESTADO_META.rechazada).fg }}>{(ESTADO_META[detail.estado] || ESTADO_META.rechazada).label}</span></div>
                </div>
              </div>
              <div className="ui-section">
                <div className="ui-section-title">Ítems</div>
                <div className="ui-items">
                  {detail.items.map((it) => (
                    <div key={it.id} className="ui-item">
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="ui-item-title">{it.sku_descripcion}</div>
                        <div className="ui-item-sub">{it.sku_codigo}{it.justificacion ? ` · ${it.justificacion}` : ""}</div>
                      </div>
                      <div className="ui-item-val">{it.cantidad.toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              </div>
              {detail.notas && <div className="ui-section"><div className="ui-section-title">Notas</div><div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{detail.notas}</div></div>}
            </div>
            {(detail.estado === "pendiente" || detail.estado === "aprobada") && (
              <div className="ui-drawer-foot">
                {detail.estado === "pendiente" && <>
                  <button className="ui-btn-danger" onClick={() => doAction(detail.id, "rechazar")}>Rechazar</button>
                  <button className="ui-btn-primary" style={{ marginLeft: "auto" }} onClick={() => doAction(detail.id, "aprobar")}><i className="fas fa-check" /> Aprobar</button>
                </>}
                {detail.estado === "aprobada" && <button className="ui-btn-success" style={{ marginLeft: "auto" }} onClick={() => doAction(detail.id, "convertir")}><i className="fas fa-file-import" /> Convertir en OC</button>}
              </div>
            )}
          </aside>
        </>,
        document.body
      )}
    </div>
  );
}
