import { useEffect, useState } from "react";
import api from "../../lib/api";
import Modal from "../../components/Modal";
import SearchableSelect from "../../components/SearchableSelect";
interface ItemPV { id: number; sku_id: number; sku_codigo: string; sku_descripcion: string; cantidad_solicitada: number; cantidad_despachada: number; precio_unitario: number; precio_total: number; }
interface Pedido { id: number; numero: string; cliente_id: number; cliente_nombre: string; fecha_emision: string; fecha_entrega: string | null; estado: string; subtotal: number; impuesto_total: number; total: number; nota: string | null; items: ItemPV[]; }
const estColors: Record<string, string> = { pendiente: "#f59e0b", parcial: "#3b82f6", despachado: "#16a34a", facturado: "#6366f1", cancelado: "#dc2626" };
export default function PedidosVentaPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [clientes, setClientes] = useState<any[]>([]); const [skus, setSkus] = useState<any[]>([]); const [bodegas, setBodegas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true); const [estadoFilter, setEstadoFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false); const [error, setError] = useState("");
  const [clienteId, setClienteId] = useState(""); const [nota, setNota] = useState("");
  const [lineItems, setLineItems] = useState<{ sku_id: string; cantidad: string; precio: string }[]>([{ sku_id: "", cantidad: "", precio: "" }]);
  const [receiving, setReceiving] = useState<Pedido | null>(null); const [bodegaRec, setBodegaRec] = useState("");
  const [despItems, setDespItems] = useState<Record<number, string>>({});
  const [stockInfo, setStockInfo] = useState<Record<number, string>>({});
  const [devolving, setDevolving] = useState<Pedido | null>(null); const [bodegaDev, setBodegaDev] = useState("");
  const [devItems, setDevItems] = useState<Record<number, string>>({});
  const [msg, setMsg] = useState("");
  const load = async () => { const params = estadoFilter ? `?estado=${estadoFilter}` : ""; const { data } = await api.get(`/ventas/pedidos${params}`); setPedidos(data); setLoading(false); };
  useEffect(() => { Promise.all([api.get("/ventas/clientes"), api.get("/skus?limit=500"), api.get("/inventario/bodegas")]).then(([cR, sR, bR]) => { setClientes(cR.data.filter((c: any) => c.activo)); setSkus(sR.data); setBodegas(bR.data); }); load(); }, []);
  useEffect(() => { setLoading(true); load(); }, [estadoFilter]);
  const handleCreate = async (e: React.FormEvent) => { e.preventDefault(); setError("");
    try { await api.post("/ventas/pedidos", { cliente_id: Number(clienteId), nota: nota || undefined, items: lineItems.map(l => ({ sku_id: Number(l.sku_id), cantidad_solicitada: Number(l.cantidad), precio_unitario: Number(l.precio) || 0 })) });
    setShowCreate(false); load(); } catch (err: any) { setError(err.response?.data?.detail || "Error"); } };
  const openDespacho = async (p: Pedido) => {
    const defBodega = bodegas[0]?.id?.toString() || "";
    setReceiving(p); setBodegaRec(defBodega);
    const items: Record<number, string> = {};
    p.items.forEach(i => { const pend = i.cantidad_solicitada - i.cantidad_despachada; if (pend > 0) items[i.id] = pend.toString(); });
    setDespItems(items); setError("");
    await fetchStockInfo(p, defBodega);
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
  const handleDespachar = async () => { setError("");
    try { const items = Object.entries(despItems).filter(([, v]) => Number(v) > 0).map(([k, v]) => ({ item_pedido_id: Number(k), cantidad_despachada: Number(v) }));
    if (items.length === 0) { setError("Debe despachar al menos un ítem"); return; }
    await api.post(`/ventas/pedidos/${receiving!.id}/despachar`, { bodega_id: Number(bodegaRec), items }); setMsg("Despacho registrado y stock actualizado"); load(); setTimeout(() => { setReceiving(null); setMsg(""); }, 2000); } catch (err: any) { setError(err.response?.data?.detail || "Error"); } };
  const openDevolucion = (p: Pedido) => { setDevolving(p); setBodegaDev(bodegas[0]?.id?.toString() || ""); const items: Record<number, string> = {}; p.items.forEach(i => { if (i.cantidad_despachada > 0) items[i.id] = ""; }); setDevItems(items); setError(""); };
  const handleDevolver = async () => { setError("");
    try { const items = Object.entries(devItems).filter(([, v]) => Number(v) > 0).map(([k, v]) => ({ item_pedido_id: Number(k), cantidad_devuelta: Number(v) }));
    if (items.length === 0) { setError("Debe devolver al menos un ítem"); return; }
    await api.post(`/ventas/pedidos/${devolving!.id}/devolver`, { bodega_id: Number(bodegaDev), items }); setDevolving(null); load(); } catch (err: any) { setError(err.response?.data?.detail || "Error"); } };
  const handleFacturar = async (id: number) => { const { data } = await api.post(`/ventas/pedidos/${id}/facturar`); setMsg(`Factura ${data.numero} generada`); load(); setTimeout(() => setMsg(""), 3000); };
  const handleCancelar = async (id: number, motivo: string) => { await api.post(`/ventas/pedidos/${id}/cancelar`, { motivo }); load(); };
  const skuOpts = skus.map((s: any) => ({ value: String(s.id), label: `${s.codigo_sku} - ${s.descripcion}` }));
  const cliOpts = clientes.map((c: any) => ({ value: String(c.id), label: `${c.codigo} - ${c.nombre}` }));
  return (<div><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}><h2 style={{ fontSize: 20, fontWeight: 700, color: "#1a1d23" }}>Pedidos de Venta</h2><button onClick={() => setShowCreate(!showCreate)} style={btnPri}>+ Nuevo Pedido</button></div>
    {msg && <div style={{ background: "#dcfce7", color: "#166534", padding: "10px 14px", borderRadius: 6, marginBottom: 16, fontSize: 13 }}>{msg}</div>}
    {showCreate && (<form onSubmit={handleCreate} style={{ ...card, marginBottom: 20 }}><h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Nuevo Pedido</h3>
      {error && <div style={{ background: "#fef2f2", color: "#dc2626", padding: "8px 12px", borderRadius: 6, marginBottom: 12, fontSize: 13 }}>{error}</div>}
      <div style={{ marginBottom: 12 }}><label style={lbl}>Cliente</label><SearchableSelect options={cliOpts} value={clienteId} onChange={setClienteId} placeholder="Seleccionar" required /></div>
      <div style={{ marginBottom: 12 }}><label style={lbl}>Nota</label><input value={nota} onChange={(e) => setNota(e.target.value)} style={inp} /></div>
      <h4 style={{ fontSize: 14, margin: "16px 0 8px" }}>Ítems</h4>
      {lineItems.map((li, idx) => (<div key={idx} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 40px", gap: 8, marginBottom: 8 }}>
        <SearchableSelect options={skuOpts} value={li.sku_id} onChange={(v) => { const c = [...lineItems]; c[idx].sku_id = v; setLineItems(c); }} placeholder="SKU" required />
        <input type="number" step="0.01" min="0.01" placeholder="Cant" value={li.cantidad} onChange={(e) => { const c2 = [...lineItems]; c2[idx].cantidad = e.target.value; setLineItems(c2); }} style={inp} required />
        <input type="number" step="0.01" min="0" placeholder="Precio" value={li.precio} onChange={(e) => { const c3 = [...lineItems]; c3[idx].precio = e.target.value; setLineItems(c3); }} style={inp} />
        <button type="button" onClick={() => { if (lineItems.length > 1) setLineItems(lineItems.filter((_, i) => i !== idx)); }} style={{ ...btnSec, padding: "4px 8px", fontSize: 14 }}>×</button></div>))}
      <button type="button" onClick={() => setLineItems([...lineItems, { sku_id: "", cantidad: "", precio: "" }])} style={{ ...btnSec, marginBottom: 12 }}>+ Agregar ítem</button>
      <div style={{ display: "flex", gap: 8 }}><button type="submit" style={btnPri}>Crear Pedido</button><button type="button" onClick={() => setShowCreate(false)} style={btnSec}>Cancelar</button></div></form>)}
    <div style={{ marginBottom: 16 }}><select value={estadoFilter} onChange={(e) => setEstadoFilter(e.target.value)} style={{ ...inp, width: 200 }}><option value="">Todos</option>{["pendiente","parcial","despachado","facturado","cancelado"].map(e => <option key={e} value={e}>{e}</option>)}</select></div>
    <div style={card}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr style={{ borderBottom: "1px solid #e5e7eb" }}><th style={th}>OV</th><th style={th}>Cliente</th><th style={th}>Fecha</th><th style={th}>Estado</th><th style={{ ...th, textAlign: "right" }}>Total</th><th style={th}>Ítems</th><th style={th}></th></tr></thead>
    <tbody>{loading ? <tr><td colSpan={7} style={{ ...td, textAlign: "center", color: "#9ca3af" }}>Cargando...</td></tr>
    : pedidos.map((p) => (<tr key={p.id} style={{ borderBottom: "1px solid #f3f4f6" }}><td style={{ ...td, fontWeight: 600, color: "#6366f1" }}>{p.numero}</td><td style={td}>{p.cliente_nombre}</td><td style={td}>{new Date(p.fecha_emision).toLocaleDateString()}</td>
      <td style={td}><span style={{ color: estColors[p.estado], fontWeight: 600, fontSize: 12 }}>{p.estado.toUpperCase()}</span></td><td style={{ ...td, textAlign: "right", fontWeight: 600 }}>${p.total.toFixed(2)}</td><td style={td}>{p.items.length}</td>
      <td style={td}>{(p.estado === "pendiente" || p.estado === "parcial") && <button onClick={() => openDespacho(p)} style={{ ...btnPri, fontSize: 11, padding: "4px 8px", marginRight: 4 }}>Despachar</button>}
        {(p.estado === "parcial" || p.estado === "despachado") && <button onClick={() => openDevolucion(p)} style={{ ...btnSm, marginRight: 4, color: "#dc2626" }}>Devolver</button>}
        {(p.estado === "despachado") && <button onClick={() => handleFacturar(p.id)} style={{ ...btnPri, fontSize: 11, padding: "4px 8px", marginRight: 4, background: "#16a34a" }}>Facturar</button>}
        {(p.estado !== "cancelado" && p.estado !== "facturado") && <button onClick={() => { const m = prompt("Motivo de cancelación:"); if (m) handleCancelar(p.id, m); }} style={{ ...btnSm, color: "#dc2626" }}>Cancelar</button>}</td></tr>))}</tbody></table></div>
    {receiving && (<Modal isOpen={!!receiving} title={`Despacho OV ${receiving.numero}`} onClose={() => setReceiving(null)}>
      {error && <div style={{ background: "#fef2f2", color: "#dc2626", padding: "10px", borderRadius: 6, marginBottom: 12, fontSize: 13 }}>{error}</div>}
      <div style={{ marginBottom: 12 }}><label style={lbl}>Bodega</label><select value={bodegaRec} onChange={(e) => { setBodegaRec(e.target.value); fetchStockInfo(receiving, e.target.value); }} style={inp}>{bodegas.map((b: any) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select></div>
      {receiving.items.map((i) => { const pend = i.cantidad_solicitada - i.cantidad_despachada; if (pend <= 0) return null; return (<div key={i.id} style={{ marginBottom: 8 }}><div style={{ display: "flex", gap: 12, alignItems: "center" }}><span style={{ flex: 1, fontSize: 13 }}>{i.sku_codigo} ({pend.toLocaleString()} pend.)</span><input type="number" step="0.01" min="0" max={pend} value={despItems[i.id] || ""} onChange={(e) => setDespItems({ ...despItems, [i.id]: e.target.value })} style={{ ...inp, width: 120 }} /></div>{stockInfo[i.id] && <span style={{ fontSize: 11, color: "#16a34a" }}>{stockInfo[i.id]}</span>}</div>); })}
      <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}><button onClick={() => setReceiving(null)} style={btnSec}>Cancelar</button><button onClick={handleDespachar} style={btnPri}>Confirmar Despacho</button></div></Modal>)}
    {devolving && (<Modal isOpen={!!devolving} title={`Devolución OV ${devolving.numero}`} onClose={() => setDevolving(null)}>
      {error && <div style={{ background: "#fef2f2", color: "#dc2626", padding: "10px", borderRadius: 6, marginBottom: 12, fontSize: 13 }}>{error}</div>}
      {(devolving.items.filter(i => i.cantidad_despachada > 0).length === 0) ? (
        <div style={{ textAlign: "center", padding: 20 }}>
          <p style={{ color: "#6b7280", fontSize: 14, marginBottom: 12 }}>No hay ítems despachados en este pedido.</p>
          <p style={{ color: "#9ca3af", fontSize: 13 }}>Primero debes despachar los ítems antes de poder devolverlos.</p>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 12 }}><label style={lbl}>Bodega destino</label><select value={bodegaDev} onChange={(e) => setBodegaDev(e.target.value)} style={inp}>{bodegas.map((b: any) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select></div>
          {devolving.items.map((i) => { if (i.cantidad_despachada <= 0) return null; return (<div key={i.id} style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}><span style={{ flex: 1, fontSize: 13 }}>{i.sku_codigo} (Despachado: {i.cantidad_despachada.toLocaleString()})</span><input type="number" step="0.01" min="0" max={i.cantidad_despachada} value={devItems[i.id] || ""} onChange={(e) => setDevItems({ ...devItems, [i.id]: e.target.value })} style={{ ...inp, width: 120 }} placeholder="Cant." /></div>); })}
          <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}><button onClick={() => setDevolving(null)} style={btnSec}>Cancelar</button><button onClick={handleDevolver} style={{ ...btnPri, background: "#dc2626" }}>Confirmar Devolución</button></div>
        </>
      )}
    </Modal>)}</div>);
}
const card: React.CSSProperties = { background: "#fff", padding: 20, borderRadius: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.08)", overflowX: "auto" };
const btnPri: React.CSSProperties = { padding: "8px 16px", background: "#6366f1", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 };
const btnSec: React.CSSProperties = { padding: "8px 16px", background: "#e5e7eb", color: "#374151", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 };
const btnSm: React.CSSProperties = { padding: "4px 10px", background: "#f3f4f6", color: "#374151", border: "1px solid #d1d5db", borderRadius: 4, cursor: "pointer", fontSize: 12 };
const inp: React.CSSProperties = { width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14, boxSizing: "border-box" };
const lbl: React.CSSProperties = { display: "block", marginBottom: 4, fontSize: 13, color: "#374151" };
const th: React.CSSProperties = { padding: "10px 8px", textAlign: "left", fontSize: 11, color: "#6b7280", textTransform: "uppercase", fontWeight: 600, whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "8px", fontSize: 13, whiteSpace: "nowrap" };
