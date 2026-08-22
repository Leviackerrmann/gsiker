import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import api from "../../lib/api";
import Modal from "../../components/Modal";
import SearchableSelect from "../../components/SearchableSelect";
import { useToast } from "../../components/Toast";
import { useAuth } from "../../contexts/AuthContext";
import { MONEDAS, formatMoney } from "../../lib/money";

interface Proveedor { id: number; codigo: string; nombre: string; moneda: string; activo: boolean; }
interface SKUItem { id: number; codigo_sku: string; descripcion: string; costo_unitario: number; }
interface ItemOC { id: number; sku_id: number; sku_codigo: string; sku_descripcion: string; cantidad_solicitada: number; cantidad_recibida: number; costo_unitario: number; costo_total: number; }
interface Orden { id: number; numero_oc: string; proveedor_id: number; proveedor_nombre: string; fecha_emision: string; fecha_entrega: string | null; estado: string; moneda: string; tipo_cambio: number; nota: string | null; items: ItemOC[]; }
interface Bodega { id: number; nombre: string; }

const ESTADO_META: Record<string, { label: string; bg: string; fg: string }> = {
  pendiente: { label: "Pendiente", bg: "var(--warning-bg)", fg: "var(--warning-text)" },
  parcial: { label: "Parcial", bg: "var(--primary-light)", fg: "var(--primary)" },
  completa: { label: "Completa", bg: "var(--success-bg)", fg: "var(--success-text)" },
  cancelada: { label: "Cancelada", bg: "var(--danger-bg)", fg: "var(--danger-text)" },
};
const fmtFecha = (s: string | null) => s ? new Date(s).toLocaleDateString("es-GT", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const totalOC = (o: Orden) => o.items.reduce((a, i) => a + i.costo_total, 0);

export default function OrdenesCompraPage() {
  const toast = useToast();
  const { empresa } = useAuth();
  const [ordenes, setOrdenes] = useState<Orden[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [skus, setSkus] = useState<SKUItem[]>([]);
  const [bodegas, setBodegas] = useState<Bodega[]>([]);
  const [loading, setLoading] = useState(true);
  const [estadoFilter, setEstadoFilter] = useState("");
  const [proveedorFilter, setProveedorFilter] = useState("");
  const [search, setSearch] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [detail, setDetail] = useState<Orden | null>(null);
  const [receiving, setReceiving] = useState<Orden | null>(null);
  const [devolving, setDevolving] = useState<Orden | null>(null);
  const [error, setError] = useState("");

  const [provId, setProvId] = useState("");
  const [ocMoneda, setOcMoneda] = useState("GTQ");
  const [ocTipoCambio, setOcTipoCambio] = useState("");
  const [nota, setNota] = useState("");
  const [nuevaFechaEntrega, setNuevaFechaEntrega] = useState("");
  const [lineItems, setLineItems] = useState<{ sku_id: string; cantidad: string; costo: string }[]>([{ sku_id: "", cantidad: "", costo: "" }]);

  const [bodegaRecepcion, setBodegaRecepcion] = useState("");
  const [recItems, setRecItems] = useState<Record<number, string>>({});
  const [bodegaDevolucion, setBodegaDevolucion] = useState("");
  const [devItems, setDevItems] = useState<Record<number, string>>({});

  const load = async () => {
    const params = new URLSearchParams();
    if (estadoFilter) params.set("estado", estadoFilter);
    if (proveedorFilter) params.set("proveedor_id", proveedorFilter);
    const { data } = await api.get(`/compras/ordenes?${params}`);
    setOrdenes(data); setLoading(false);
  };

  useEffect(() => {
    Promise.all([api.get("/compras/proveedores"), api.get("/skus?limit=500"), api.get("/inventario/bodegas")])
      .then(([pRes, sRes, bRes]) => { setProveedores(pRes.data.filter((p: Proveedor) => p.activo)); setSkus(sRes.data); setBodegas(bRes.data); });
    load();
  }, []);
  useEffect(() => { setLoading(true); load(); }, [estadoFilter, proveedorFilter]);

  useEffect(() => {
    if (!detail) return;
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDetail(null); };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", onKey); };
  }, [detail]);

  const seleccionarProveedor = (v: string) => {
    setProvId(v);
    const p = proveedores.find((x) => String(x.id) === v);
    const m = p?.moneda || "GTQ"; setOcMoneda(m);
    if (m === "USD" && !ocTipoCambio) setOcTipoCambio(String(empresa?.tipo_cambio_usd ?? ""));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    try {
      await api.post("/compras/ordenes", {
        proveedor_id: Number(provId), fecha_entrega: nuevaFechaEntrega || null, nota: nota || undefined,
        moneda: ocMoneda, tipo_cambio: ocMoneda === "USD" ? (Number(ocTipoCambio) || undefined) : 1,
        items: lineItems.map((li) => ({ sku_id: Number(li.sku_id), cantidad_solicitada: Number(li.cantidad), costo_unitario: Number(li.costo) || 0 })),
      });
      toast.success("Orden creada");
      setShowCreate(false); setProvId(""); setNota(""); setNuevaFechaEntrega(""); setLineItems([{ sku_id: "", cantidad: "", costo: "" }]); load();
    } catch (err: any) { setError(err.response?.data?.detail || "Error al crear orden"); }
  };

  const cancelarOC = async (id: number) => {
    const motivo = prompt("Motivo de cancelación:"); if (!motivo) return;
    try { await api.post(`/compras/ordenes/${id}/cancelar`, { motivo }); toast.success("Orden cancelada"); setDetail(null); load(); }
    catch (err: any) { toast.error(err.response?.data?.detail || "Error"); }
  };

  const openRecepcion = (orden: Orden) => {
    setReceiving(orden); setBodegaRecepcion(bodegas[0]?.id?.toString() || "");
    const items: Record<number, string> = {};
    orden.items.forEach((i) => { const pendiente = i.cantidad_solicitada - i.cantidad_recibida; if (pendiente > 0) items[i.id] = pendiente.toString(); });
    setRecItems(items); setError("");
  };
  const handleRecibir = async () => {
    setError("");
    try {
      const items = Object.entries(recItems).filter(([, v]) => Number(v) > 0).map(([k, v]) => ({ item_orden_id: Number(k), cantidad_recibida: Number(v) }));
      if (items.length === 0) { setError("Debe recibir al menos un ítem"); return; }
      await api.post(`/compras/ordenes/${receiving!.id}/recibir`, { bodega_id: Number(bodegaRecepcion), items });
      toast.success("Recepción registrada y stock actualizado"); setReceiving(null); setDetail(null); load();
    } catch (err: any) { setError(err.response?.data?.detail || "Error en recepción"); }
  };
  const openDevolucion = (orden: Orden) => {
    setDevolving(orden); setBodegaDevolucion(bodegas[0]?.id?.toString() || "");
    const items: Record<number, string> = {};
    orden.items.forEach((i) => { if (i.cantidad_recibida > 0) items[i.id] = ""; });
    setDevItems(items); setError("");
  };
  const handleDevolver = async () => {
    setError("");
    try {
      const items = Object.entries(devItems).filter(([, v]) => Number(v) > 0).map(([k, v]) => ({ item_orden_id: Number(k), cantidad_devuelta: Number(v) }));
      if (items.length === 0) { setError("Debe devolver al menos un ítem"); return; }
      await api.post(`/compras/ordenes/${devolving!.id}/devolver`, { bodega_id: Number(bodegaDevolucion), items });
      toast.success("Devolución registrada"); setDevolving(null); setDetail(null); load();
    } catch (err: any) { setError(err.response?.data?.detail || "Error en devolución"); }
  };

  const provOpts = proveedores.map((p) => ({ value: String(p.id), label: `${p.codigo} - ${p.nombre}` }));
  const skuOpts = skus.map((s) => ({ value: String(s.id), label: `${s.codigo_sku} - ${s.descripcion}` }));

  const counts = useMemo(() => {
    const c: Record<string, number> = { pendiente: 0, parcial: 0, completa: 0, cancelada: 0 };
    for (const o of ordenes) c[o.estado] = (c[o.estado] || 0) + 1;
    return c;
  }, [ordenes]);
  const montoComprado = ordenes.filter((o) => o.estado !== "cancelada").reduce((a, o) => a + totalOC(o), 0);

  const filtered = ordenes.filter((o) => { if (search) { const h = `${o.numero_oc} ${o.proveedor_nombre}`.toLowerCase(); if (!h.includes(search.toLowerCase())) return false; } return true; });

  const chips = [
    { key: "", label: "Todas", count: ordenes.length },
    { key: "pendiente", label: "Pendientes", count: counts.pendiente },
    { key: "parcial", label: "Parciales", count: counts.parcial },
    { key: "completa", label: "Completas", count: counts.completa },
    { key: "cancelada", label: "Canceladas", count: counts.cancelada },
  ];

  return (
    <div style={{ animation: "fadeInUp .45s ease forwards" }}>
      <div className="ui-head">
        <div><h1 className="ui-title">Órdenes de compra</h1><p className="ui-subtitle">Compras a proveedores, recepción de mercadería y devoluciones</p></div>
        <button className="ui-btn-primary" onClick={() => setShowCreate(true)}><i className="fas fa-plus" /> Nueva orden</button>
      </div>

      <div className="ui-stats">
        <div className="ui-stat"><div className="ui-stat-top"><span className="ui-stat-lbl">Total OC</span><i className="fas fa-file-invoice" style={{ color: "var(--primary)" }} /></div><div className="ui-stat-val">{ordenes.length}</div></div>
        <div className="ui-stat"><div className="ui-stat-top"><span className="ui-stat-lbl">Por recibir</span><i className="fas fa-truck-ramp-box" style={{ color: "var(--warning-text)" }} /></div><div className="ui-stat-val" style={{ color: "var(--warning-text)" }}>{counts.pendiente + counts.parcial}</div></div>
        <div className="ui-stat"><div className="ui-stat-top"><span className="ui-stat-lbl">Completas</span><i className="fas fa-circle-check" style={{ color: "var(--success-text)" }} /></div><div className="ui-stat-val" style={{ color: "var(--success-text)" }}>{counts.completa}</div></div>
        <div className="ui-stat"><div className="ui-stat-top"><span className="ui-stat-lbl">Monto comprado</span><i className="fas fa-coins" style={{ color: "var(--primary)" }} /></div><div className="ui-stat-val sm">{formatMoney(montoComprado, empresa?.moneda || "GTQ")}</div></div>
      </div>

      <div className="ui-toolbar">
        <div className="ui-search-wrap"><i className="fas fa-search" /><input className="ui-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por OC o proveedor..." /></div>
        <select className="ui-select" value={proveedorFilter} onChange={(e) => setProveedorFilter(e.target.value)}><option value="">Todos los proveedores</option>{proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>
        <div className="ui-chips">{chips.map((ch) => <button key={ch.key || "todas"} className={`ui-chip ${estadoFilter === ch.key ? "active" : ""}`} onClick={() => setEstadoFilter(ch.key)}>{ch.label}<span className="ui-chip-count">{ch.count}</span></button>)}</div>
      </div>

      <div className="ui-table-wrap">
        <table className="ui-table">
          <thead><tr><th>Orden</th><th>Proveedor</th><th>Emisión</th><th>Estado</th><th style={{ textAlign: "center" }}>Ítems</th><th style={{ textAlign: "right" }}>Total</th><th style={{ width: 36 }}></th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={7} style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Cargando...</td></tr>
            : filtered.length === 0 ? <tr><td colSpan={7} className="ui-empty"><i className="fas fa-file-invoice" />No hay órdenes con estos filtros</td></tr>
            : filtered.map((o) => {
              const meta = ESTADO_META[o.estado] || ESTADO_META.cancelada;
              return (
                <tr key={o.id} className="ui-row" onClick={() => setDetail(o)}>
                  <td><span className="ui-code">{o.numero_oc}</span></td>
                  <td style={{ color: "var(--text-primary)", fontWeight: 600 }}>{o.proveedor_nombre}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{fmtFecha(o.fecha_emision)}</td>
                  <td><span className="ui-badge" style={{ background: meta.bg, color: meta.fg }}>{meta.label}</span></td>
                  <td style={{ textAlign: "center" }} className="ui-mono">{o.items.length}</td>
                  <td style={{ textAlign: "right", fontWeight: 700 }} className="ui-mono">{formatMoney(totalOC(o), o.moneda)}</td>
                  <td style={{ textAlign: "right" }}><i className="fas fa-chevron-right ui-chevron" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal crear */}
      <Modal isOpen={showCreate} title="Nueva orden de compra" onClose={() => setShowCreate(false)} maxWidth={680}>
        <form onSubmit={handleCreate}>
          {error && <div className="ui-error">{error}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div className="ui-field" style={{ margin: 0 }}><label>Proveedor *</label><SearchableSelect options={provOpts} value={provId} onChange={seleccionarProveedor} placeholder="Seleccionar..." required /></div>
            <div className="ui-field" style={{ margin: 0 }}><label>Fecha entrega</label><input type="date" value={nuevaFechaEntrega} onChange={(e) => setNuevaFechaEntrega(e.target.value)} className="ui-input" /></div>
            <div className="ui-field" style={{ margin: 0 }}><label>Moneda</label><select value={ocMoneda} onChange={(e) => setOcMoneda(e.target.value)} className="ui-input">{MONEDAS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></div>
            {ocMoneda === "USD" && <div className="ui-field" style={{ margin: 0 }}><label>Tipo de cambio (Q por $1)</label><input type="number" step="0.0001" min="0" value={ocTipoCambio} onChange={(e) => setOcTipoCambio(e.target.value)} className="ui-input" placeholder={String(empresa?.tipo_cambio_usd ?? "7.80")} /></div>}
            <div className="ui-field" style={{ margin: 0, gridColumn: "1 / -1" }}><label>Nota</label><input value={nota} onChange={(e) => setNota(e.target.value)} className="ui-input" /></div>
          </div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--text-muted)", margin: "6px 0" }}>Ítems</label>
          {lineItems.map((li, idx) => (
            <div key={idx} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 40px", gap: 8, marginBottom: 8 }}>
              <SearchableSelect options={skuOpts} value={li.sku_id} onChange={(v) => { const copy = [...lineItems]; copy[idx].sku_id = v; const sku = skus.find((s) => s.id === Number(v)); if (sku) copy[idx].costo = sku.costo_unitario.toString(); setLineItems(copy); }} placeholder="SKU" required />
              <input type="number" step="0.01" min="0.01" placeholder="Cant." value={li.cantidad} onChange={(e) => { const c = [...lineItems]; c[idx].cantidad = e.target.value; setLineItems(c); }} className="ui-input" required />
              <input type="number" step="0.01" min="0" placeholder="Costo" value={li.costo} onChange={(e) => { const c = [...lineItems]; c[idx].costo = e.target.value; setLineItems(c); }} className="ui-input" />
              <button type="button" onClick={() => { if (lineItems.length > 1) setLineItems(lineItems.filter((_, i) => i !== idx)); }} className="ui-btn-ghost" style={{ padding: "4px 8px" }}>×</button>
            </div>
          ))}
          <button type="button" onClick={() => setLineItems([...lineItems, { sku_id: "", cantidad: "", costo: "" }])} className="ui-btn-ghost" style={{ margin: "0 0 14px" }}>+ Agregar ítem</button>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" onClick={() => setShowCreate(false)} className="ui-btn-ghost">Cancelar</button>
            <button type="submit" className="ui-btn-primary">Crear orden</button>
          </div>
        </form>
      </Modal>

      {/* Modal recepción */}
      {receiving && (
        <Modal isOpen={!!receiving} title={`Recepción — ${receiving.numero_oc}`} onClose={() => setReceiving(null)} maxWidth={520}>
          {error && <div className="ui-error">{error}</div>}
          <div className="ui-field"><label>Recibir en bodega</label><select value={bodegaRecepcion} onChange={(e) => setBodegaRecepcion(e.target.value)} className="ui-input">{bodegas.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select></div>
          {receiving.items.map((i) => { const pend = i.cantidad_solicitada - i.cantidad_recibida; if (pend <= 0) return null; return (
            <div key={i.id} style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}><span style={{ flex: 1, fontSize: 13 }}>{i.sku_codigo} <span style={{ color: "var(--text-muted)" }}>({pend.toLocaleString()} pend.)</span></span><input type="number" step="0.01" min="0" max={pend} value={recItems[i.id] || ""} onChange={(e) => setRecItems({ ...recItems, [i.id]: e.target.value })} className="ui-input" style={{ width: 120 }} /></div>
          ); })}
          <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}><button onClick={() => setReceiving(null)} className="ui-btn-ghost">Cancelar</button><button onClick={handleRecibir} className="ui-btn-primary">Confirmar recepción</button></div>
        </Modal>
      )}

      {/* Modal devolución */}
      {devolving && (
        <Modal isOpen={!!devolving} title={`Devolución — ${devolving.numero_oc}`} onClose={() => setDevolving(null)} maxWidth={520}>
          {error && <div className="ui-error">{error}</div>}
          <div className="ui-field"><label>Bodega origen</label><select value={bodegaDevolucion} onChange={(e) => setBodegaDevolucion(e.target.value)} className="ui-input">{bodegas.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select></div>
          {devolving.items.map((i) => { if (i.cantidad_recibida <= 0) return null; return (
            <div key={i.id} style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}><span style={{ flex: 1, fontSize: 13 }}>{i.sku_codigo} <span style={{ color: "var(--text-muted)" }}>(Rec: {i.cantidad_recibida.toLocaleString()})</span></span><input type="number" step="0.01" min="0" max={i.cantidad_recibida} value={devItems[i.id] || ""} onChange={(e) => setDevItems({ ...devItems, [i.id]: e.target.value })} className="ui-input" style={{ width: 120 }} placeholder="Cant." /></div>
          ); })}
          <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}><button onClick={() => setDevolving(null)} className="ui-btn-ghost">Cancelar</button><button onClick={handleDevolver} className="ui-btn-danger">Confirmar devolución</button></div>
        </Modal>
      )}

      {/* Drawer detalle */}
      {detail && createPortal(
        <>
          <div className="ui-overlay" onClick={() => setDetail(null)} />
          <aside className="ui-drawer" role="dialog" aria-modal="true">
            <div className="ui-drawer-head">
              <div><div className="ui-drawer-title">OC {detail.numero_oc}</div><div className="ui-drawer-sub">{fmtFecha(detail.fecha_emision)}</div></div>
              <button className="ui-close" onClick={() => setDetail(null)}><i className="fas fa-xmark" /></button>
            </div>
            <div className="ui-drawer-body">
              <div className="ui-hero">
                <div className="ui-hero-icon"><i className="fas fa-file-invoice" /></div>
                <div style={{ minWidth: 0 }}>
                  <div className="ui-hero-name">{detail.proveedor_nombre}</div>
                  <div className="ui-hero-sub">{detail.moneda}{detail.moneda === "USD" ? ` · T.C. ${detail.tipo_cambio}` : ""}{detail.fecha_entrega ? ` · entrega ${fmtFecha(detail.fecha_entrega)}` : ""}</div>
                  <div className="ui-hero-badges"><span className="ui-badge" style={{ background: (ESTADO_META[detail.estado] || ESTADO_META.cancelada).bg, color: (ESTADO_META[detail.estado] || ESTADO_META.cancelada).fg }}>{(ESTADO_META[detail.estado] || ESTADO_META.cancelada).label}</span></div>
                </div>
              </div>
              <div className="ui-section">
                <div className="ui-section-title">Ítems ({detail.items.length})</div>
                <div className="ui-items">
                  {detail.items.map((it) => (
                    <div key={it.id} className="ui-item">
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="ui-item-title">{it.sku_descripcion}</div>
                        <div className="ui-item-sub">{it.sku_codigo} · {it.cantidad_recibida}/{it.cantidad_solicitada} recibido · {formatMoney(it.costo_unitario, detail.moneda)} c/u</div>
                      </div>
                      <div className="ui-item-val">{formatMoney(it.costo_total, detail.moneda)}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="ui-totals"><div className="ui-total-row ui-total-grand"><span>Total</span><span>{formatMoney(totalOC(detail), detail.moneda)}</span></div></div>
              {detail.nota && <div className="ui-section" style={{ marginTop: 20 }}><div className="ui-section-title">Nota</div><div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{detail.nota}</div></div>}
            </div>
            {detail.estado !== "cancelada" && detail.estado !== "completa" && (
              <div className="ui-drawer-foot">
                {(detail.estado === "pendiente" || detail.estado === "parcial") && <button className="ui-btn-primary" onClick={() => openRecepcion(detail)}><i className="fas fa-truck-ramp-box" /> Recibir</button>}
                {detail.estado === "parcial" && <button className="ui-btn-ghost" onClick={() => openDevolucion(detail)}>Devolver</button>}
                <button className="ui-btn-danger" style={{ marginLeft: "auto" }} onClick={() => cancelarOC(detail.id)}>Cancelar OC</button>
              </div>
            )}
            {detail.estado === "completa" && <div className="ui-drawer-foot"><button className="ui-btn-ghost" onClick={() => openDevolucion(detail)}>Devolver</button></div>}
          </aside>
        </>,
        document.body
      )}
    </div>
  );
}
