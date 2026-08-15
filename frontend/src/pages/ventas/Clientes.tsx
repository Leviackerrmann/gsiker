import { useEffect, useState } from "react";
import api from "../../lib/api";
import { MONEDAS } from "../../lib/money";
interface Cliente { id: number; codigo: string; nombre: string; documento: string | null; direccion: string | null; telefono: string | null; email: string | null; moneda: string; activo: boolean; fecha_creacion: string; }
export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Cliente | null>(null);
  const [form, setForm] = useState({ codigo: "", nombre: "", documento: "", direccion: "", telefono: "", email: "", moneda: "GTQ" });
  const [error, setError] = useState("");
  const load = async () => { const { data } = await api.get("/ventas/clientes"); setClientes(data); setLoading(false); };
  useEffect(() => { load(); }, []);
  const reset = () => { setForm({ codigo: "", nombre: "", documento: "", direccion: "", telefono: "", email: "", moneda: "GTQ" }); setEditing(null); setError(""); };
  const openEdit = (c: Cliente) => { setForm({ codigo: c.codigo, nombre: c.nombre, documento: c.documento || "", direccion: c.direccion || "", telefono: c.telefono || "", email: c.email || "", moneda: c.moneda || "GTQ" }); setEditing(c); setShowForm(true); };
  const handleSubmit = async (e: React.FormEvent) => { e.preventDefault(); setError("");
    try { if (editing) await api.put(`/ventas/clientes/${editing.id}`, { nombre: form.nombre, documento: form.documento || null, direccion: form.direccion || null, telefono: form.telefono || null, email: form.email || null, moneda: form.moneda });
    else await api.post("/ventas/clientes", form); setShowForm(false); reset(); load(); } catch (err: any) { setError(err.response?.data?.detail || "Error"); } };
  const toggle = async (c: Cliente) => { await api.put(`/ventas/clientes/${c.id}`, { activo: !c.activo }); load(); };
  return (<div><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}><h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text)" }}>Clientes</h2><button onClick={() => { reset(); setShowForm(!showForm); }} style={btnPri}>+ Nuevo Cliente</button></div>
    {showForm && (<form onSubmit={handleSubmit} style={{ ...card, marginBottom: 20, maxWidth: 700 }}><h3 style={{ margin: "0 0 12px", fontSize: 15 }}>{editing ? "Editar" : "Nuevo"} Cliente</h3>
      {error && <div style={{ background: "var(--danger-bg)", color: "var(--danger)", padding: "8px 12px", borderRadius: "var(--radius-sm)", marginBottom: 12, fontSize: 13 }}>{error}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div><label style={lbl}>Código *</label><input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value.toUpperCase() })} style={inp} required disabled={!!editing} /></div>
        <div><label style={lbl}>Nombre *</label><input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} style={inp} required /></div></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div><label style={lbl}>Documento</label><input value={form.documento} onChange={(e) => setForm({ ...form, documento: e.target.value })} style={inp} /></div>
        <div><label style={lbl}>Teléfono</label><input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} style={inp} /></div></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div><label style={lbl}>Email</label><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={inp} /></div>
        <div><label style={lbl}>Dirección</label><input value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} style={inp} /></div></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div><label style={lbl}>Moneda</label><select value={form.moneda} onChange={(e) => setForm({ ...form, moneda: e.target.value })} style={inp}>{MONEDAS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></div></div>
      <div style={{ display: "flex", gap: 8 }}><button type="submit" style={btnPri}>{editing ? "Guardar" : "Crear"}</button><button type="button" onClick={() => { setShowForm(false); reset(); }} style={btnSec}>Cancelar</button></div></form>)}
    <div style={card}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr style={{ borderBottom: "1px solid #e5e7eb" }}><th style={th}>Código</th><th style={th}>Nombre</th><th style={th}>Documento</th><th style={th}>Moneda</th><th style={th}>Teléfono</th><th style={th}>Estado</th><th style={th}></th></tr></thead>
      <tbody>{loading ? <tr><td colSpan={7} style={{ ...td, textAlign: "center", color: "var(--text-muted)" }}>Cargando...</td></tr>
      : clientes.map((c) => (<tr key={c.id} style={{ borderBottom: "1px solid #f3f4f6" }}><td style={{ ...td, fontWeight: 600, color: "var(--primary)" }}>{c.codigo}</td><td style={td}>{c.nombre}</td><td style={td}>{c.documento || "-"}</td><td style={td}>{c.moneda || "GTQ"}</td><td style={td}>{c.telefono || "-"}</td>
      <td style={td}><span style={{ color: c.activo ? "#16a34a" : "#dc2626", fontWeight: 600 }}>{c.activo ? "Activo" : "Inactivo"}</span></td>
      <td style={td}><button onClick={() => openEdit(c)} style={btnSm}>Editar</button><button onClick={() => toggle(c)} style={{ ...btnSm, marginLeft: 6 }}>{c.activo ? "Desactivar" : "Activar"}</button></td></tr>))}</tbody></table></div></div>);
}
const card: React.CSSProperties = { background: "var(--surface)", padding: 20, borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow)", overflowX: "auto" };
const btnPri: React.CSSProperties = { padding: "8px 16px", background: "var(--primary)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 13, fontWeight: 600 };
const btnSec: React.CSSProperties = { padding: "8px 16px", background: "#e5e7eb", color: "var(--text)", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 13, fontWeight: 600 };
const btnSm: React.CSSProperties = { padding: "4px 10px", background: "#f3f4f6", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer", fontSize: 12 };
const inp: React.CSSProperties = { width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 14, boxSizing: "border-box" };
const lbl: React.CSSProperties = { display: "block", marginBottom: 4, fontSize: 13, color: "var(--text)" };
const th: React.CSSProperties = { padding: "10px 12px", textAlign: "left", fontSize: 12, color: "var(--text-secondary)", textTransform: "uppercase", fontWeight: 600 };
const td: React.CSSProperties = { padding: "10px 12px", fontSize: 14 };
