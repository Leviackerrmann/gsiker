import { useEffect, useMemo, useState } from "react";
import api from "../../lib/api";
import Modal from "../../components/Modal";
import { useToast } from "../../components/Toast";
import type { Bodega } from "../../types";

interface Ubicacion { id: number; bodega_id: number; bodega_nombre: string; codigo: string; descripcion: string | null; activa: boolean; }

export default function UbicacionesPage() {
  const toast = useToast();
  const [ubis, setUbis] = useState<Ubicacion[]>([]);
  const [bodegas, setBodegas] = useState<Bodega[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [bodegaFilter, setBodegaFilter] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [bodegaId, setBodegaIdF] = useState("");
  const [codigo, setCodigo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [error, setError] = useState("");

  const load = async () => { const { data } = await api.get("/inventario/ubicaciones"); setUbis(data); setLoading(false); };
  useEffect(() => { api.get("/inventario/bodegas").then((r) => setBodegas(r.data)); load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    try {
      await api.post("/inventario/ubicaciones", { bodega_id: Number(bodegaId), codigo, descripcion: descripcion || undefined });
      toast.success("Ubicación creada");
      setShowForm(false); setBodegaIdF(""); setCodigo(""); setDescripcion(""); load();
    } catch (err: any) { setError(err.response?.data?.detail || "Error"); }
  };
  const handleDelete = async (id: number) => { if (!confirm("¿Eliminar esta ubicación?")) return; await api.delete(`/inventario/ubicaciones/${id}`); toast.success("Ubicación eliminada"); load(); };

  const filtered = useMemo(() => ubis.filter((u) => {
    if (bodegaFilter && String(u.bodega_id) !== bodegaFilter) return false;
    if (search) { const h = `${u.codigo} ${u.descripcion || ""} ${u.bodega_nombre}`.toLowerCase(); if (!h.includes(search.toLowerCase())) return false; }
    return true;
  }), [ubis, bodegaFilter, search]);

  return (
    <div style={{ animation: "fadeInUp .45s ease forwards" }}>
      <div className="ui-head">
        <div><h1 className="ui-title">Ubicaciones</h1><p className="ui-subtitle">Estanterías y posiciones dentro de las bodegas</p></div>
        <button className="ui-btn-primary" onClick={() => setShowForm(true)}><i className="fas fa-plus" /> Nueva ubicación</button>
      </div>

      <div className="ui-stats">
        <div className="ui-stat"><div className="ui-stat-top"><span className="ui-stat-lbl">Total ubicaciones</span><i className="fas fa-map-location-dot" style={{ color: "var(--primary)" }} /></div><div className="ui-stat-val">{ubis.length}</div></div>
        <div className="ui-stat"><div className="ui-stat-top"><span className="ui-stat-lbl">Bodegas</span><i className="fas fa-warehouse" style={{ color: "var(--success-text)" }} /></div><div className="ui-stat-val">{bodegas.length}</div></div>
      </div>

      <div className="ui-toolbar">
        <div className="ui-search-wrap"><i className="fas fa-search" /><input className="ui-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por código o descripción..." /></div>
        <select className="ui-select" value={bodegaFilter} onChange={(e) => setBodegaFilter(e.target.value)}><option value="">Todas las bodegas</option>{bodegas.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select>
      </div>

      <div className="ui-table-wrap">
        <table className="ui-table">
          <thead><tr><th>Código</th><th>Bodega</th><th>Descripción</th><th style={{ width: 90 }}></th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={4} style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Cargando...</td></tr>
            : filtered.length === 0 ? <tr><td colSpan={4} className="ui-empty"><i className="fas fa-map-location-dot" />No hay ubicaciones con estos filtros</td></tr>
            : filtered.map((u) => (
              <tr key={u.id} style={{ borderBottom: "1px solid var(--row-border)" }}>
                <td><span className="ui-code">{u.codigo}</span></td>
                <td style={{ color: "var(--text-primary)", fontWeight: 600 }}>{u.bodega_nombre}</td>
                <td>{u.descripcion || <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                <td style={{ textAlign: "right" }}><button className="ui-btn-danger" style={{ padding: "5px 12px", fontSize: 12 }} onClick={() => handleDelete(u.id)}>Eliminar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal isOpen={showForm} title="Nueva ubicación" onClose={() => setShowForm(false)} maxWidth={480}>
        <form onSubmit={handleCreate}>
          {error && <div className="ui-error">{error}</div>}
          <div className="ui-field"><label>Bodega *</label><select value={bodegaId} onChange={(e) => setBodegaIdF(e.target.value)} className="ui-input" required><option value="">Seleccionar</option>{bodegas.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select></div>
          <div className="ui-field"><label>Código *</label><input value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} className="ui-input" required placeholder="A-01-03" /></div>
          <div className="ui-field"><label>Descripción</label><input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className="ui-input" placeholder="Pasillo A, Estante 1, Nivel 3" /></div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
            <button type="button" onClick={() => setShowForm(false)} className="ui-btn-ghost">Cancelar</button>
            <button type="submit" className="ui-btn-primary">Crear ubicación</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
