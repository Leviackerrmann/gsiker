import { useEffect, useState } from "react";
import api from "../../lib/api";
import type { Bodega } from "../../types";

export default function BodegasPage() {
  const [bodegas, setBodegas] = useState<Bodega[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [nombre, setNombre] = useState("");
  const [ubicacion, setUbicacion] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);

  const load = async () => {
    const { data } = await api.get("/inventario/bodegas");
    setBodegas(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      await api.put(`/inventario/bodegas/${editingId}`, { nombre, ubicacion });
    } else {
      await api.post("/inventario/bodegas", { nombre, ubicacion: ubicacion || undefined });
    }
    setShowForm(false);
    setNombre("");
    setUbicacion("");
    setEditingId(null);
    load();
  };

  const handleEdit = (b: Bodega) => {
    setEditingId(b.id);
    setNombre(b.nombre);
    setUbicacion(b.ubicacion || "");
    setShowForm(true);
  };

  const handleToggle = async (b: Bodega) => {
    await api.put(`/inventario/bodegas/${b.id}`, { activa: !b.activa });
    load();
  };

  if (loading) return <p style={{ color: "#6b7280" }}>Cargando...</p>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1a1d23" }}>Bodegas</h2>
        <button onClick={() => { setShowForm(!showForm); setEditingId(null); setNombre(""); setUbicacion(""); }} style={btnPrimary}>
          + Nueva Bodega
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={{ ...card, marginBottom: 20 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>{editingId ? "Editar" : "Nueva"} Bodega</h3>
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <input
              placeholder="Nombre *"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
              style={inputStyle}
            />
            <input
              placeholder="Ubicación"
              value={ubicacion}
              onChange={(e) => setUbicacion(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" style={btnPrimary}>{editingId ? "Guardar" : "Crear"}</button>
            <button type="button" onClick={() => setShowForm(false)} style={btnSecondary}>Cancelar</button>
          </div>
        </form>
      )}

      <div style={card}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
              <th style={thStyle}>Nombre</th>
              <th style={thStyle}>Ubicación</th>
              <th style={thStyle}>Estado</th>
              <th style={thStyle}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {bodegas.map((b) => (
              <tr key={b.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={tdStyle}>{b.nombre}</td>
                <td style={tdStyle}>{b.ubicacion || "-"}</td>
                <td style={tdStyle}>
                  <span style={{ color: b.activa ? "#16a34a" : "#dc2626", fontWeight: 600, fontSize: 13 }}>
                    {b.activa ? "Activa" : "Inactiva"}
                  </span>
                </td>
                <td style={tdStyle}>
                  <button onClick={() => handleEdit(b)} style={btnSmall}>Editar</button>
                  <button onClick={() => handleToggle(b)} style={{ ...btnSmall, marginLeft: 6 }}>
                    {b.activa ? "Desactivar" : "Activar"}
                  </button>
                </td>
              </tr>
            ))}
            {bodegas.length === 0 && (
              <tr><td colSpan={4} style={{ ...tdStyle, textAlign: "center", color: "#9ca3af" }}>No hay bodegas registradas</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const card: React.CSSProperties = { background: "#fff", padding: 20, borderRadius: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" };
const btnPrimary: React.CSSProperties = { padding: "8px 16px", background: "#6366f1", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 };
const btnSecondary: React.CSSProperties = { padding: "8px 16px", background: "#e5e7eb", color: "#374151", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 };
const btnSmall: React.CSSProperties = { padding: "4px 10px", background: "#f3f4f6", color: "#374151", border: "1px solid #d1d5db", borderRadius: 4, cursor: "pointer", fontSize: 12 };
const inputStyle: React.CSSProperties = { flex: 1, padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14 };
const thStyle: React.CSSProperties = { padding: "10px 12px", textAlign: "left", fontSize: 12, color: "#6b7280", textTransform: "uppercase", fontWeight: 600 };
const tdStyle: React.CSSProperties = { padding: "10px 12px", fontSize: 14 };
