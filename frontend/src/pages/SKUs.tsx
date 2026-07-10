import { useEffect, useState } from "react";
import api from "../lib/api";
import type { SKU } from "../types";

export default function SKUsPage() {
  const [skus, setSkus] = useState<SKU[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoriaFilter, setCategoriaFilter] = useState("");
  const [editing, setEditing] = useState<SKU | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState({
    codigo_sku: "",
    descripcion: "",
    unidad_medida: "UNIDAD",
    precio_referencia: "0",
    costo_unitario: "0",
    metodo_valorizacion: "PMP",
    categoria: "",
    subcategoria: "",
  });
  const [error, setError] = useState("");

  const load = async () => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (categoriaFilter) params.set("categoria", categoriaFilter);
    params.set("limit", "200");

    const { data } = await api.get(`/skus?${params}`);
    setSkus(data);
    setLoading(false);
  };

  useEffect(() => {
    api.get("/skus/categorias").then((res) => setCategorias(res.data));
    load();
  }, []);

  useEffect(() => {
    setLoading(true);
    load();
  }, [search, categoriaFilter]);

  const resetForm = () => {
    setForm({ codigo_sku: "", descripcion: "", unidad_medida: "UNIDAD", precio_referencia: "0", costo_unitario: "0", metodo_valorizacion: "PMP", categoria: "", subcategoria: "" });
    setEditing(null);
    setError("");
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (sku: SKU) => {
    setForm({
      codigo_sku: sku.codigo_sku,
      descripcion: sku.descripcion,
      unidad_medida: sku.unidad_medida,
      precio_referencia: sku.precio_referencia.toString(),
      costo_unitario: sku.costo_unitario.toString(),
      metodo_valorizacion: sku.metodo_valorizacion,
      categoria: sku.categoria || "",
      subcategoria: sku.subcategoria || "",
    });
    setEditing(sku);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const body = {
      descripcion: form.descripcion,
      unidad_medida: form.unidad_medida,
      precio_referencia: Number(form.precio_referencia) || 0,
      costo_unitario: Number(form.costo_unitario) || 0,
      metodo_valorizacion: form.metodo_valorizacion,
      categoria: form.categoria || null,
      subcategoria: form.subcategoria || null,
    };

    try {
      if (editing) {
        await api.put(`/skus/${editing.id}`, body);
      } else {
        await api.post("/skus", { ...body, codigo_sku: form.codigo_sku });
      }
      setShowForm(false);
      resetForm();
      load();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Error al guardar SKU");
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text)" }}>Catálogo de SKUs</h2>
        <button onClick={openCreate} style={btnPri}>+ Nuevo SKU</button>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <input
          placeholder="Buscar por código o descripción..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...inp, flex: 1 }}
        />
        <select
          value={categoriaFilter}
          onChange={(e) => setCategoriaFilter(e.target.value)}
          style={{ ...inp, width: 200 }}
        >
          <option value="">Todas las categorías</option>
          {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={{ ...card, marginBottom: 20, maxWidth: 700 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>
            {editing ? `Editar ${editing.codigo_sku}` : "Nuevo SKU"}
          </h3>
          {error && <div style={{ background: "var(--danger-bg)", color: "var(--danger)", padding: "8px 12px", borderRadius: "var(--radius-sm)", marginBottom: 12, fontSize: 13 }}>{error}</div>}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={lbl}>Código SKU *</label>
              <input value={form.codigo_sku} onChange={(e) => setForm({ ...form, codigo_sku: e.target.value.toUpperCase() })} style={inp} required disabled={!!editing} placeholder='MP-, PT-, ACC- (auto-numera)' />
            </div>
            <div>
              <label style={lbl}>Unidad de medida</label>
              <input value={form.unidad_medida} onChange={(e) => setForm({ ...form, unidad_medida: e.target.value })} style={inp} />
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>Descripción *</label>
            <input value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} style={inp} required />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={lbl}>Costo unitario</label>
              <input type="number" step="0.01" min="0" value={form.costo_unitario} onChange={(e) => setForm({ ...form, costo_unitario: e.target.value })} style={inp} />
            </div>
            <div>
              <label style={lbl}>Precio referencia</label>
              <input type="number" step="0.01" min="0" value={form.precio_referencia} onChange={(e) => setForm({ ...form, precio_referencia: e.target.value })} style={inp} />
            </div>
            <div>
              <label style={lbl}>Valorización</label>
              <select value={form.metodo_valorizacion} onChange={(e) => setForm({ ...form, metodo_valorizacion: e.target.value })} style={inp}>
                <option value="PMP">PMP (Promedio)</option>
                <option value="PEPS">PEPS (FIFO)</option>
                <option value="UEPS">UEPS (LIFO)</option>
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={lbl}>Categoría</label>
              <input value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} style={inp} list="cat-list" placeholder="MP, PT, ACC..." />
              <datalist id="cat-list">{categorias.map((c) => <option key={c} value={c} />)}</datalist>
            </div>
            <div>
              <label style={lbl}>Subcategoría</label>
              <input value={form.subcategoria} onChange={(e) => setForm({ ...form, subcategoria: e.target.value })} style={inp} />
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" style={btnPri}>{editing ? "Guardar cambios" : "Crear SKU"}</button>
            <button type="button" onClick={() => { setShowForm(false); resetForm(); }} style={btnSec}>Cancelar</button>
          </div>
        </form>
      )}

      <div style={card}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
              <th style={th}>Código</th>
              <th style={th}>Descripción</th>
              <th style={th}>U. Medida</th>
              <th style={th}>Categoría</th>
              <th style={{ ...th, textAlign: "right" }}>Costo</th>
              <th style={{ ...th, textAlign: "right" }}>Precio Ref.</th>
              <th style={th}>Valoriz.</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ ...td, textAlign: "center", color: "var(--text-muted)" }}>Cargando...</td></tr>
            ) : skus.length === 0 ? (
              <tr><td colSpan={8} style={{ ...td, textAlign: "center", color: "var(--text-muted)" }}>No se encontraron SKUs</td></tr>
            ) : (
              skus.map((s) => (
                <tr key={s.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ ...td, fontWeight: 600, color: "var(--primary)" }}>{s.codigo_sku}</td>
                  <td style={td}>{s.descripcion}</td>
                  <td style={td}>{s.unidad_medida}</td>
                  <td style={td}>{s.categoria || "-"}</td>
                  <td style={{ ...td, textAlign: "right" }}>${s.costo_unitario.toFixed(2)}</td>
                  <td style={{ ...td, textAlign: "right" }}>${s.precio_referencia.toFixed(2)}</td>
                  <td style={td}>{s.metodo_valorizacion}</td>
                  <td style={td}>
                    <button onClick={() => openEdit(s)} style={btnSm}>Editar</button>
                  </td>
                </tr>
              ))
            )}
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
const th: React.CSSProperties = { padding: "8px 10px", textAlign: "left", fontSize: 11, color: "var(--text-secondary)", textTransform: "uppercase", fontWeight: 600, whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "8px 10px", fontSize: 13 };
