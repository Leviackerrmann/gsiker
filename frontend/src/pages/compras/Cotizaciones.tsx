import { useEffect, useState } from "react";
import api from "../../lib/api";

interface Item { id: number; sku_id: number; sku_codigo: string; sku_descripcion: string; cantidad: number; }

interface Propuesta { id: number; proveedor_nombre: string; fecha: string; adjudicada: boolean; notas: string | null; total: number; items: { item_cotizacion_id: number; costo_unitario: number }[]; }

interface Cotizacion { id: number; numero: string; fecha: string; estado: string; notas: string | null; usuario_nombre: string | null; items: Item[]; propuestas: Propuesta[]; }

export default function CotizacionesPage() {
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [provs, setProvs] = useState<any[]>([]);
  const [skus, setSkus] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [lineItems, setLineItems] = useState<{ sku_id: string; cantidad: string }[]>([{ sku_id: "", cantidad: "" }]);
  const [showProp, setShowProp] = useState<Cotizacion | null>(null);
  const [propProv, setPropProv] = useState("");
  const [propCostos, setPropCostos] = useState<Record<number, string>>({});
  const [msg, setMsg] = useState("");

  const load = async () => { const { data } = await api.get("/compras/cotizaciones"); setCotizaciones(data); setLoading(false); };
  useEffect(() => { api.get("/compras/proveedores").then((r) => setProvs(r.data)); api.get("/skus?limit=300").then((r) => setSkus(r.data)); load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.post("/compras/cotizaciones", { items: lineItems.map((l) => ({ sku_id: Number(l.sku_id), cantidad: Number(l.cantidad) })) });
    setShowCreate(false); setLineItems([{ sku_id: "", cantidad: "" }]); load();
  };

  const openPropuesta = (cot: Cotizacion) => {
    setShowProp(cot);
    setPropProv(provs[0]?.id?.toString() || "");
    const costs: Record<number, string> = {};
    cot.items.forEach((i) => { costs[i.id] = ""; });
    setPropCostos(costs);
  };

  const handleRegistrarPropuesta = async () => {
    const items = Object.entries(propCostos).filter(([, v]) => v !== "").map(([k, v]) => ({ item_cotizacion_id: Number(k), costo_unitario: Number(v) }));
    if (items.length === 0) return;
    await api.post(`/compras/cotizaciones/${showProp!.id}/propuestas`, { proveedor_id: Number(propProv), items });
    setShowProp(null); load();
  };

  const handleAdjudicar = async (cotId: number, propId: number) => {
    if (!confirm("¿Adjudicar esta propuesta? Se creará una OC automática.")) return;
    const { data } = await api.post(`/compras/cotizaciones/${cotId}/adjudicar`, { propuesta_id: propId });
    setMsg(`OC ${data.numero_oc} creada`); load(); setTimeout(() => setMsg(""), 4000);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1a1d23" }}>Cotizaciones</h2>
        <button onClick={() => setShowCreate(!showCreate)} style={btnPri}>+ Nueva Cotización</button>
      </div>
      {msg && <div style={{ background: "#dcfce7", color: "#166534", padding: "10px 14px", borderRadius: 6, marginBottom: 16, fontSize: 13 }}>{msg}</div>}

      {showCreate && (
        <form onSubmit={handleCreate} style={{ ...card, marginBottom: 20 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Nueva Cotización</h3>
          {lineItems.map((li, idx) => (
            <div key={idx} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 40px", gap: 8, marginBottom: 8 }}>
              <select value={li.sku_id} onChange={(e) => { const c = [...lineItems]; c[idx].sku_id = e.target.value; setLineItems(c); }} style={inp} required><option value="">SKU</option>{skus.map((s) => <option key={s.id} value={s.id}>{s.codigo_sku} - {s.descripcion}</option>)}</select>
              <input type="number" step="0.01" min="0.01" placeholder="Cantidad" value={li.cantidad} onChange={(e) => { const c = [...lineItems]; c[idx].cantidad = e.target.value; setLineItems(c); }} style={inp} required />
              <button type="button" onClick={() => { if (lineItems.length > 1) setLineItems(lineItems.filter((_, i) => i !== idx)); }} style={{ ...btnSec, padding: "4px 8px", fontSize: 14 }}>×</button>
            </div>
          ))}
          <button type="button" onClick={() => setLineItems([...lineItems, { sku_id: "", cantidad: "" }])} style={{ ...btnSec, marginBottom: 12 }}>+ Agregar ítem</button>
          <button type="submit" style={btnPri}>Crear Cotización</button>
        </form>
      )}

      {showProp && (
        <div style={modalOverlay}><div style={modalCard} onClick={(e) => e.stopPropagation()}>
          <h3>Propuesta para {showProp.numero}</h3>
          <div style={{ marginBottom: 12 }}><label style={lbl}>Proveedor</label><select value={propProv} onChange={(e) => setPropProv(e.target.value)} style={inp}>{provs.map((p: any) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
          {showProp.items.map((i) => (
            <div key={i.id} style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}>
              <span style={{ flex: 1, fontSize: 13 }}>{i.sku_codigo} ({i.cantidad.toLocaleString()} u)</span>
              <input type="number" step="0.01" placeholder="Costo unit." value={propCostos[i.id] || ""} onChange={(e) => setPropCostos({ ...propCostos, [i.id]: e.target.value })} style={{ ...inp, width: 120 }} />
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button onClick={handleRegistrarPropuesta} style={btnPri}>Registrar Propuesta</button>
            <button onClick={() => setShowProp(null)} style={btnSec}>Cerrar</button>
          </div>
        </div></div>
      )}

      <div style={card}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ borderBottom: "1px solid #e5e7eb" }}>
            <th style={th}>#</th><th style={th}>Fecha</th><th style={th}>Ítems</th><th style={th}>Propuestas</th><th style={th}>Estado</th><th style={th}></th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={6} style={{ ...td, textAlign: "center", color: "#9ca3af" }}>Cargando...</td></tr>
            : cotizaciones.length === 0 ? <tr><td colSpan={6} style={{ ...td, textAlign: "center", color: "#9ca3af" }}>Sin cotizaciones</td></tr>
            : cotizaciones.map((c) => (
              <tr key={c.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ ...td, fontWeight: 600 }}>{c.numero}</td>
                <td style={td}>{new Date(c.fecha).toLocaleDateString()}</td>
                <td style={td}>{c.items.length} ({c.items.reduce((a, i) => a + i.cantidad, 0).toLocaleString()} u)</td>
                <td style={td}>{c.propuestas.map((p) => (
                  <div key={p.id} style={{ marginBottom: 4, background: p.adjudicada ? "#dcfce7" : "#f3f4f6", padding: "4px 8px", borderRadius: 4, fontSize: 12 }}>
                    {p.proveedor_nombre}: ${p.total.toFixed(2)} {p.adjudicada ? "✅" : (
                      c.estado !== "adjudicada" ? <button onClick={() => handleAdjudicar(c.id, p.id)} style={{ ...btnSm, marginLeft: 8, color: "#16a34a" }}>Adjudicar</button> : null
                    )}
                  </div>
                ))}</td>
                <td style={td}><span style={{ fontWeight: 600, fontSize: 12, color: c.estado === "adjudicada" ? "#16a34a" : c.estado === "en_proceso" ? "#3b82f6" : "#f59e0b" }}>{c.estado.toUpperCase()}</span></td>
                <td style={td}>{c.estado !== "adjudicada" && <button onClick={() => openPropuesta(c)} style={btnPri}>+ Propuesta</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const card: React.CSSProperties = { background: "#fff", padding: 20, borderRadius: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.08)", overflowX: "auto" };
const btnPri: React.CSSProperties = { padding: "8px 16px", background: "#6366f1", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 };
const btnSec: React.CSSProperties = { padding: "8px 16px", background: "#e5e7eb", color: "#374151", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 };
const btnSm: React.CSSProperties = { padding: "4px 10px", background: "#f3f4f6", color: "#374151", border: "1px solid #d1d5db", borderRadius: 4, cursor: "pointer", fontSize: 12 };
const inp: React.CSSProperties = { width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14, boxSizing: "border-box" };
const lbl: React.CSSProperties = { display: "block", marginBottom: 4, fontSize: 13, color: "#374151" };
const th: React.CSSProperties = { padding: "10px 12px", textAlign: "left", fontSize: 12, color: "#6b7280", textTransform: "uppercase", fontWeight: 600 };
const td: React.CSSProperties = { padding: "10px 12px", fontSize: 14 };
const modalOverlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 };
const modalCard: React.CSSProperties = { background: "#fff", padding: 30, borderRadius: 12, boxShadow: "0 20px 60px rgba(0,0,0,0.3)", maxWidth: 600, width: "90%", maxHeight: "80vh", overflow: "auto" };
