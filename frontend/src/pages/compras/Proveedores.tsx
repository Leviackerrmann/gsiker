import { useEffect, useState } from "react";
import api from "../../lib/api";

interface Proveedor {
  id: number;
  codigo: string;
  nombre: string;
  documento: string | null;
  direccion: string | null;
  telefono: string | null;
  email: string | null;
  activo: boolean;
  fecha_creacion: string;
}

export default function ProveedoresPage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Proveedor | null>(null);
  const [form, setForm] = useState({ codigo: "", nombre: "", documento: "", direccion: "", telefono: "", email: "" });
  const [error, setError] = useState("");

  const load = async () => {
    const { data } = await api.get("/compras/proveedores");
    setProveedores(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const reset = () => {
    setForm({ codigo: "", nombre: "", documento: "", direccion: "", telefono: "", email: "" });
    setEditing(null);
    setError("");
  };

  const openCreate = () => { reset(); setShowForm(true); };
  const openEdit = (p: Proveedor) => {
    setForm({ codigo: p.codigo, nombre: p.nombre, documento: p.documento || "", direccion: p.direccion || "", telefono: p.telefono || "", email: p.email || "" });
    setEditing(p);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      if (editing) {
        await api.put(`/compras/proveedores/${editing.id}`, {
          nombre: form.nombre, documento: form.documento || null,
          direccion: form.direccion || null, telefono: form.telefono || null,
          email: form.email || null,
        });
      } else {
        await api.post("/compras/proveedores", form);
      }
      setShowForm(false);
      reset();
      load();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Error al guardar");
    }
  };

  const toggleActivo = async (p: Proveedor) => {
    await api.put(`/compras/proveedores/${p.id}`, { activo: !p.activo });
    load();
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1a1d23" }}>Proveedores</h2>
        <button onClick={openCreate} style={btnPri}>+ Nuevo Proveedor</button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={{ ...card, marginBottom: 20, maxWidth: 700 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>{editing ? "Editar" : "Nuevo"} Proveedor</h3>
          {error && <div style={{ background: "#fef2f2", color: "#dc2626", padding: "8px 12px", borderRadius: 6, marginBottom: 12, fontSize: 13 }}>{error}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div><label style={lbl}>Código *</label><input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value.toUpperCase() })} style={inp} required disabled={!!editing} /></div>
            <div><label style={lbl}>Nombre *</label><input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} style={inp} required /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div><label style={lbl}>Documento</label><input value={form.documento} onChange={(e) => setForm({ ...form, documento: e.target.value })} style={inp} /></div>
            <div><label style={lbl}>Teléfono</label><input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} style={inp} /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div><label style={lbl}>Email</label><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={inp} /></div>
            <div><label style={lbl}>Dirección</label><input value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} style={inp} /></div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" style={btnPri}>{editing ? "Guardar" : "Crear"}</button>
            <button type="button" onClick={() => { setShowForm(false); reset(); }} style={btnSec}>Cancelar</button>
          </div>
        </form>
      )}

      <div style={card}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
              <th style={th}>Código</th>
              <th style={th}>Nombre</th>
              <th style={th}>Documento</th>
              <th style={th}>Teléfono</th>
              <th style={th}>Estado</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ ...td, textAlign: "center", color: "#9ca3af" }}>Cargando...</td></tr>
            ) : proveedores.length === 0 ? (
              <tr><td colSpan={6} style={{ ...td, textAlign: "center", color: "#9ca3af" }}>Sin proveedores</td></tr>
            ) : proveedores.map((p) => (
              <tr key={p.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ ...td, fontWeight: 600, color: "#6366f1" }}>{p.codigo}</td>
                <td style={td}>{p.nombre}</td>
                <td style={td}>{p.documento || "-"}</td>
                <td style={td}>{p.telefono || "-"}</td>
                <td style={td}><span style={{ color: p.activo ? "#16a34a" : "#dc2626", fontWeight: 600 }}>{p.activo ? "Activo" : "Inactivo"}</span></td>
                <td style={td}>
                  <button onClick={() => openEdit(p)} style={btnSm}>Editar</button>
                  <button onClick={() => toggleActivo(p)} style={{ ...btnSm, marginLeft: 6 }}>{p.activo ? "Desactivar" : "Activar"}</button>
                </td>
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
