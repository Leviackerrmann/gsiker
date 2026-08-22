import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import api from "../../lib/api";
import Modal from "../../components/Modal";
import SearchableSelect from "../../components/SearchableSelect";
import { useToast } from "../../components/Toast";
import { formatMoney } from "../../lib/money";

interface ItemPV { id: number; sku_id: number; sku_codigo: string; sku_descripcion: string; cantidad_solicitada: number; cantidad_despachada: number; precio_unitario: number; precio_total: number; }
interface Pedido { id: number; numero: string; cliente_id: number; cliente_nombre: string; fecha_emision: string; fecha_entrega: string | null; estado: string; moneda: string; subtotal: number; impuesto_total: number; total: number; nota: string | null; items: ItemPV[]; }

const ESTADO_META: Record<string, { label: string; bg: string; fg: string }> = {
  pendiente: { label: "Pendiente", bg: "var(--warning-bg)", fg: "var(--warning-text)" },
  parcial: { label: "Parcial", bg: "var(--primary-light)", fg: "var(--primary)" },
  despachado: { label: "Despachado", bg: "var(--success-bg)", fg: "var(--success-text)" },
  facturado: { label: "Facturado", bg: "var(--border-light)", fg: "var(--text-muted)" },
  cancelado: { label: "Cancelado", bg: "var(--danger-bg)", fg: "var(--danger-text)" },
};
function fmtFecha(s: string | null) { return s ? new Date(s).toLocaleDateString("es-GT", { day: "2-digit", month: "short", year: "numeric" }) : "—"; }

export default function PedidosVentaPage() {
  const toast = useToast();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [skus, setSkus] = useState<any[]>([]);
  const [bodegas, setBodegas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [estadoFilter, setEstadoFilter] = useState("");
  const [search, setSearch] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [nota, setNota] = useState("");
  const [lineItems, setLineItems] = useState<{ sku_id: string; cantidad: string; precio: string }[]>([{ sku_id: "", cantidad: "", precio: "" }]);

  const [detail, setDetail] = useState<Pedido | null>(null);

  const [receiving, setReceiving] = useState<Pedido | null>(null);
  const [bodegaRec, setBodegaRec] = useState("");
  const [despItems, setDespItems] = useState<Record<number, string>>({});
  const [stockInfo, setStockInfo] = useState<Record<number, string>>({});
  const [devolving, setDevolving] = useState<Pedido | null>(null);
  const [bodegaDev, setBodegaDev] = useState("");
  const [devItems, setDevItems] = useState<Record<number, string>>({});

  const load = async () => { const params = estadoFilter ? `?estado=${estadoFilter}` : ""; const { data } = await api.get(`/ventas/pedidos${params}`); setPedidos(data); setLoading(false); };
  useEffect(() => { Promise.all([api.get("/ventas/clientes"), api.get("/skus?limit=500"), api.get("/inventario/bodegas")]).then(([cR, sR, bR]) => { setClientes(cR.data.filter((c: any) => c.activo)); setSkus(sR.data); setBodegas(bR.data); }); load(); }, []);
  useEffect(() => { setLoading(true); load(); }, [estadoFilter]);

  useEffect(() => {
    if (!detail) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDetail(null); };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", onKey); };
  }, [detail]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    try {
      await api.post("/ventas/pedidos", { cliente_id: Number(clienteId), nota: nota || undefined, items: lineItems.map(l => ({ sku_id: Number(l.sku_id), cantidad_solicitada: Number(l.cantidad), precio_unitario: Number(l.precio) || 0 })) });
      toast.success("Pedido creado");
      setShowCreate(false); setClienteId(""); setNota(""); setLineItems([{ sku_id: "", cantidad: "", precio: "" }]); load();
    } catch (err: any) { setError(err.response?.data?.detail || "Error"); }
  };

  const fetchStockInfo = async (p: Pedido | null, bodegaId: string) => {
    if (!p) return;
    const info: Record<number, string> = {};
    for (const i of p.items) {
      try {
        const { data } = await api.get(`/inventario/stock?sku_id=${i.sku_id}&bodega_id=${bodegaId}`);
        const disp = data.reduce((a: number, s: any) => a + s.cantidad_disponible, 0);
        const bodega = data[0]?.bodega_nombre || "esta bodega";
        info[i.id] = `${bodega}: ${disp.toLocaleString()} disponibles`;
      } catch { info[i.id] = ""; }
    }
    setStockInfo(info);
  };

  const openDespacho = async (p: Pedido) => {
    const defBodega = bodegas[0]?.id?.toString() || "";
    setReceiving(p); setBodegaRec(defBodega);
    const items: Record<number, string> = {};
    p.items.forEach(i => { const pend = i.cantidad_solicitada - i.cantidad_despachada; if (pend > 0) items[i.id] = pend.toString(); });
    setDespItems(items); setError("");
    await fetchStockInfo(p, defBodega);
  };
  const handleDespachar = async () => {
    setError("");
    try {
      const items = Object.entries(despItems).filter(([, v]) => Number(v) > 0).map(([k, v]) => ({ item_pedido_id: Number(k), cantidad_despachada: Number(v) }));
      if (items.length === 0) { setError("Debe despachar al menos un ítem"); return; }
      await api.post(`/ventas/pedidos/${receiving!.id}/despachar`, { bodega_id: Number(bodegaRec), items });
      toast.success("Despacho registrado y stock actualizado"); load(); setReceiving(null); setDetail(null);
    } catch (err: any) { setError(err.response?.data?.detail || "Error"); }
  };
  const openDevolucion = (p: Pedido) => { setDevolving(p); setBodegaDev(bodegas[0]?.id?.toString() || ""); const items: Record<number, string> = {}; p.items.forEach(i => { if (i.cantidad_despachada > 0) items[i.id] = ""; }); setDevItems(items); setError(""); };
  const handleDevolver = async () => {
    setError("");
    try {
      const items = Object.entries(devItems).filter(([, v]) => Number(v) > 0).map(([k, v]) => ({ item_pedido_id: Number(k), cantidad_devuelta: Number(v) }));
      if (items.length === 0) { setError("Debe devolver al menos un ítem"); return; }
      await api.post(`/ventas/pedidos/${devolving!.id}/devolver`, { bodega_id: Number(bodegaDev), items });
      toast.success("Devolución registrada"); setDevolving(null); setDetail(null); load();
    } catch (err: any) { setError(err.response?.data?.detail || "Error"); }
  };
  const handleFacturar = async (id: number) => { const { data } = await api.post(`/ventas/pedidos/${id}/facturar`); toast.success(`Factura ${data.numero} generada`); setDetail(null); load(); };
  const handleCancelar = async (id: number) => { const m = prompt("Motivo de cancelación:"); if (!m) return; await api.post(`/ventas/pedidos/${id}/cancelar`, { motivo: m }); toast.success("Pedido cancelado"); setDetail(null); load(); };

  const skuOpts = skus.map((s: any) => ({ value: String(s.id), label: `${s.codigo_sku} - ${s.descripcion}` }));
  const cliOpts = clientes.map((c: any) => ({ value: String(c.id), label: `${c.codigo} - ${c.nombre}` }));

  const counts = useMemo(() => {
    const c: Record<string, number> = { pendiente: 0, parcial: 0, despachado: 0, facturado: 0, cancelado: 0 };
    for (const p of pedidos) c[p.estado] = (c[p.estado] || 0) + 1;
    return c;
  }, [pedidos]);
  const porFacturar = pedidos.filter((p) => p.estado === "despachado").reduce((a, p) => a + p.total, 0);
  const monedaFmt = pedidos[0]?.moneda || "GTQ";

  const filtered = pedidos.filter((p) => {
    if (search) { const h = `${p.numero} ${p.cliente_nombre}`.toLowerCase(); if (!h.includes(search.toLowerCase())) return false; }
    return true;
  });

  const chips = [
    { key: "", label: "Todos", count: pedidos.length },
    { key: "pendiente", label: "Pendientes", count: counts.pendiente },
    { key: "parcial", label: "Parciales", count: counts.parcial },
    { key: "despachado", label: "Despachados", count: counts.despachado },
    { key: "facturado", label: "Facturados", count: counts.facturado },
  ];

  return (
    <div style={{ animation: "fadeInUp .45s ease forwards" }}>
      <style>{PV_CSS}</style>

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: "'Space Grotesk'", fontSize: 26, fontWeight: 700, letterSpacing: "-0.5px", color: "var(--text-primary)", margin: 0 }}>Pedidos de venta</h1>
          <p style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 4 }}>Órdenes de venta, despacho, devoluciones y facturación</p>
        </div>
        <button className="pv-btn-primary" onClick={() => setShowCreate(true)}><i className="fas fa-plus" /> Nuevo pedido</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 24 }}>
        <div className="pv-stat"><div className="pv-stat-top"><span className="pv-stat-lbl">Total pedidos</span><i className="fas fa-clipboard-list" style={{ color: "var(--primary)" }} /></div><div className="pv-stat-val">{pedidos.length}</div></div>
        <div className="pv-stat"><div className="pv-stat-top"><span className="pv-stat-lbl">Por despachar</span><i className="fas fa-truck-fast" style={{ color: "var(--warning-text)" }} /></div><div className="pv-stat-val" style={{ color: "var(--warning-text)" }}>{counts.pendiente + counts.parcial}</div></div>
        <div className="pv-stat"><div className="pv-stat-top"><span className="pv-stat-lbl">Por facturar</span><i className="fas fa-file-invoice-dollar" style={{ color: "var(--success-text)" }} /></div><div className="pv-stat-val" style={{ color: "var(--success-text)" }}>{counts.despachado}</div></div>
        <div className="pv-stat"><div className="pv-stat-top"><span className="pv-stat-lbl">Monto por facturar</span><i className="fas fa-coins" style={{ color: "var(--primary)" }} /></div><div className="pv-stat-val" style={{ fontSize: 19 }}>{formatMoney(porFacturar, monedaFmt)}</div></div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 220, maxWidth: 320 }}>
          <i className="fas fa-search" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", fontSize: 13 }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por número o cliente..." className="pv-search" />
        </div>
        <div className="pv-chips">
          {chips.map((ch) => <button key={ch.key || "todos"} className={`pv-chip ${estadoFilter === ch.key ? "active" : ""}`} onClick={() => setEstadoFilter(ch.key)}>{ch.label}<span className="pv-chip-count">{ch.count}</span></button>)}
        </div>
      </div>

      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--card-radius)", overflow: "hidden", boxShadow: "var(--card-shadow)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Pedido</th><th style={th}>Cliente</th><th style={th}>Emisión</th><th style={th}>Estado</th>
              <th style={{ ...th, textAlign: "center" }}>Ítems</th><th style={{ ...th, textAlign: "right" }}>Total</th><th style={{ ...th, width: 36 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ ...td, textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Cargando...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ ...td, textAlign: "center", padding: 50, color: "var(--text-muted)" }}><i className="fas fa-clipboard-list" style={{ fontSize: 28, display: "block", marginBottom: 12, opacity: .3 }} />No hay pedidos con estos filtros</td></tr>
            ) : filtered.map((p) => {
              const meta = ESTADO_META[p.estado] || ESTADO_META.cancelado;
              return (
                <tr key={p.id} className="pv-row" onClick={() => setDetail(p)} style={{ borderBottom: "1px solid var(--row-border)" }}>
                  <td style={td}><span style={{ fontFamily: "'Space Grotesk'", fontWeight: 700, color: "var(--primary)" }}>{p.numero}</span></td>
                  <td style={{ ...td, fontWeight: 600, color: "var(--text-primary)" }}>{p.cliente_nombre}</td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>{fmtFecha(p.fecha_emision)}</td>
                  <td style={td}><span className="pv-badge" style={{ background: meta.bg, color: meta.fg }}>{meta.label}</span></td>
                  <td style={{ ...td, textAlign: "center", fontFamily: "'Space Grotesk'" }}>{p.items.length}</td>
                  <td style={{ ...td, textAlign: "right", fontFamily: "'Space Grotesk'", fontWeight: 700 }}>{formatMoney(p.total, p.moneda)}</td>
                  <td style={{ ...td, textAlign: "right" }}><i className="fas fa-chevron-right pv-chevron" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal crear */}
      <Modal isOpen={showCreate} title="Nuevo pedido de venta" onClose={() => setShowCreate(false)} maxWidth={640}>
        <form onSubmit={handleCreate}>
          {error && <div style={{ background: "var(--danger-bg)", color: "var(--danger-text)", padding: "9px 12px", borderRadius: 8, marginBottom: 14, fontSize: 13 }}>{error}</div>}
          <div style={{ marginBottom: 12 }}><label style={lbl}>Cliente</label><SearchableSelect options={cliOpts} value={clienteId} onChange={setClienteId} placeholder="Seleccionar" required /></div>
          <div style={{ marginBottom: 12 }}><label style={lbl}>Nota</label><input value={nota} onChange={(e) => setNota(e.target.value)} style={inp} /></div>
          <label style={lbl}>Ítems</label>
          {lineItems.map((li, idx) => (
            <div key={idx} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 40px", gap: 8, marginBottom: 8 }}>
              <SearchableSelect options={skuOpts} value={li.sku_id} onChange={(v) => { const c = [...lineItems]; c[idx].sku_id = v; setLineItems(c); }} placeholder="SKU" required />
              <input type="number" step="0.01" min="0.01" placeholder="Cant" value={li.cantidad} onChange={(e) => { const c2 = [...lineItems]; c2[idx].cantidad = e.target.value; setLineItems(c2); }} style={inp} required />
              <input type="number" step="0.01" min="0" placeholder="Precio" value={li.precio} onChange={(e) => { const c3 = [...lineItems]; c3[idx].precio = e.target.value; setLineItems(c3); }} style={inp} />
              <button type="button" onClick={() => { if (lineItems.length > 1) setLineItems(lineItems.filter((_, i) => i !== idx)); }} className="pv-btn-ghost" style={{ padding: "4px 8px" }}>×</button>
            </div>
          ))}
          <button type="button" onClick={() => setLineItems([...lineItems, { sku_id: "", cantidad: "", precio: "" }])} className="pv-btn-ghost" style={{ marginBottom: 14 }}>+ Agregar ítem</button>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" onClick={() => setShowCreate(false)} className="pv-btn-ghost">Cancelar</button>
            <button type="submit" className="pv-btn-primary">Crear pedido</button>
          </div>
        </form>
      </Modal>

      {/* Modal despacho */}
      {receiving && (
        <Modal isOpen={!!receiving} title={`Despacho — ${receiving.numero}`} onClose={() => setReceiving(null)} maxWidth={520}>
          {error && <div style={{ background: "var(--danger-bg)", color: "var(--danger-text)", padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{error}</div>}
          <div style={{ marginBottom: 12 }}><label style={lbl}>Bodega</label><select value={bodegaRec} onChange={(e) => { setBodegaRec(e.target.value); fetchStockInfo(receiving, e.target.value); }} style={inp}>{bodegas.map((b: any) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select></div>
          {receiving.items.map((i) => { const pend = i.cantidad_solicitada - i.cantidad_despachada; if (pend <= 0) return null; return (
            <div key={i.id} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}><span style={{ flex: 1, fontSize: 13 }}>{i.sku_codigo} <span style={{ color: "var(--text-muted)" }}>({pend.toLocaleString()} pend.)</span></span><input type="number" step="0.01" min="0" max={pend} value={despItems[i.id] || ""} onChange={(e) => setDespItems({ ...despItems, [i.id]: e.target.value })} style={{ ...inp, width: 120 }} /></div>
              {stockInfo[i.id] && <span style={{ fontSize: 11, color: "var(--success-text)" }}>{stockInfo[i.id]}</span>}
            </div>
          ); })}
          <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}><button onClick={() => setReceiving(null)} className="pv-btn-ghost">Cancelar</button><button onClick={handleDespachar} className="pv-btn-primary">Confirmar despacho</button></div>
        </Modal>
      )}

      {/* Modal devolución */}
      {devolving && (
        <Modal isOpen={!!devolving} title={`Devolución — ${devolving.numero}`} onClose={() => setDevolving(null)} maxWidth={520}>
          {error && <div style={{ background: "var(--danger-bg)", color: "var(--danger-text)", padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{error}</div>}
          {devolving.items.filter(i => i.cantidad_despachada > 0).length === 0 ? (
            <div style={{ textAlign: "center", padding: 20 }}><p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 8 }}>No hay ítems despachados en este pedido.</p><p style={{ color: "var(--text-muted)", fontSize: 13 }}>Primero despacha los ítems para poder devolverlos.</p></div>
          ) : (
            <>
              <div style={{ marginBottom: 12 }}><label style={lbl}>Bodega destino</label><select value={bodegaDev} onChange={(e) => setBodegaDev(e.target.value)} style={inp}>{bodegas.map((b: any) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select></div>
              {devolving.items.map((i) => { if (i.cantidad_despachada <= 0) return null; return (
                <div key={i.id} style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}><span style={{ flex: 1, fontSize: 13 }}>{i.sku_codigo} <span style={{ color: "var(--text-muted)" }}>(Desp: {i.cantidad_despachada.toLocaleString()})</span></span><input type="number" step="0.01" min="0" max={i.cantidad_despachada} value={devItems[i.id] || ""} onChange={(e) => setDevItems({ ...devItems, [i.id]: e.target.value })} style={{ ...inp, width: 120 }} placeholder="Cant." /></div>
              ); })}
              <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}><button onClick={() => setDevolving(null)} className="pv-btn-ghost">Cancelar</button><button onClick={handleDevolver} className="pv-btn-danger">Confirmar devolución</button></div>
            </>
          )}
        </Modal>
      )}

      {/* Drawer detalle */}
      {detail && createPortal(
        <>
          <div className="pv-overlay" onClick={() => setDetail(null)} />
          <aside className="pv-drawer" role="dialog" aria-modal="true">
            <div className="pv-drawer-head">
              <div><div className="pv-drawer-title">Pedido {detail.numero}</div><div className="pv-drawer-sub">{fmtFecha(detail.fecha_emision)}</div></div>
              <button className="pv-close" onClick={() => setDetail(null)} aria-label="Cerrar"><i className="fas fa-xmark" /></button>
            </div>
            <div className="pv-drawer-body">
              <div className="pv-hero">
                <div className="pv-hero-icon"><i className="fas fa-clipboard-list" /></div>
                <div style={{ minWidth: 0 }}>
                  <div className="pv-hero-name">{detail.cliente_nombre}</div>
                  <div className="pv-hero-sub">{detail.nota || "Sin nota"}</div>
                  <div className="pv-hero-badges"><span className="pv-badge" style={{ background: (ESTADO_META[detail.estado] || ESTADO_META.cancelado).bg, color: (ESTADO_META[detail.estado] || ESTADO_META.cancelado).fg }}>{(ESTADO_META[detail.estado] || ESTADO_META.cancelado).label}</span></div>
                </div>
              </div>

              <div className="pv-section">
                <div className="pv-section-title">Ítems ({detail.items.length})</div>
                <div className="pv-items">
                  {detail.items.map((it) => (
                    <div key={it.id} className="pv-item">
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{it.sku_descripcion}</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'Space Grotesk'" }}>{it.sku_codigo} · {it.cantidad_despachada}/{it.cantidad_solicitada} despachado · {formatMoney(it.precio_unitario, detail.moneda)} c/u</div>
                      </div>
                      <div style={{ fontFamily: "'Space Grotesk'", fontWeight: 700, color: "var(--text)" }}>{formatMoney(it.precio_total, detail.moneda)}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pv-totals">
                <div className="pv-total-row"><span>Subtotal</span><span>{formatMoney(detail.subtotal, detail.moneda)}</span></div>
                <div className="pv-total-row"><span>IVA</span><span>{formatMoney(detail.impuesto_total, detail.moneda)}</span></div>
                <div className="pv-total-row pv-total-grand"><span>Total</span><span>{formatMoney(detail.total, detail.moneda)}</span></div>
              </div>
            </div>
            <div className="pv-drawer-foot">
              {(detail.estado === "pendiente" || detail.estado === "parcial") && <button className="pv-btn-primary" onClick={() => openDespacho(detail)}><i className="fas fa-truck-fast" /> Despachar</button>}
              {(detail.estado === "parcial" || detail.estado === "despachado") && <button className="pv-btn-ghost" onClick={() => openDevolucion(detail)}>Devolver</button>}
              {detail.estado === "despachado" && <button className="pv-btn-success" onClick={() => handleFacturar(detail.id)}><i className="fas fa-file-invoice" /> Facturar</button>}
              {detail.estado !== "cancelado" && detail.estado !== "facturado" && <button className="pv-btn-danger" style={{ marginLeft: "auto" }} onClick={() => handleCancelar(detail.id)}>Cancelar</button>}
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

const PV_CSS = `
.pv-btn-primary{display:inline-flex;align-items:center;gap:8px;background:var(--primary);color:#fff;border:none;border-radius:10px;padding:9px 16px;font:inherit;font-weight:600;font-size:13px;cursor:pointer;transition:all .2s}
.pv-btn-primary:hover{background:var(--primary-hover)}
.pv-btn-success{display:inline-flex;align-items:center;gap:8px;background:var(--success-text);color:#fff;border:none;border-radius:10px;padding:9px 16px;font:inherit;font-weight:600;font-size:13px;cursor:pointer;transition:all .2s}
.pv-btn-success:hover{filter:brightness(1.05)}
.pv-btn-ghost{display:inline-flex;align-items:center;gap:8px;background:transparent;border:1.5px solid var(--border);border-radius:10px;padding:9px 16px;font:inherit;font-weight:600;font-size:13px;color:var(--text);cursor:pointer;transition:all .2s}
.pv-btn-ghost:hover{background:var(--border-light)}
.pv-btn-danger{display:inline-flex;align-items:center;gap:8px;background:var(--danger-bg);color:var(--danger-text);border:none;border-radius:10px;padding:9px 16px;font:inherit;font-weight:600;font-size:13px;cursor:pointer;transition:all .2s}
.pv-btn-danger:hover{filter:brightness(.96)}

.pv-stat{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--card-radius);padding:18px;box-shadow:var(--card-shadow)}
.pv-stat-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.pv-stat-top i{font-size:16px}
.pv-stat-lbl{font-size:11px;text-transform:uppercase;letter-spacing:.8px;color:var(--text-muted);font-weight:600}
.pv-stat-val{font-family:'Space Grotesk',sans-serif;font-size:24px;font-weight:700;color:var(--text-primary);letter-spacing:-.5px}

.pv-search{width:100%;padding:10px 14px 10px 40px;border-radius:8px;border:1px solid var(--input-border);background:var(--input-bg);color:var(--text-primary);font-size:13px;font-family:inherit;outline:none;box-sizing:border-box}
.pv-search:focus{border-color:var(--primary)}
.pv-chips{display:flex;gap:8px;flex-wrap:wrap}
.pv-chip{display:inline-flex;align-items:center;gap:7px;padding:7px 13px;border-radius:20px;border:1.5px solid var(--border);background:transparent;color:var(--text-secondary);font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;transition:all .18s}
.pv-chip:hover{border-color:var(--primary);color:var(--primary)}
.pv-chip.active{border-color:var(--primary);background:var(--primary);color:#fff}
.pv-chip-count{font-size:11px;background:var(--border-light);color:var(--text-muted);border-radius:10px;padding:1px 7px;font-weight:700}
.pv-chip.active .pv-chip-count{background:rgba(255,255,255,.25);color:#fff}

.pv-row{cursor:pointer;transition:background .15s}
.pv-row:hover{background:var(--bg-table-row-hover)}
.pv-chevron{color:var(--text-muted);font-size:12px;opacity:.4;transition:all .18s}
.pv-row:hover .pv-chevron{opacity:1;color:var(--primary);transform:translateX(2px)}
.pv-badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;white-space:nowrap}

.pv-overlay{position:fixed;inset:0;background:rgba(15,23,42,0.45);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);z-index:900;animation:fadeIn .25s ease}
.pv-drawer{position:fixed;top:0;right:0;bottom:0;width:500px;max-width:100vw;background:var(--surface);z-index:901;display:flex;flex-direction:column;box-shadow:-10px 0 40px rgba(0,0,0,0.2);animation:pvSlide .35s cubic-bezier(0.32,0.72,0,1)}
@keyframes pvSlide{from{transform:translateX(100%)}to{transform:translateX(0)}}
.pv-drawer-head{padding:22px 26px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-shrink:0}
.pv-drawer-title{font-size:18px;font-weight:800;letter-spacing:-0.3px;color:var(--text)}
.pv-drawer-sub{font-size:12px;color:var(--text-muted);margin-top:2px;font-family:'Space Grotesk',sans-serif}
.pv-close{width:36px;height:36px;border-radius:10px;background:var(--bg);border:1px solid var(--border);cursor:pointer;color:var(--text-muted);display:flex;align-items:center;justify-content:center;transition:all .2s}
.pv-close:hover{background:var(--danger-bg);color:var(--danger);border-color:transparent}
.pv-drawer-body{flex:1;overflow-y:auto;padding:22px 26px}
.pv-drawer-foot{padding:14px 26px;border-top:1px solid var(--border);display:flex;align-items:center;gap:10px;flex-wrap:wrap;flex-shrink:0}

.pv-hero{display:flex;align-items:center;gap:16px;padding:18px;background:var(--primary-light);border:1px solid var(--border);border-radius:14px;margin-bottom:20px}
.pv-hero-icon{width:52px;height:52px;border-radius:14px;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;box-shadow:0 8px 20px rgba(0,0,0,0.12)}
.pv-hero-name{font-weight:700;font-size:16px;color:var(--text);line-height:1.25}
.pv-hero-sub{font-size:12.5px;color:var(--text-muted);margin-top:2px}
.pv-hero-badges{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}

.pv-section{margin-bottom:20px}
.pv-section-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:14px;display:flex;align-items:center;gap:8px}
.pv-section-title::before{content:'';width:3px;height:14px;background:var(--primary);border-radius:2px}
.pv-items{display:flex;flex-direction:column;gap:8px}
.pv-item{display:flex;align-items:center;gap:12px;padding:11px 14px;background:var(--bg);border:1px solid var(--border);border-radius:10px}
.pv-totals{background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:14px 16px}
.pv-total-row{display:flex;justify-content:space-between;font-size:13px;color:var(--text-secondary);padding:4px 0;font-family:'Space Grotesk',sans-serif}
.pv-total-grand{border-top:1px solid var(--border);margin-top:6px;padding-top:10px;font-size:17px;font-weight:800;color:var(--text)}
.pv-total-grand span:last-child{color:var(--primary)}

@media(max-width:640px){.pv-drawer{width:100vw}}
`;
