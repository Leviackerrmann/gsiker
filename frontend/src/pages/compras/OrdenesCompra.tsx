import { useEffect, useState } from "react";
import api from "../../lib/api";
import Modal from "../../components/Modal";
import SearchableSelect from "../../components/SearchableSelect";
import Badge from "../../components/Badge";

interface Proveedor { id: number; codigo: string; nombre: string; activo: boolean; }
interface SKUItem { id: number; codigo_sku: string; descripcion: string; costo_unitario: number; }
interface ItemOC { id: number; sku_id: number; sku_codigo: string; sku_descripcion: string; cantidad_solicitada: number; cantidad_recibida: number; costo_unitario: number; costo_total: number; }
interface Orden { id: number; numero_oc: string; proveedor_id: number; proveedor_nombre: string; fecha_emision: string; fecha_entrega: string | null; estado: string; nota: string | null; items: ItemOC[]; }
interface Bodega { id: number; nombre: string; }

const estadoColors: Record<string, string> = { pendiente: "#f59e0b", parcial: "#3b82f6", completa: "#16a34a", cancelada: "#dc2626" };

export default function OrdenesCompraPage() {
  const [ordenes, setOrdenes] = useState<Orden[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [skus, setSkus] = useState<SKUItem[]>([]);
  const [bodegas, setBodegas] = useState<Bodega[]>([]);
  const [loading, setLoading] = useState(true);
  const [estadoFilter, setEstadoFilter] = useState("");
  const [proveedorFilter, setProveedorFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [detail, setDetail] = useState<Orden | null>(null);
  const [receiving, setReceiving] = useState<Orden | null>(null);
  const [devolving, setDevolving] = useState<Orden | null>(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [confirmModal, setConfirmModal] = useState<{ title: string; msg: string; action: () => void; hasInput?: boolean; inputLabel?: string; onConfirmInput?: (v: string) => void } | null>(null);
  const [motiveInput, setMotiveInput] = useState("");

  const [provId, setProvId] = useState("");
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
      .then(([pRes, sRes, bRes]) => {
        setProveedores(pRes.data.filter((p: Proveedor) => p.activo));
        setSkus(sRes.data); setBodegas(bRes.data);
      });
    load();
  }, []);

  useEffect(() => { setLoading(true); load(); }, [estadoFilter, proveedorFilter]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    try {
      await api.post("/compras/ordenes", {
        proveedor_id: Number(provId), fecha_entrega: nuevaFechaEntrega || null,
        nota: nota || undefined,
        items: lineItems.map((li) => ({ sku_id: Number(li.sku_id), cantidad_solicitada: Number(li.cantidad), costo_unitario: Number(li.costo) || 0 })),
      });
      setShowCreate(false); load();
    } catch (err: any) { setError(err.response?.data?.detail || "Error al crear orden"); }
  };

  const askCancel = (id: number) => {
    setMotiveInput("");
    setConfirmModal({
      title: "Cancelar Orden", msg: "¿Por qué cancelas esta orden?",
      hasInput: true, inputLabel: "Motivo de cancelación",
      action: () => {},
      onConfirmInput: async (motivo) => {
        await api.post(`/compras/ordenes/${id}/cancelar`, { motivo });
        setConfirmModal(null); load();
      },
    });
  };

  const openRecepcion = (orden: Orden) => {
    setReceiving(orden); setBodegaRecepcion(bodegas[0]?.id?.toString() || "");
    const items: Record<number, string> = {};
    orden.items.forEach((i) => {
      const pendiente = i.cantidad_solicitada - i.cantidad_recibida;
      if (pendiente > 0) items[i.id] = pendiente.toString();
    });
    setRecItems(items); setMsg(""); setError("");
  };

  const handleRecibir = async () => {
    setError(""); setMsg("");
    try {
      const items = Object.entries(recItems).filter(([, v]) => Number(v) > 0).map(([k, v]) => ({ item_orden_id: Number(k), cantidad_recibida: Number(v) }));
      if (items.length === 0) { setError("Debe recibir al menos un ítem"); return; }
      await api.post(`/compras/ordenes/${receiving!.id}/recibir`, { bodega_id: Number(bodegaRecepcion), items });
      setMsg("Recepción registrada y stock actualizado"); load();
      setTimeout(() => { setReceiving(null); setMsg(""); }, 2000);
    } catch (err: any) { setError(err.response?.data?.detail || "Error en recepción"); }
  };

  const openDevolucion = (orden: Orden) => {
    setDevolving(orden); setBodegaDevolucion(bodegas[0]?.id?.toString() || "");
    const items: Record<number, string> = {};
    orden.items.forEach((i) => {
      if (i.cantidad_recibida > 0) items[i.id] = "";
    });
    setDevItems(items); setError("");
  };

  const handleDevolver = async () => {
    setError("");
    try {
      const items = Object.entries(devItems).filter(([, v]) => Number(v) > 0).map(([k, v]) => ({ item_orden_id: Number(k), cantidad_devuelta: Number(v) }));
      if (items.length === 0) { setError("Debe devolver al menos un ítem"); return; }
      await api.post(`/compras/ordenes/${devolving!.id}/devolver`, { bodega_id: Number(bodegaDevolucion), items });
      setDevolving(null); load();
    } catch (err: any) { setError(err.response?.data?.detail || "Error en devolución"); }
  };

  const provOpts = proveedores.map((p) => ({ value: String(p.id), label: `${p.codigo} - ${p.nombre}` }));
  const skuOpts = skus.map((s) => ({ value: String(s.id), label: `${s.codigo_sku} - ${s.descripcion}` }));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1a1d23" }}>Órdenes de Compra</h2>
        <button onClick={() => setShowCreate(!showCreate)} style={btnPri}>+ Nueva Orden</button>
      </div>

      {msg && <div style={{ background: "#dcfce7", color: "#166534", padding: "10px 14px", borderRadius: 6, marginBottom: 16, fontSize: 13 }}>{msg}</div>}

      {showCreate && (
        <form onSubmit={handleCreate} style={{ ...card, marginBottom: 20 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Nueva Orden de Compra</h3>
          {error && <div style={{ background: "#fef2f2", color: "#dc2626", padding: "8px 12px", borderRadius: 6, marginBottom: 12, fontSize: 13 }}>{error}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div><label style={lbl}>Proveedor *</label><SearchableSelect options={provOpts} value={provId} onChange={setProvId} placeholder="Seleccionar..." required /></div>
            <div><label style={lbl}>Fecha entrega</label><input type="date" value={nuevaFechaEntrega} onChange={(e) => setNuevaFechaEntrega(e.target.value)} style={inp} /></div>
          </div>
          <div style={{ marginBottom: 12 }}><label style={lbl}>Nota</label><input value={nota} onChange={(e) => setNota(e.target.value)} style={inp} /></div>
          <h4 style={{ fontSize: 14, margin: "16px 0 8px" }}>Ítems</h4>
          {lineItems.map((li, idx) => (
            <div key={idx} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 40px", gap: 8, marginBottom: 8 }}>
              <SearchableSelect options={skuOpts} value={li.sku_id} onChange={(v) => { const copy = [...lineItems]; copy[idx].sku_id = v; const sku = skus.find((s) => s.id === Number(v)); if (sku) copy[idx].costo = sku.costo_unitario.toString(); setLineItems(copy); }} placeholder="SKU" required />
              <input type="number" step="0.01" min="0.01" placeholder="Cantidad" value={li.cantidad} onChange={(e) => { const c = [...lineItems]; c[idx].cantidad = e.target.value; setLineItems(c); }} style={inp} required />
              <input type="number" step="0.01" min="0" placeholder="Costo unit." value={li.costo} onChange={(e) => { const c = [...lineItems]; c[idx].costo = e.target.value; setLineItems(c); }} style={inp} />
              <button type="button" onClick={() => { if (lineItems.length > 1) setLineItems(lineItems.filter((_, i) => i !== idx)); }} style={{ ...btnSec, padding: "4px 8px", fontSize: 14 }}>×</button>
            </div>
          ))}
          <button type="button" onClick={() => setLineItems([...lineItems, { sku_id: "", cantidad: "", costo: "" }])} style={{ ...btnSec, marginBottom: 12 }}>+ Agregar ítem</button>
          <div style={{ display: "flex", gap: 8 }}><button type="submit" style={btnPri}>Crear Orden</button><button type="button" onClick={() => setShowCreate(false)} style={btnSec}>Cancelar</button></div>
        </form>
      )}

      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <select value={estadoFilter} onChange={(e) => setEstadoFilter(e.target.value)} style={{ ...inp, width: 180 }}>
          <option value="">Todos los estados</option>
          {["pendiente","parcial","completa","cancelada"].map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
        <select value={proveedorFilter} onChange={(e) => setProveedorFilter(e.target.value)} style={{ ...inp, width: 220 }}>
          <option value="">Todos los proveedores</option>
          {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
      </div>

      {detail && (
        <Modal isOpen={!!detail} title={`OC ${detail.numero_oc}`} onClose={() => setDetail(null)} maxWidth={700}>
          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 12 }}>
            Proveedor: {detail.proveedor_nombre} | Estado: <strong style={{ color: estadoColors[detail.estado] }}>{detail.estado}</strong>
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ borderBottom: "1px solid #e5e7eb" }}>
              <th style={th}>SKU</th><th style={th}>Desc</th><th style={{ ...th, textAlign: "right" }}>Solicitado</th><th style={{ ...th, textAlign: "right" }}>Recibido</th><th style={{ ...th, textAlign: "right" }}>Costo U.</th><th style={th}>Bodega</th>
            </tr></thead>
            <tbody>{detail.items.map((i) => (
              <tr key={i.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={td}>{i.sku_codigo}</td><td style={td}>{i.sku_descripcion}</td>
                <td style={{ ...td, textAlign: "right" }}>{i.cantidad_solicitada.toLocaleString()}</td>
                <td style={{ ...td, textAlign: "right", color: i.cantidad_recibida >= i.cantidad_solicitada ? "#16a34a" : "#f59e0b" }}>{i.cantidad_recibida.toLocaleString()}</td>
                <td style={{ ...td, textAlign: "right" }}>${i.costo_unitario.toFixed(2)}</td>
                <td style={td}>{i.cantidad_recibida > 0 ? (detail.estado !== "pendiente" ? "Recibido" : "-") : "-"}</td>
              </tr>
            ))}</tbody>
          </table>
        </Modal>
      )}

      {receiving && (
        <Modal isOpen={!!receiving} title={`Recepción OC ${receiving.numero_oc}`} onClose={() => setReceiving(null)}>
          {msg && <div style={{ background: "#dcfce7", color: "#166534", padding: "10px", borderRadius: 6, marginBottom: 12, fontSize: 13 }}>{msg}</div>}
          {error && <div style={{ background: "#fef2f2", color: "#dc2626", padding: "10px", borderRadius: 6, marginBottom: 12, fontSize: 13 }}>{error}</div>}
          <div style={{ marginBottom: 12 }}><label style={lbl}>Recibir en bodega</label><select value={bodegaRecepcion} onChange={(e) => setBodegaRecepcion(e.target.value)} style={inp}>{bodegas.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select></div>
          {receiving.items.map((i) => {
            const pendiente = i.cantidad_solicitada - i.cantidad_recibida;
            if (pendiente <= 0) return null;
            return (
              <div key={i.id} style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}>
                <span style={{ flex: 1, fontSize: 13 }}>{i.sku_codigo} ({pendiente.toLocaleString()} pendiente)</span>
                <input type="number" step="0.01" min="0" max={pendiente} value={recItems[i.id] || ""} onChange={(e) => setRecItems({ ...recItems, [i.id]: e.target.value })} style={{ ...inp, width: 120 }} />
              </div>
            );
          })}
          <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
            <button onClick={() => setReceiving(null)} style={btnSec}>Cancelar</button>
            <button onClick={handleRecibir} style={btnPri}>Confirmar Recepción</button>
          </div>
        </Modal>
      )}

      {devolving && (
        <Modal isOpen={!!devolving} title={`Devolución OC ${devolving.numero_oc}`} onClose={() => setDevolving(null)}>
          {error && <div style={{ background: "#fef2f2", color: "#dc2626", padding: "10px", borderRadius: 6, marginBottom: 12, fontSize: 13 }}>{error}</div>}
          <div style={{ marginBottom: 12 }}><label style={lbl}>Bodega origen</label><select value={bodegaDevolucion} onChange={(e) => setBodegaDevolucion(e.target.value)} style={inp}>{bodegas.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select></div>
          {devolving.items.map((i) => {
            if (i.cantidad_recibida <= 0) return null;
            return (
              <div key={i.id} style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}>
                <span style={{ flex: 1, fontSize: 13 }}>{i.sku_codigo} (Recibido: {i.cantidad_recibida.toLocaleString()})</span>
                <input type="number" step="0.01" min="0" max={i.cantidad_recibida} value={devItems[i.id] || ""} onChange={(e) => setDevItems({ ...devItems, [i.id]: e.target.value })} style={{ ...inp, width: 120 }} placeholder="Cant. a devolver" />
              </div>
            );
          })}
          <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
            <button onClick={() => setDevolving(null)} style={btnSec}>Cancelar</button>
            <button onClick={handleDevolver} style={{ ...btnPri, background: "#dc2626" }}>Confirmar Devolución</button>
          </div>
        </Modal>
      )}

      <div style={card}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ borderBottom: "1px solid #e5e7eb" }}>
            <th style={th}>OC</th><th style={th}>Proveedor</th><th style={th}>Fecha</th><th style={th}>Estado</th><th style={th}>Ítems</th><th style={th}></th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={6} style={{ ...td, textAlign: "center", color: "#9ca3af" }}>Cargando...</td></tr>
            : ordenes.length === 0 ? <tr><td colSpan={6} style={{ ...td, textAlign: "center", color: "#9ca3af" }}>Sin órdenes</td></tr>
            : ordenes.map((o) => (
              <tr key={o.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ ...td, fontWeight: 600, color: "#6366f1" }}>{o.numero_oc}</td>
                <td style={td}>{o.proveedor_nombre}</td>
                <td style={td}>{new Date(o.fecha_emision).toLocaleDateString()}</td>
                <td style={td}><Badge color={o.estado === "pendiente" ? "warning" : o.estado === "parcial" ? "info" : o.estado === "completa" ? "success" : "danger"}>{o.estado.toUpperCase()}</Badge></td>
                <td style={td}>{o.items.length}</td>
                <td style={td}>
                  <button onClick={() => setDetail(o)} style={{ ...btnSm, marginRight: 4 }}>Ver</button>
                  {(o.estado === "pendiente" || o.estado === "parcial") && (
                    <button onClick={() => openRecepcion(o)} style={{ ...btnPri, fontSize: 11, padding: "4px 8px", marginRight: 4 }}>Recibir</button>
                  )}
                  {(o.estado === "parcial" || o.estado === "completa") && (
                    <button onClick={() => openDevolucion(o)} style={{ ...btnSm, marginRight: 4, color: "#dc2626" }}>Devolver</button>
                  )}
                  {(o.estado === "pendiente" || o.estado === "parcial") && (
                    <button onClick={() => askCancel(o.id)} style={{ ...btnSm, color: "#dc2626" }}>Cancelar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal isOpen={!!confirmModal} title={confirmModal?.title || ""} onClose={() => setConfirmModal(null)}>
        <p style={{ color: "#374151", marginBottom: 12, fontSize: 14 }}>{confirmModal?.msg}</p>
        {confirmModal?.hasInput && (
          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>{confirmModal.inputLabel}</label>
            <input value={motiveInput} onChange={(e) => setMotiveInput(e.target.value)} style={inp} autoFocus placeholder="Escribe el motivo..." />
          </div>
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={() => setConfirmModal(null)} style={btnSec}>Cancelar</button>
          <button onClick={() => confirmModal?.onConfirmInput?.(motiveInput)} style={{ ...btnPri, background: "#dc2626" }}>Cancelar Orden</button>
        </div>
      </Modal>
    </div>
  );
}

const card: React.CSSProperties = { background: "#fff", padding: 20, borderRadius: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.08)", overflowX: "auto" };
const btnPri: React.CSSProperties = { padding: "8px 16px", background: "#6366f1", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 };
const btnSec: React.CSSProperties = { padding: "8px 16px", background: "#e5e7eb", color: "#374151", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 };
const btnSm: React.CSSProperties = { padding: "4px 10px", background: "#f3f4f6", color: "#374151", border: "1px solid #d1d5db", borderRadius: 4, cursor: "pointer", fontSize: 12 };
const inp: React.CSSProperties = { width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14, boxSizing: "border-box" };
const lbl: React.CSSProperties = { display: "block", marginBottom: 4, fontSize: 13, color: "#374151" };
const th: React.CSSProperties = { padding: "10px 8px", textAlign: "left", fontSize: 11, color: "#6b7280", textTransform: "uppercase", fontWeight: 600, whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "8px", fontSize: 13, whiteSpace: "nowrap" };
