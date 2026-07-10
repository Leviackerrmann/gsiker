import { useEffect, useState } from "react";
import api from "../../lib/api";
import Modal from "../../components/Modal";
import SearchableSelect from "../../components/SearchableSelect";
import type { Bodega, SKU } from "../../types";

interface Reserva {
  id: number; sku_id: number; sku_codigo: string; sku_descripcion: string;
  bodega_id: number; bodega_nombre: string; cantidad: number;
  referencia: string | null; fecha_creacion: string; fecha_expiracion: string | null;
}

interface LoteItem { id: number; numero_lote: string; sku_id: number; }

export default function ReservasPage() {
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [bodegas, setBodegas] = useState<Bodega[]>([]);
  const [skus, setSkus] = useState<SKU[]>([]);
  const [lotes, setLotes] = useState<LoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [skuId, setSkuIdF] = useState("");
  const [bodegaIdF, setBodegaIdF] = useState("");
  const [loteIdF, setLoteIdF] = useState("");
  const [cantidadF, setCantidadF] = useState("");
  const [referenciaF, setReferenciaF] = useState("");
  const [error, setError] = useState("");
  const [confirmModal, setConfirmModal] = useState<{ title: string; msg: string; action: () => void } | null>(null);

  const selectedSku = skus.find((s) => s.id === Number(skuId));

  const load = async () => { const { data } = await api.get("/inventario/reservas"); setReservas(data); setLoading(false); };

  useEffect(() => {
    Promise.all([api.get("/inventario/bodegas"), api.get("/skus?limit=500"), api.get("/inventario/lotes")])
      .then(([bRes, sRes, lRes]) => { setBodegas(bRes.data); setSkus(sRes.data); setLotes(lRes.data); });
    load();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    try {
      await api.post("/inventario/reservas", {
        sku_id: Number(skuId), bodega_id: Number(bodegaIdF),
        lote_id: loteIdF ? Number(loteIdF) : undefined,
        cantidad: Number(cantidadF), referencia: referenciaF || undefined,
      });
      setShowForm(false); load();
    } catch (err: any) { setError(err.response?.data?.detail || "Error"); }
  };

  const askCancel = (id: number) => setConfirmModal({
    title: "Cancelar Reserva", msg: "¿Cancelar esta reserva?",
    action: async () => { await api.delete(`/inventario/reservas/${id}`); setConfirmModal(null); load(); },
  });

  const bodegaOpts = bodegas.map((b) => ({ value: String(b.id), label: b.nombre }));
  const skuOpts = skus.map((s) => ({ value: String(s.id), label: `${s.codigo_sku} - ${s.descripcion}` }));
  const loteOpts = lotes.filter((l) => l.sku_id === Number(skuId)).map((l) => ({ value: String(l.id), label: l.numero_lote }));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text)" }}>Reservas de Stock</h2>
        <button onClick={() => { setShowForm(!showForm); } } style={btnPri}>+ Nueva Reserva</button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} style={{ ...card, marginBottom: 20, maxWidth: 600 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Nueva Reserva</h3>
          {error && <div style={{ background: "var(--danger-bg)", color: "var(--danger)", padding: "8px 12px", borderRadius: "var(--radius-sm)", marginBottom: 12, fontSize: 13 }}>{error}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div><label style={lbl}>SKU</label><SearchableSelect options={skuOpts} value={skuId} onChange={(v) => { setSkuIdF(v); setLoteIdF(""); }} placeholder="SKU" required /></div>
            <div><label style={lbl}>Bodega</label><SearchableSelect options={bodegaOpts} value={bodegaIdF} onChange={setBodegaIdF} placeholder="Bodega" required /></div>
            <div><label style={lbl}>Cantidad</label><input type="number" step="0.01" min="0.01" value={cantidadF} onChange={(e) => setCantidadF(e.target.value)} style={inp} required /></div>
          </div>
          {selectedSku?.maneja_lotes && loteOpts.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>Lote (requerido para este SKU)</label>
              <SearchableSelect options={loteOpts} value={loteIdF} onChange={setLoteIdF} placeholder="Seleccionar lote..." required />
            </div>
          )}
          <div style={{ marginBottom: 12 }}><label style={lbl}>Referencia</label><input value={referenciaF} onChange={(e) => setReferenciaF(e.target.value)} style={inp} /></div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" style={btnPri}>Reservar</button>
            <button type="button" onClick={() => setShowForm(false)} style={btnSec}>Cancelar</button>
          </div>
        </form>
      )}

      <div style={card}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ borderBottom: "1px solid #e5e7eb" }}>
            <th style={th}>SKU</th><th style={th}>Descripción</th><th style={th}>Bodega</th><th style={{ ...th, textAlign: "right" }}>Cantidad</th><th style={th}>Referencia</th><th style={th}>Fecha</th><th style={th}></th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={7} style={{ ...td, textAlign: "center", color: "var(--text-muted)" }}>Cargando...</td></tr>
            : reservas.length === 0 ? <tr><td colSpan={7} style={{ ...td, textAlign: "center", color: "var(--text-muted)" }}>Sin reservas</td></tr>
            : reservas.map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ ...td, fontWeight: 600, color: "var(--primary)" }}>{r.sku_codigo}</td>
                <td style={td}>{r.sku_descripcion}</td><td style={td}>{r.bodega_nombre}</td>
                <td style={{ ...td, textAlign: "right", fontWeight: 600, color: "var(--warning)" }}>{r.cantidad.toLocaleString()}</td>
                <td style={td}>{r.referencia || "-"}</td>
                <td style={td}>{new Date(r.fecha_creacion).toLocaleString()}</td>
                <td style={td}><button onClick={() => askCancel(r.id)} style={{ padding: "4px 10px", background: "var(--danger-bg)", color: "var(--danger)", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>Cancelar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal isOpen={!!confirmModal} title={confirmModal?.title || ""} onClose={() => setConfirmModal(null)}>
        <p style={{ color: "var(--text)", marginBottom: 20, fontSize: 14 }}>{confirmModal?.msg}</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={() => setConfirmModal(null)} style={btnSec}>Cancelar</button>
          <button onClick={() => confirmModal?.action()} style={{ ...btnPri, background: "#dc2626" }}>Confirmar</button>
        </div>
      </Modal>
    </div>
  );
}

const card: React.CSSProperties = { background: "var(--surface)", padding: 20, borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow)", overflowX: "auto" };
const btnPri: React.CSSProperties = { padding: "8px 16px", background: "var(--primary)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 13, fontWeight: 600 };
const btnSec: React.CSSProperties = { padding: "8px 16px", background: "#e5e7eb", color: "var(--text)", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 13, fontWeight: 600 };
const inp: React.CSSProperties = { width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 14, boxSizing: "border-box" };
const lbl: React.CSSProperties = { display: "block", marginBottom: 4, fontSize: 13, color: "var(--text)" };
const th: React.CSSProperties = { padding: "10px 12px", textAlign: "left", fontSize: 12, color: "var(--text-secondary)", textTransform: "uppercase", fontWeight: 600 };
const td: React.CSSProperties = { padding: "10px 12px", fontSize: 14 };
