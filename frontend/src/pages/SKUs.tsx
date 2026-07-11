import { useEffect, useState } from "react";
import api from "../lib/api";
import Modal from "../components/Modal";
import Badge from "../components/Badge";
import { useToast } from "../components/Toast";

import type { SKU } from "../types";

export default function SKUsPage() {
  const [skus, setSkus] = useState<SKU[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoriaFilter, setCategoriaFilter] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<SKU | null>(null);
  const [form, setForm] = useState({
    codigo_sku: "", descripcion: "", unidad_medida: "UNIDAD",
    costo_unitario: "0", precio_referencia: "0", categoria: "", subcategoria: "",
  });
  const [error, setError] = useState("");
  const toast = useToast();

  const load = () => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (categoriaFilter) params.set("categoria", categoriaFilter);
    params.set("limit", "500");
    api.get(`/skus?${params}`).then((res) => { setSkus(res.data); setLoading(false); });
  };

  useEffect(() => { api.get("/skus/categorias").then((r) => setCategorias(r.data)); load(); }, []);
  useEffect(() => { setLoading(true); load(); }, [search, categoriaFilter]);

  const openCreate = () => {
    setForm({ codigo_sku: "", descripcion: "", unidad_medida: "UNIDAD", costo_unitario: "0", precio_referencia: "0", categoria: "", subcategoria: "" });
    setEditing(null); setError(""); setShowModal(true);
  };

  const openEdit = (sku: SKU) => {
    setForm({
      codigo_sku: sku.codigo_sku, descripcion: sku.descripcion, unidad_medida: sku.unidad_medida,
      costo_unitario: sku.costo_unitario.toString(), precio_referencia: sku.precio_referencia.toString(),
      categoria: sku.categoria || "", subcategoria: sku.subcategoria || "",
    });
    setEditing(sku); setError(""); setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    const body = {
      descripcion: form.descripcion, unidad_medida: form.unidad_medida,
      costo_unitario: Number(form.costo_unitario) || 0, precio_referencia: Number(form.precio_referencia) || 0,
      categoria: form.categoria || null, subcategoria: form.subcategoria || null,
    };
    try {
      if (editing) {
        await api.put(`/skus/${editing.id}`, body);
        toast.success(`SKU ${editing.codigo_sku} actualizado`);
      } else {
        await api.post("/skus", { ...body, codigo_sku: form.codigo_sku });
        toast.success(`SKU ${form.codigo_sku} creado`);
      }
      setShowModal(false); load();
    } catch (err: any) { setError(err.response?.data?.detail || "Error al guardar"); }
  };

  const categories = categorias.filter(c => c);

  const umOptions = ["UNIDAD", "KG", "MTS", "LITRO", "M2", "ROLLO", "PAR", "SERVICIO"];

  return (
    <div style={{ animation: "fadeInUp .45s ease forwards" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 24, position: "relative", zIndex: 1 }}>
        <div>
          <h1 style={{ fontFamily: "'Space Grotesk'", fontSize: 26, fontWeight: 700, letterSpacing: "-0.5px", color: "var(--text-primary)", margin: 0, transition: "var(--transition)" }}>Catálogo SKU</h1>
          <p style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 4, transition: "var(--transition)" }}>Gestión de productos y materiales del inventario</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={openCreate} style={btnPri}>
            <i className="fas fa-plus" style={{ fontSize: 11 }} /> Nuevo SKU
          </button>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, position: "relative", zIndex: 1, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 220, maxWidth: 360 }}>
          <i className="fas fa-search" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", fontSize: 13 }} />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por código o descripción..." style={searchStyle}
          />
        </div>
        <select value={categoriaFilter} onChange={(e) => setCategoriaFilter(e.target.value)} style={filterStyle}>
          <option value="">Todas las categorías</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: "auto", whiteSpace: "nowrap", transition: "var(--transition)" }}>
          Mostrando <strong style={{ color: "var(--accent)", fontWeight: 700 }}>{loading ? "..." : skus.length}</strong> SKUs
        </div>
      </div>

      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--card-radius)", overflow: "hidden", boxShadow: "var(--card-shadow)", position: "relative", zIndex: 1, transition: "all .5s ease" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Código</th>
              <th style={th}>Descripción</th>
              <th style={th}>U. Medida</th>
              <th style={th}>Categoría</th>
              <th style={{ ...th, textAlign: "right" }}>Costo</th>
              <th style={{ ...th, textAlign: "right" }}>Precio Ref.</th>
              <th style={{ ...th, textAlign: "right" }}>Valoriz.</th>
              <th style={{ ...th, width: 72 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ ...td, textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Cargando...</td></tr>
            ) : skus.length === 0 ? (
              <tr><td colSpan={8} style={{ ...td, textAlign: "center", padding: 50, color: "var(--text-muted)" }}>
                <div style={{ fontSize: 32, marginBottom: 10, opacity: .3 }}>📦</div>
                {search ? "No se encontraron SKUs con los filtros aplicados" : "No hay SKUs registrados"}
              </td></tr>
            ) : (
              skus.map((s) => (
                <tr key={s.id} style={{ borderBottom: "1px solid var(--row-border)", transition: "background .15s ease" }}>
                  <td style={td}><span style={{ fontFamily: "'Space Grotesk'", fontWeight: 600, color: "var(--accent)", fontSize: 13 }}>{s.codigo_sku}</span></td>
                  <td style={td}><span style={{ color: "var(--text-primary)", fontWeight: 500, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>{s.descripcion}</span></td>
                  <td style={td}><span style={{ color: "var(--text-muted)", fontSize: 12 }}>{s.unidad_medida}</span></td>
                  <td style={td}>{s.categoria ? <Badge category={s.categoria}>{s.categoria}</Badge> : <span style={{ color: "var(--text-muted)" }}>-</span>}</td>
                  <td style={{ ...td, textAlign: "right", fontFamily: "'Space Grotesk'", fontWeight: 600, color: "var(--text-primary)", fontSize: 13 }}>${(s.costo_unitario || 0).toFixed(2)}</td>
                  <td style={{ ...td, textAlign: "right", fontFamily: "'Space Grotesk'", fontWeight: 600, color: "var(--text-primary)", fontSize: 13 }}>${(s.precio_referencia || 0).toFixed(2)}</td>
                  <td style={{ ...td, textAlign: "right", fontFamily: "'Space Grotesk'", fontWeight: 700, fontSize: 14, color: "var(--text-primary)" }}>${((s.costo_unitario || 0) * (s.precio_referencia || 0)).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
                  <td style={td}>
                    <div className="row-actions" style={{ display: "flex", gap: 4, opacity: 0, transition: "opacity .2s" }}>
                      <button onClick={() => openEdit(s)} style={rowBtn} title="Editar"><i className="fas fa-pen" style={{ fontSize: 10 }} /></button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <style>{`
        .sku-table tbody tr:hover .row-actions, table tbody tr:hover .row-actions { opacity: 1 !important; }
        table tbody tr:hover { background: var(--bg-table-row-hover); }
      `}</style>

      <Modal isOpen={showModal} title={editing ? `Editar SKU: ${editing.codigo_sku}` : "Nuevo SKU"} onClose={() => setShowModal(false)} maxWidth={560}>
        <form onSubmit={handleSubmit}>
          {error && <div style={{ background: "var(--danger-bg)", color: "var(--danger)", padding: "8px 12px", borderRadius: "var(--radius-sm)", marginBottom: 14, fontSize: 13 }}>{error}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div>
              <label style={lbl}>Código</label>
              <input value={form.codigo_sku} onChange={(e) => setForm({ ...form, codigo_sku: e.target.value.toUpperCase() })} style={inp} required disabled={!!editing} placeholder="Ej: MP-00001" />
            </div>
            <div>
              <label style={lbl}>Unidad de Medida</label>
              <select value={form.unidad_medida} onChange={(e) => setForm({ ...form, unidad_medida: e.target.value })} style={inp}>
                {umOptions.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Descripción</label>
            <input value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} style={inp} required placeholder="Descripción del producto" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div>
              <label style={lbl}>Categoría</label>
              <input value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value.toUpperCase() })} style={inp} list="cat-datalist" placeholder="MP, PT, INS..." />
              <datalist id="cat-datalist">{categories.map((c) => <option key={c} value={c} />)}</datalist>
            </div>
            <div>
              <label style={lbl}>Subcategoría</label>
              <input value={form.subcategoria} onChange={(e) => setForm({ ...form, subcategoria: e.target.value })} style={inp} placeholder="Opcional" />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 24 }}>
            <div>
              <label style={lbl}>Costo ($)</label>
              <input type="number" step="0.01" min="0" value={form.costo_unitario} onChange={(e) => setForm({ ...form, costo_unitario: e.target.value })} style={inp} />
            </div>
            <div>
              <label style={lbl}>Precio Referencia ($)</label>
              <input type="number" step="0.01" min="0" value={form.precio_referencia} onChange={(e) => setForm({ ...form, precio_referencia: e.target.value })} style={inp} />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
            <button type="button" onClick={() => setShowModal(false)} style={btnGhost}>Cancelar</button>
            <button type="submit" style={btnPri}>{editing ? "Guardar cambios" : "Crear SKU"}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

const btnPri: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none", color: "#fff", fontFamily: "inherit", background: "linear-gradient(135deg, var(--accent-grad-start), var(--accent-grad-end))", boxShadow: "0 4px 16px var(--accent-glow)", transition: "all .25s ease" };
const btnGhost: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", fontFamily: "inherit", transition: "all .3s ease" };
const rowBtn: React.CSSProperties = { width: 30, height: 30, borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 12, transition: "all .2s" };
const searchStyle: React.CSSProperties = { width: "100%", padding: "10px 14px 10px 40px", borderRadius: 8, border: "1px solid var(--input-border)", background: "var(--input-bg)", color: "var(--text-primary)", fontSize: 13, fontFamily: "inherit", outline: "none", transition: "all .25s ease" };
const filterStyle: React.CSSProperties = { padding: "10px 36px 10px 14px", borderRadius: 8, border: "1px solid var(--input-border)", background: "var(--input-bg)", color: "var(--text-primary)", fontSize: 13, fontFamily: "inherit", outline: "none", cursor: "pointer", transition: "all .25s ease", appearance: "none", WebkitAppearance: "none" };
const inp: React.CSSProperties = { width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid var(--input-border)", background: "var(--input-bg)", color: "var(--text-primary)", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", transition: "all .25s ease" };
const lbl: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".8px", color: "var(--text-muted)", marginBottom: 8, transition: "color .35s" };
const th: React.CSSProperties = { textAlign: "left", padding: "14px 18px", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".8px", color: "var(--text-muted)", background: "var(--bg-table-head)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap", transition: "all .5s" };
const td: React.CSSProperties = { padding: "14px 18px", fontSize: 13, color: "var(--text-secondary)", verticalAlign: "middle", whiteSpace: "nowrap", transition: "color .35s" };
