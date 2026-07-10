import { useEffect, useState } from "react";
import api from "../../lib/api";
import SearchableSelect from "../../components/SearchableSelect";
interface Item { id: number; sku_id: number; sku_codigo: string; sku_descripcion: string; cantidad: number; precio_unitario: number; precio_total: number; }
interface Cotizacion { id: number; numero: string; cliente_id: number; cliente_nombre: string; fecha: string; estado: string; notas: string | null; usuario_nombre: string | null; items: Item[]; }
export default function CotizacionesVentaPage() {
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [clientes, setClientes] = useState<any[]>([]); const [skus, setSkus] = useState<any[]>([]);
  const [loading, setLoading] = useState(true); const [showForm, setShowForm] = useState(false);
  const [clienteId, setClienteId] = useState("");
  const [lineItems, setLineItems] = useState<{ sku_id: string; cantidad: string; precio: string }[]>([{ sku_id: "", cantidad: "", precio: "" }]);
  const [msg, setMsg] = useState("");
  const load = async () => { const { data } = await api.get("/ventas/cotizaciones"); setCotizaciones(data); setLoading(false); };
  useEffect(() => { api.get("/ventas/clientes").then(r => { setClientes(r.data.filter((c: any) => c.activo)); }); api.get("/skus?limit=300").then(r => setSkus(r.data)); load(); }, []);
  const handleCreate = async (e: React.FormEvent) => { e.preventDefault();
    await api.post("/ventas/cotizaciones", { cliente_id: Number(clienteId), items: lineItems.map(l => ({ sku_id: Number(l.sku_id), cantidad: Number(l.cantidad), precio_unitario: Number(l.precio) || 0 })) });
    setShowForm(false); setClienteId(""); setLineItems([{ sku_id: "", cantidad: "", precio: "" }]); load(); };
  const handleAction = async (id: number, action: string) => {
    if (action === "convertir") {
      const r = await api.post(`/ventas/cotizaciones/${id}/convertir`);
      setMsg(`Pedido ${r.data.numero} creado`); setTimeout(() => setMsg(""), 3000);
    } else {
      await api.post(`/ventas/cotizaciones/${id}/${action}`);
    }
    load(); };
  const skuOpts = skus.map((s: any) => ({ value: String(s.id), label: `${s.codigo_sku} - ${s.descripcion}` }));
  const clienteOpts = clientes.map((c: any) => ({ value: String(c.id), label: `${c.codigo} - ${c.nombre}` }));
  return (<div><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}><h2 style={{ fontSize: 20, fontWeight: 700, color: "#1a1d23" }}>Cotizaciones de Venta</h2><button onClick={() => setShowForm(!showForm)} style={btnPri}>+ Nueva Cotización</button></div>
    {msg && <div style={{ background: "#dcfce7", color: "#166534", padding: "10px 14px", borderRadius: 6, marginBottom: 16, fontSize: 13 }}>{msg}</div>}
    {showForm && (<form onSubmit={handleCreate} style={{ ...card, marginBottom: 20, maxWidth: 600 }}><h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Nueva Cotización</h3>
      <div style={{ marginBottom: 12 }}><label style={lbl}>Cliente</label><SearchableSelect options={clienteOpts} value={clienteId} onChange={setClienteId} placeholder="Seleccionar cliente" required /></div>
      {lineItems.map((li, idx) => (<div key={idx} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 40px", gap: 8, marginBottom: 8 }}>
        <SearchableSelect options={skuOpts} value={li.sku_id} onChange={(v) => { const c = [...lineItems]; c[idx].sku_id = v; setLineItems(c); }} placeholder="SKU" required />
        <input type="number" step="0.01" min="0.01" placeholder="Cant" value={li.cantidad} onChange={(e) => { const c2 = [...lineItems]; c2[idx].cantidad = e.target.value; setLineItems(c2); }} style={inp} required />
        <input type="number" step="0.01" min="0" placeholder="Precio" value={li.precio} onChange={(e) => { const c3 = [...lineItems]; c3[idx].precio = e.target.value; setLineItems(c3); }} style={inp} />
        <button type="button" onClick={() => { if (lineItems.length > 1) setLineItems(lineItems.filter((_, i) => i !== idx)); }} style={{ ...btnSec, padding: "4px 8px", fontSize: 14 }}>×</button></div>))}
      <button type="button" onClick={() => setLineItems([...lineItems, { sku_id: "", cantidad: "", precio: "" }])} style={{ ...btnSec, marginBottom: 12 }}>+ Agregar ítem</button>
      <button type="submit" style={btnPri}>Crear Cotización</button></form>)}
    <div style={card}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr style={{ borderBottom: "1px solid #e5e7eb" }}><th style={th}>#</th><th style={th}>Fecha</th><th style={th}>Cliente</th><th style={th}>Ítems</th><th style={th}>Total</th><th style={th}>Estado</th><th style={th}></th></tr></thead>
    <tbody>{loading ? <tr><td colSpan={7} style={{ ...td, textAlign: "center", color: "#9ca3af" }}>Cargando...</td></tr>
    : cotizaciones.map((c) => { const total = c.items.reduce((a, i) => a + i.precio_total, 0); return (<tr key={c.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
      <td style={{ ...td, fontWeight: 600 }}>{c.numero}</td><td style={td}>{new Date(c.fecha).toLocaleDateString()}</td><td style={td}>{c.cliente_nombre}</td><td style={td}>{c.items.length}</td><td style={{ ...td, fontWeight: 600 }}>${total.toFixed(2)}</td>
      <td style={td}><span style={{ fontWeight: 600, fontSize: 12, color: c.estado === "aceptada" || c.estado === "convertida" ? "#16a34a" : c.estado === "rechazada" ? "#dc2626" : "#f59e0b" }}>{c.estado}</span></td>
      <td style={td}>{c.estado === "pendiente" && <><button onClick={() => handleAction(c.id, "aceptar")} style={{ ...btnSm, color: "#16a34a", marginRight: 4 }}>Aceptar</button><button onClick={() => handleAction(c.id, "rechazar")} style={{ ...btnSm, color: "#dc2626" }}>Rechazar</button></>}
        {c.estado === "aceptada" && <button onClick={() => handleAction(c.id, "convertir")} style={btnPri}>Convertir</button>}</td></tr>); })}</tbody></table></div></div>);
}
const card: React.CSSProperties = { background: "#fff", padding: 20, borderRadius: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.08)", overflowX: "auto" };
const btnPri: React.CSSProperties = { padding: "8px 16px", background: "#6366f1", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 };
const btnSec: React.CSSProperties = { padding: "8px 16px", background: "#e5e7eb", color: "#374151", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 };
const btnSm: React.CSSProperties = { padding: "4px 10px", background: "#f3f4f6", color: "#374151", border: "1px solid #d1d5db", borderRadius: 4, cursor: "pointer", fontSize: 12 };
const inp: React.CSSProperties = { width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14, boxSizing: "border-box" };
const lbl: React.CSSProperties = { display: "block", marginBottom: 4, fontSize: 13, color: "#374151" };
const th: React.CSSProperties = { padding: "10px 12px", textAlign: "left", fontSize: 12, color: "#6b7280", textTransform: "uppercase", fontWeight: 600 };
const td: React.CSSProperties = { padding: "10px 12px", fontSize: 14 };
