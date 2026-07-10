import { useEffect, useState } from "react";
import api from "../../lib/api";
import Modal from "../../components/Modal";
import Badge from "../../components/Badge";
import SearchableSelect from "../../components/SearchableSelect";

interface ItemSol { id: number; sku_id: number; sku_codigo: string; sku_descripcion: string; cantidad: number; justificacion: string | null; }
interface Solicitud { id: number; numero: string; fecha: string; usuario_nombre: string | null; estado: string; notas: string | null; items: ItemSol[]; }
interface SKUItem { id: number; codigo_sku: string; descripcion: string; }

export default function SolicitudesPage() {
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [skus, setSkus] = useState<SKUItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [estadoFilter, setEstadoFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [lineItems, setLineItems] = useState<{ sku_id: string; cantidad: string; justificacion: string; stock: string }[]>([{ sku_id: "", cantidad: "", justificacion: "", stock: "" }]);
  const [confirmModal, setConfirmModal] = useState<{ title: string; msg: string; action: () => void } | null>(null);

  const load = async () => {
    const params = estadoFilter ? `?estado=${estadoFilter}` : "";
    const { data } = await api.get(`/compras/solicitudes${params}`);
    setSolicitudes(data); setLoading(false);
  };

  useEffect(() => { api.get("/skus?limit=500").then((r) => setSkus(r.data)); load(); }, []);
  useEffect(() => { setLoading(true); load(); }, [estadoFilter]);

  const onSkuChange = async (idx: number, skuId: string) => {
    const c = [...lineItems];
    c[idx].sku_id = skuId;
    if (skuId) {
      try {
        const { data } = await api.get(`/inventario/stock?sku_id=${skuId}`);
        const total = data.reduce((a: number, s: any) => a + s.cantidad_disponible, 0);
        c[idx].stock = `${total.toLocaleString()} disponibles`;
      } catch { c[idx].stock = ""; }
    } else {
      c[idx].stock = "";
    }
    setLineItems(c);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    try {
      const res = await api.post("/compras/solicitudes", {
        items: lineItems.map((li) => ({ sku_id: Number(li.sku_id), cantidad: Number(li.cantidad), justificacion: li.justificacion || undefined })),
      });
      setMsg(`Solicitud ${res.data.numero} creada`); setShowForm(false);
      setLineItems([{ sku_id: "", cantidad: "", justificacion: "", stock: "" }]); load();
      setTimeout(() => setMsg(""), 3000);
    } catch (err: any) { setError(err.response?.data?.detail || "Error"); }
  };

  const askApprove = (id: number) => setConfirmModal({ title: "Aprobar Solicitud", msg: "¿Aprobar esta solicitud de compra?", action: async () => { await api.post(`/compras/solicitudes/${id}/aprobar`); setConfirmModal(null); load(); } });
  const askReject = (id: number) => setConfirmModal({ title: "Rechazar Solicitud", msg: "¿Rechazar esta solicitud?", action: async () => { await api.post(`/compras/solicitudes/${id}/rechazar`); setConfirmModal(null); load(); } });
  const askConvert = (id: number) => setConfirmModal({ title: "Convertir en OC", msg: "¿Convertir esta solicitud en Orden de Compra?", action: async () => {
      const res = await api.post(`/compras/solicitudes/${id}/convertir`);
      setMsg(`Convertida en ${res.data.numero_oc}`); setConfirmModal(null); load(); setTimeout(() => setMsg(""), 3000);
  }});

  const skuOpts = skus.map((s) => ({ value: String(s.id), label: `${s.codigo_sku} - ${s.descripcion}` }));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text)" }}>Solicitudes de Compra</h2>
        <button onClick={() => setShowForm(!showForm)} style={btnPri}>+ Nueva Solicitud</button>
      </div>
      {msg && <div style={{ background: "var(--success-bg)", color: "var(--success-text)", padding: "10px 14px", borderRadius: "var(--radius-sm)", marginBottom: 16, fontSize: 13 }}>{msg}</div>}

      {showForm && (
        <form onSubmit={handleCreate} style={{ ...card, marginBottom: 20 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Nueva Solicitud</h3>
          {error && <div style={{ background: "var(--danger-bg)", color: "var(--danger)", padding: "8px 12px", borderRadius: "var(--radius-sm)", marginBottom: 12, fontSize: 13 }}>{error}</div>}
          {lineItems.map((li, idx) => (
            <div key={idx} style={{ marginBottom: 8 }}>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 2fr 40px", gap: 8, marginBottom: 4 }}>
                <SearchableSelect options={skuOpts} value={li.sku_id} onChange={(v) => onSkuChange(idx, v)} placeholder="SKU" required />
                <input type="number" step="0.01" min="0.01" placeholder="Cantidad" value={li.cantidad} onChange={(e) => { const c = [...lineItems]; c[idx].cantidad = e.target.value; setLineItems(c); }} style={inp} required />
                <input placeholder="Justificación" value={li.justificacion} onChange={(e) => { const c = [...lineItems]; c[idx].justificacion = e.target.value; setLineItems(c); }} style={inp} />
                <button type="button" onClick={() => { if (lineItems.length > 1) setLineItems(lineItems.filter((_, i) => i !== idx)); }} style={{ ...btnSec, padding: "4px 8px", fontSize: 14 }}>×</button>
              </div>
              {li.stock && <span style={{ fontSize: 12, color: "var(--success)", paddingLeft: 4 }}>{li.stock}</span>}
            </div>
          ))}
          <button type="button" onClick={() => setLineItems([...lineItems, { sku_id: "", cantidad: "", justificacion: "", stock: "" }])} style={{ ...btnSec, marginBottom: 12 }}>+ Agregar ítem</button>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" style={btnPri}>Crear Solicitud</button>
            <button type="button" onClick={() => setShowForm(false)} style={btnSec}>Cancelar</button>
          </div>
        </form>
      )}

      <div style={{ marginBottom: 16 }}>
        <select value={estadoFilter} onChange={(e) => setEstadoFilter(e.target.value)} style={{ padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 14, width: 200 }}>
          <option value="">Todos</option>
          {["pendiente","aprobada","rechazada","convertida"].map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
      </div>

      <div style={card}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ borderBottom: "1px solid #e5e7eb" }}>
            <th style={th}>#</th><th style={th}>Fecha</th><th style={th}>Solicitante</th><th style={th}>Ítems</th><th style={th}>Estado</th><th style={th}></th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={6} style={{ ...td, textAlign: "center", color: "var(--text-muted)" }}>Cargando...</td></tr>
            : solicitudes.length === 0 ? <tr><td colSpan={6} style={{ ...td, textAlign: "center", color: "var(--text-muted)" }}>Sin solicitudes</td></tr>
            : solicitudes.map((s) => (
              <tr key={s.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ ...td, fontWeight: 600 }}>{s.numero}</td>
                <td style={td}>{new Date(s.fecha).toLocaleDateString()}</td>
                <td style={td}>{s.usuario_nombre || "-"}</td>
                <td style={td}>{s.items.length} ({s.items.reduce((a, i) => a + i.cantidad, 0).toLocaleString()} u)</td>
                <td style={td}><Badge color={s.estado === "aprobada" ? "success" : s.estado === "rechazada" ? "danger" : s.estado === "convertida" ? "info" : "warning"}>{s.estado.toUpperCase()}</Badge></td>
                <td style={td}>
                  {s.estado === "pendiente" && (<>
                    <button onClick={() => askApprove(s.id)} style={{ ...btnSm, color: "var(--success)", marginRight: 4 }}>Aprobar</button>
                    <button onClick={() => askReject(s.id)} style={{ ...btnSm, color: "var(--danger)" }}>Rechazar</button>
                  </>)}
                  {s.estado === "aprobada" && <button onClick={() => askConvert(s.id)} style={btnPri}>Convertir en OC</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal isOpen={!!confirmModal} title={confirmModal?.title || ""} onClose={() => setConfirmModal(null)}>
        <p style={{ color: "var(--text)", marginBottom: 20, fontSize: 14 }}>{confirmModal?.msg}</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={() => setConfirmModal(null)} style={btnSec}>Cancelar</button>
          <button onClick={() => confirmModal?.action()} style={btnPri}>Confirmar</button>
        </div>
      </Modal>
    </div>
  );
}

const card: React.CSSProperties = { background: "var(--surface)", padding: 20, borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow)", overflowX: "auto" };
const btnPri: React.CSSProperties = { padding: "8px 16px", background: "var(--primary)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 13, fontWeight: 600 };
const btnSec: React.CSSProperties = { padding: "8px 16px", background: "#e5e7eb", color: "var(--text)", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 13, fontWeight: 600 };
const btnSm: React.CSSProperties = { padding: "4px 10px", background: "#f3f4f6", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer", fontSize: 12 };
const inp: React.CSSProperties = { padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 14, boxSizing: "border-box" };
const th: React.CSSProperties = { padding: "10px 12px", textAlign: "left", fontSize: 12, color: "var(--text-secondary)", textTransform: "uppercase", fontWeight: 600 };
const td: React.CSSProperties = { padding: "10px 12px", fontSize: 14 };
