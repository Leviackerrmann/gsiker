import { useEffect, useState } from "react";
import api from "../../lib/api";
import Modal from "../../components/Modal";
import Badge from "../../components/Badge";
import { useToast } from "../../components/Toast";
import type { Bodega, StockItem } from "../../types";

export default function BodegasPage() {
  const [bodegas, setBodegas] = useState<Bodega[]>([]);
  const [stockData, setStockData] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Bodega | null>(null);
  const [form, setForm] = useState({ nombre: "", ubicacion: "", capacidad: "", encargado: "", notas: "" });
  const [error, setError] = useState("");
  const toast = useToast();

  const load = async () => {
    const bRes = await api.get("/inventario/bodegas");
    setBodegas(bRes.data);
    api.get("/inventario/stock?limit=500").then(sRes => setStockData(sRes.data)).catch(() => {});
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const getStockPorBodega = (bodegaId: number) =>
    stockData.filter(s => s.bodega_id === bodegaId).reduce((a, s) => a + s.cantidad, 0);

  const getSkusPorBodega = (bodegaId: number) =>
    new Set(stockData.filter(s => s.bodega_id === bodegaId).map(s => s.sku_id)).size;

  const totalUnidades = stockData.reduce((a, s) => a + s.cantidad, 0);
  const activas = bodegas.filter(b => b.activa).length;
  const inactivas = bodegas.filter(b => !b.activa).length;

  const openCreate = () => { setForm({ nombre: "", ubicacion: "", capacidad: "", encargado: "", notas: "" }); setEditing(null); setError(""); setShowModal(true); };

  const openEdit = (b: Bodega) => {
    setForm({ nombre: b.nombre, ubicacion: b.ubicacion || "", capacidad: b.capacidad?.toString() || "", encargado: b.encargado || "", notas: b.notas || "" });
    setEditing(b); setError(""); setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    const body = {
      nombre: form.nombre, ubicacion: form.ubicacion || null,
      capacidad: form.capacidad ? Number(form.capacidad) : null,
      encargado: form.encargado || null, notas: form.notas || null,
    };
    try {
      if (editing) {
        await api.put(`/inventario/bodegas/${editing.id}`, body);
        toast.success(`Bodega "${form.nombre}" actualizada`);
      } else {
        await api.post("/inventario/bodegas", body);
        toast.success(`Bodega "${form.nombre}" creada`);
      }
      setShowModal(false); load();
    } catch (err: any) { setError(err.response?.data?.detail || "Error al guardar"); }
  };

  const toggleBodega = async (b: Bodega) => {
    await api.put(`/inventario/bodegas/${b.id}`, { activa: !b.activa });
    toast.success(`Bodega "${b.nombre}" ${b.activa ? "desactivada" : "activada"}`);
    load();
  };

  return (
    <div style={{ animation: "fadeInUp .45s ease forwards" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 24, position: "relative", zIndex: 1 }}>
        <div>
          <h1 style={{ fontFamily: "'Space Grotesk'", fontSize: 26, fontWeight: 700, letterSpacing: "-0.5px", color: "var(--text-primary)", margin: 0 }}>Bodegas</h1>
          <p style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 4 }}>Gestión de ubicaciones y almacenamiento del inventario</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={openCreate} style={btnPri}><i className="fas fa-plus" style={{ fontSize: 11 }} /> Nueva Bodega</button>
        </div>
      </div>

      {!loading && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 24, position: "relative", zIndex: 1 }}>
            {[
              { label: "Total Bodegas", val: bodegas.length, icon: "fa-warehouse", s: "s1" },
              { label: "Activas", val: activas, icon: "fa-circle-check", s: "s2" },
              { label: "Inactivas", val: inactivas, icon: "fa-circle-xmark", s: "s3" },
              { label: "Unidades Totales", val: totalUnidades.toLocaleString(), icon: "fa-boxes-stacked", s: "s4" },
            ].map((c, i) => (
              <div key={c.label} style={{
                background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--card-radius)",
                padding: 18, display: "flex", alignItems: "center", gap: 14, boxShadow: "var(--card-shadow)",
                animation: `fadeInUp .5s ease forwards`, animationDelay: `${0.05 + i * 0.05}s`, opacity: 0,
              }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0,
                  background: c.s === "s1" ? "var(--accent-soft)" : c.s === "s2" ? "var(--c3-soft)" : c.s === "s3" ? "var(--c4-soft)" : "var(--c5-soft)",
                  color: c.s === "s1" ? "var(--accent)" : c.s === "s2" ? "var(--c3)" : c.s === "s3" ? "var(--c4)" : "var(--c5)",
                }}>
                  <i className={`fas ${c.icon}`} />
                </div>
                <div>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".8px", color: "var(--text-muted)", fontWeight: 600, marginBottom: 4 }}>{c.label}</div>
                  <div style={{ fontFamily: "'Space Grotesk'", fontSize: 24, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-.5px" }}>{c.val}</div>
                </div>
              </div>
            ))}
          </div>

          {bodegas.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16, marginBottom: 24, position: "relative", zIndex: 1 }}>
              {bodegas.map((b, i) => {
                const stock = getStockPorBodega(b.id);
                const skus = getSkusPorBodega(b.id);
                const pctCap = b.capacidad && b.capacidad > 0 ? Math.round((stock / b.capacidad) * 100) : 0;
                return (
                  <div key={b.id} style={{
                    background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--card-radius)",
                    padding: 22, boxShadow: "var(--card-shadow)", position: "relative", overflow: "hidden",
                    animation: `fadeInUp .5s ease forwards`, animationDelay: `${0.25 + i * 0.05}s`, opacity: 0,
                  }}>
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, borderRadius: "var(--card-radius) var(--card-radius) 0 0", background: b.activa ? "var(--c3)" : "var(--c4)" }} />
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
                      <div style={{ width: 42, height: 42, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
                        background: b.activa ? "var(--c3-soft)" : "var(--c4-soft)", color: b.activa ? "var(--c3)" : "var(--c4)",
                      }}><i className="fas fa-warehouse" /></div>
                    </div>
                    <div style={{ fontFamily: "'Space Grotesk'", fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>{b.nombre}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 5, marginBottom: 16 }}>
                      <i className="fas fa-location-dot" style={{ fontSize: 11 }} /> {b.ubicacion || "Sin ubicación"}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div style={{ background: "var(--stat-icon-bg)", borderRadius: 8, padding: "10px 12px" }}>
                        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".6px", color: "var(--text-muted)", fontWeight: 600, marginBottom: 4 }}>Stock Actual</div>
                        <div style={{ fontFamily: "'Space Grotesk'", fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>{stock.toLocaleString()}</div>
                      </div>
                      <div style={{ background: "var(--stat-icon-bg)", borderRadius: 8, padding: "10px 12px" }}>
                        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".6px", color: "var(--text-muted)", fontWeight: 600, marginBottom: 4 }}>Ocupación</div>
                        <div style={{ fontFamily: "'Space Grotesk'", fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
                          {b.capacidad && b.capacidad > 0 ? `${pctCap}%` : "—"}
                        </div>
                      </div>
                      <div style={{ background: "var(--stat-icon-bg)", borderRadius: 8, padding: "10px 12px" }}>
                        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".6px", color: "var(--text-muted)", fontWeight: 600, marginBottom: 4 }}>SKUs</div>
                        <div style={{ fontFamily: "'Space Grotesk'", fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>{skus}</div>
                      </div>
                      <div style={{ background: "var(--stat-icon-bg)", borderRadius: 8, padding: "10px 12px" }}>
                        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".6px", color: "var(--text-muted)", fontWeight: 600, marginBottom: 4 }}>Capacidad</div>
                        <div style={{ fontFamily: "'Space Grotesk'", fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
                          {b.capacidad ? b.capacidad.toLocaleString() : "—"}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--card-radius)", overflow: "hidden", boxShadow: "var(--card-shadow)", position: "relative", zIndex: 1 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Nombre</th>
              <th style={th}>Ubicación</th>
              <th style={th}>Estado</th>
              <th style={th}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} style={{ ...td, textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Cargando...</td></tr>
            ) : bodegas.length === 0 ? (
              <tr><td colSpan={4} style={{ ...td, textAlign: "center", padding: 50, color: "var(--text-muted)" }}>
                <i className="fas fa-warehouse" style={{ fontSize: 28, display: "block", marginBottom: 12, opacity: .3 }} />
                No hay bodegas registradas
              </td></tr>
            ) : (
              bodegas.map((b) => (
                <tr key={b.id} style={{ borderBottom: "1px solid var(--row-border)", transition: "background .15s ease" }}>
                  <td style={td}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0,
                        background: b.activa ? "var(--c3-soft)" : "var(--c4-soft)", color: b.activa ? "var(--c3)" : "var(--c4)",
                      }}><i className="fas fa-warehouse" /></div>
                      <div style={{ fontFamily: "'Space Grotesk'", fontWeight: 600, color: "var(--text-primary)", fontSize: 14 }}>{b.nombre}</div>
                    </div>
                  </td>
                  <td style={td}><div style={{ color: "var(--text-muted)", fontSize: 12.5, display: "flex", alignItems: "center", gap: 5 }}><i className="fas fa-location-dot" style={{ fontSize: 11 }} /> {b.ubicacion || "—"}</div></td>
                  <td style={td}><Badge color={b.activa ? "success" : "danger"}>{b.activa ? "Activa" : "Inactiva"}</Badge></td>
                  <td style={td}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => openEdit(b)} style={rowBtn}><i className="fas fa-pen" style={{ fontSize: 10 }} /> Editar</button>
                      <button onClick={() => toggleBodega(b)} style={{ ...rowBtn, color: b.activa ? "var(--c4)" : "var(--c3)" }}>
                        <i className={`fas fa-toggle-${b.activa ? "on" : "off"}`} style={{ fontSize: 11 }} /> {b.activa ? "Desactivar" : "Activar"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal isOpen={showModal} title={editing ? "Editar Bodega" : "Nueva Bodega"} onClose={() => setShowModal(false)} maxWidth={520}>
        <form onSubmit={handleSubmit}>
          {error && <div style={{ background: "var(--danger-bg)", color: "var(--danger)", padding: "8px 12px", borderRadius: "var(--radius-sm)", marginBottom: 14, fontSize: 13 }}>{error}</div>}
          <div style={{ marginBottom: 18 }}>
            <label style={lbl}>Nombre</label>
            <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} style={inp} required placeholder="Ej: Bodega Central" autoFocus />
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={lbl}>Ubicación</label>
            <input value={form.ubicacion} onChange={(e) => setForm({ ...form, ubicacion: e.target.value })} style={inp} required placeholder="Ej: Av. Principal #100" />
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={lbl}>Capacidad Máxima (unidades)</label>
            <input type="number" min="0" value={form.capacidad} onChange={(e) => setForm({ ...form, capacidad: e.target.value })} style={inp} placeholder="0" />
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={lbl}>Encargado</label>
            <input value={form.encargado} onChange={(e) => setForm({ ...form, encargado: e.target.value })} style={inp} placeholder="Nombre del responsable" />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={lbl}>Notas</label>
            <input value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} style={inp} placeholder="Observaciones adicionales (opcional)" />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
            <button type="button" onClick={() => setShowModal(false)} style={btnGhost}>Cancelar</button>
            <button type="submit" style={btnPri}><i className="fas fa-check" style={{ fontSize: 11 }} /> {editing ? "Guardar cambios" : "Crear Bodega"}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

const btnPri: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none", color: "#fff", fontFamily: "inherit", background: "linear-gradient(135deg, var(--accent-grad-start), var(--accent-grad-end))", boxShadow: "0 4px 16px var(--accent-glow)", transition: "all .25s ease" };
const btnGhost: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", fontFamily: "inherit", transition: "all .3s ease" };
const rowBtn: React.CSSProperties = { padding: "6px 14px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 12, fontWeight: 500, fontFamily: "inherit", transition: "all .2s", whiteSpace: "nowrap" };
const inp: React.CSSProperties = { width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid var(--input-border)", background: "var(--input-bg)", color: "var(--text-primary)", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", transition: "all .25s ease" };
const lbl: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".8px", color: "var(--text-muted)", marginBottom: 8 };
const th: React.CSSProperties = { textAlign: "left", padding: "14px 20px", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".8px", color: "var(--text-muted)", background: "var(--bg-table-head)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "16px 20px", fontSize: 13, color: "var(--text-secondary)", verticalAlign: "middle", whiteSpace: "nowrap" };
