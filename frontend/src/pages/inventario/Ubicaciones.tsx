import { useEffect, useState } from "react";
import api from "../../lib/api";
import type { Bodega } from "../../types";

interface Ubicacion { id: number; bodega_id: number; bodega_nombre: string; codigo: string; descripcion: string | null; activa: boolean; }

export default function UbicacionesPage() {
  const [ubis, setUbis] = useState<Ubicacion[]>([]);
  const [bodegas, setBodegas] = useState<Bodega[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [bodegaId, setBodegaIdF] = useState("");
  const [codigo, setCodigo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [error, setError] = useState("");

  const load = async () => { const { data } = await api.get("/inventario/ubicaciones"); setUbis(data); setLoading(false); };
  useEffect(() => { api.get("/inventario/bodegas").then((r) => setBodegas(r.data)); load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await api.post("/inventario/ubicaciones", { bodega_id: Number(bodegaId), codigo, descripcion: descripcion || undefined });
      setShowForm(false); setBodegaIdF(""); setCodigo(""); setDescripcion("");
      load();
    } catch (err: any) { setError(err.response?.data?.detail || "Error"); }
  };

  const handleDelete = async (id: number) => { if (!confirm("¿Eliminar?")) return; await api.delete(`/inventario/ubicaciones/${id}`); load(); };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1a1d23" }}>Ubicaciones</h2>
        <button onClick={() => setShowForm(!showForm)} style={btnPri}>+ Nueva Ubicación</button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} style={{ ...card, marginBottom: 20, maxWidth: 500 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Nueva Ubicación</h3>
          {error && <div style={{ background: "#fef2f2", color: "#dc2626", padding: "8px 12px", borderRadius: 6, marginBottom: 12, fontSize: 13 }}>{error}</div>}
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>Bodega *</label>
            <select value={bodegaId} onChange={(e) => setBodegaIdF(e.target.value)} style={inp} required><option value="">Seleccionar</option>{bodegas.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div><label style={lbl}>Código *</label><input value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} style={inp} required placeholder="A-01-03" /></div>
            <div><label style={lbl}>Descripción</label><input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} style={inp} placeholder="Pasillo A, Estante 1, Nivel 3" /></div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" style={btnPri}>Crear</button>
            <button type="button" onClick={() => setShowForm(false)} style={btnSec}>Cancelar</button>
          </div>
        </form>
      )}

      <div style={card}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ borderBottom: "1px solid #e5e7eb" }}>
            <th style={th}>Código</th><th style={th}>Bodega</th><th style={th}>Descripción</th><th style={th}></th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={4} style={{ ...td, textAlign: "center", color: "#9ca3af" }}>Cargando...</td></tr>
            : ubis.length === 0 ? <tr><td colSpan={4} style={{ ...td, textAlign: "center", color: "#9ca3af" }}>Sin ubicaciones</td></tr>
            : ubis.map((u) => (
              <tr key={u.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ ...td, fontWeight: 600, color: "#6366f1" }}>{u.codigo}</td>
                <td style={td}>{u.bodega_nombre}</td>
                <td style={td}>{u.descripcion || "-"}</td>
                <td style={td}><button onClick={() => handleDelete(u.id)} style={{ ...btnSm, color: "#dc2626" }}>Eliminar</button></td>
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
