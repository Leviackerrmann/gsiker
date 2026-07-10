import { useEffect, useState } from "react";
import api from "../lib/api";

interface Usuario {
  id: number; username: string; email: string | null; nombre_completo: string; rol: string; activo: boolean; fecha_creacion: string;
}

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Usuario | null>(null);
  const [form, setForm] = useState({ username: "", password: "", email: "", nombre_completo: "", rol: "operador" });
  const [error, setError] = useState("");

  const load = async () => { const { data } = await api.get("/usuarios"); setUsuarios(data); setLoading(false); };
  useEffect(() => { load(); }, []);

  const reset = () => { setForm({ username: "", password: "", email: "", nombre_completo: "", rol: "operador" }); setEditing(null); setError(""); };

  const openEdit = (u: Usuario) => { setForm({ username: u.username, password: "", email: u.email || "", nombre_completo: u.nombre_completo, rol: u.rol }); setEditing(u); setShowForm(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      if (editing) {
        await api.put(`/usuarios/${editing.id}`, { nombre_completo: form.nombre_completo, email: form.email || null, rol: form.rol });
      } else {
        await api.post("/usuarios", form);
      }
      setShowForm(false); reset(); load();
    } catch (err: any) { setError(err.response?.data?.detail || "Error"); }
  };

  const toggleActivo = async (u: Usuario) => { await api.put(`/usuarios/${u.id}`, { activo: !u.activo }); load(); };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text)" }}>Usuarios</h2>
        <button onClick={() => { reset(); setShowForm(!showForm); }} style={btnPri}>+ Nuevo Usuario</button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={{ ...card, marginBottom: 20, maxWidth: 600 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>{editing ? "Editar" : "Nuevo"} Usuario</h3>
          {error && <div style={{ background: "var(--danger-bg)", color: "var(--danger)", padding: "8px 12px", borderRadius: "var(--radius-sm)", marginBottom: 12, fontSize: 13 }}>{error}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div><label style={lbl}>Username *</label><input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} style={inp} required disabled={!!editing} /></div>
            <div><label style={lbl}>Contraseña {editing ? "(dejar vacío)" : "*"}</label><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} style={inp} required={!editing} /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div><label style={lbl}>Nombre completo *</label><input value={form.nombre_completo} onChange={(e) => setForm({ ...form, nombre_completo: e.target.value })} style={inp} required /></div>
            <div><label style={lbl}>Email</label><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={inp} /></div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>Rol</label>
            <select value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value })} style={inp}>
              <option value="operador">Operador</option>
              <option value="admin">Admin</option>
              <option value="superadmin">Superadmin</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" style={btnPri}>{editing ? "Guardar" : "Crear"}</button>
            <button type="button" onClick={() => { setShowForm(false); reset(); }} style={btnSec}>Cancelar</button>
          </div>
        </form>
      )}

      <div style={card}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ borderBottom: "1px solid #e5e7eb" }}>
            <th style={th}>Usuario</th><th style={th}>Nombre</th><th style={th}>Rol</th><th style={th}>Email</th><th style={th}>Estado</th><th style={th}></th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={6} style={{ ...td, textAlign: "center", color: "var(--text-muted)" }}>Cargando...</td></tr>
            : usuarios.map((u) => (
              <tr key={u.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ ...td, fontWeight: 600 }}>{u.username}</td><td style={td}>{u.nombre_completo}</td>
                <td style={td}><span style={{ color: u.rol === "superadmin" ? "#6366f1" : u.rol === "admin" ? "#3b82f6" : "#6b7280", fontWeight: 600 }}>{u.rol}</span></td>
                <td style={td}>{u.email || "-"}</td>
                <td style={td}><span style={{ color: u.activo ? "#16a34a" : "#dc2626", fontWeight: 600 }}>{u.activo ? "Activo" : "Inactivo"}</span></td>
                <td style={td}>
                  <button onClick={() => openEdit(u)} style={btnSm}>Editar</button>
                  <button onClick={() => toggleActivo(u)} style={{ ...btnSm, marginLeft: 4 }}>{u.activo ? "Desactivar" : "Activar"}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const card: React.CSSProperties = { background: "var(--surface)", padding: 20, borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow)", overflowX: "auto" };
const btnPri: React.CSSProperties = { padding: "8px 16px", background: "var(--primary)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 13, fontWeight: 600 };
const btnSec: React.CSSProperties = { padding: "8px 16px", background: "#e5e7eb", color: "var(--text)", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 13, fontWeight: 600 };
const btnSm: React.CSSProperties = { padding: "4px 10px", background: "#f3f4f6", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer", fontSize: 12 };
const inp: React.CSSProperties = { width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 14, boxSizing: "border-box" };
const lbl: React.CSSProperties = { display: "block", marginBottom: 4, fontSize: 13, color: "var(--text)" };
const th: React.CSSProperties = { padding: "10px 12px", textAlign: "left", fontSize: 12, color: "var(--text-secondary)", textTransform: "uppercase", fontWeight: 600 };
const td: React.CSSProperties = { padding: "10px 12px", fontSize: 14 };
