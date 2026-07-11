import { useEffect, useState } from "react";
import api from "../../lib/api";
import Modal from "../../components/Modal";
import { useToast } from "../../components/Toast";
import type { Bodega, Movimiento, SKU } from "../../types";

export default function MovimientosPage() {
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [bodegas, setBodegas] = useState<Bodega[]>([]);
  const [skus, setSkus] = useState<SKU[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [tipoFilter, setTipoFilter] = useState("");
  const [bodegaFilter, setBodegaFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [search, setSearch] = useState("");

  const [form, setForm] = useState({ tipo: "entrada", motivo: "", sku_id: "", bodega_id: "", cantidad: "", costo_unitario: "" });
  const [error, setError] = useState("");
  const toast = useToast();

  const load = async () => {
    const params = new URLSearchParams();
    if (tipoFilter) params.set("tipo", tipoFilter);
    if (bodegaFilter) params.set("bodega_id", bodegaFilter);
    params.set("limit", "500");
    api.get(`/inventario/movimientos?${params}`).then((res) => { setMovimientos(res.data); setLoading(false); });
  };

  useEffect(() => {
    Promise.all([api.get("/inventario/bodegas"), api.get("/skus?limit=500")])
      .then(([bRes, sRes]) => { setBodegas(bRes.data); setSkus(sRes.data); });
    load();
  }, []);

  useEffect(() => { setLoading(true); load(); }, [tipoFilter, bodegaFilter]);

  const filtered = movimientos.filter((m) => {
    if (search && !m.sku_codigo.toLowerCase().includes(search.toLowerCase()) &&
        !m.referencia?.toLowerCase().includes(search.toLowerCase())) return false;
    if (dateFilter && !m.fecha.startsWith(dateFilter)) return false;
    return true;
  });

  const getBodClass = (name: string) => {
    if (name.includes("Central")) return "bc";
    if (name.includes("Materia") || name.includes("Norte")) return "bn";
    return "bs";
  };

  const hoy = new Date().toISOString().split("T")[0];
  const entradasHoy = movimientos.filter((m) => m.tipo === "entrada" && m.fecha.startsWith(hoy)).length;
  const salidasHoy = movimientos.filter((m) => m.tipo === "salida" && m.fecha.startsWith(hoy)).length;
  const costoTotal = filtered.reduce((a, m) => a + (m.costo_total || 0), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    const motivo = form.motivo || undefined;
    try {
      await api.post("/inventario/movimientos", {
        tipo: form.tipo, motivo,
        sku_id: Number(form.sku_id), bodega_id: Number(form.bodega_id),
        cantidad: Number(form.cantidad), costo_unitario: Number(form.costo_unitario) || 0,
      });
      toast.success(`Movimiento de ${form.tipo} registrado`);
      setShowModal(false); load();
    } catch (err: any) { setError(err.response?.data?.detail || "Error al registrar movimiento"); }
  };

  return (
    <div style={{ animation: "fadeInUp .45s ease forwards" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 24, position: "relative", zIndex: 1 }}>
        <div>
          <h1 style={{ fontFamily: "'Space Grotesk'", fontSize: 26, fontWeight: 700, letterSpacing: "-0.5px", color: "var(--text-primary)", margin: 0 }}>Movimientos</h1>
          <p style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 4 }}>Registro de entradas y salidas de inventario</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => { setForm({ tipo: "entrada", motivo: "", sku_id: "", bodega_id: "", cantidad: "", costo_unitario: "" }); setError(""); setShowModal(true); }} style={btnPri}>
            <i className="fas fa-plus" style={{ fontSize: 11 }} /> Nuevo Movimiento
          </button>
        </div>
      </div>

      {!loading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 24, position: "relative", zIndex: 1 }}>
          {[
            { label: "Total Movimientos", val: filtered.length, ic: "fa-arrow-right-arrow-left", s: "s1" },
            { label: "Entradas Hoy", val: entradasHoy, ic: "fa-arrow-down", s: "s2" },
            { label: "Salidas Hoy", val: salidasHoy, ic: "fa-arrow-up", s: "s3" },
            { label: "Costo Total", val: `$${costoTotal.toLocaleString()}`, ic: "fa-coins", s: "s4" },
          ].map((c, i) => (
            <div key={c.label} style={{
              background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--card-radius)",
              padding: 18, display: "flex", alignItems: "center", gap: 14, boxShadow: "var(--card-shadow)",
              animation: `fadeInUp .5s ease forwards`, animationDelay: `${0.05 + i * 0.05}s`, opacity: 0,
            }}>
              <div style={{ width: 42, height: 42, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0,
                background: c.s === "s1" ? "var(--accent-soft)" : c.s === "s2" ? "var(--entrada-bg)" : c.s === "s3" ? "var(--salida-bg)" : "var(--c2-soft)",
                color: c.s === "s1" ? "var(--accent)" : c.s === "s2" ? "var(--entrada)" : c.s === "s3" ? "var(--salida)" : "var(--c2)",
              }}><i className={`fas ${c.ic}`} /></div>
              <div>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".8px", color: "var(--text-muted)", fontWeight: 600, marginBottom: 4 }}>{c.label}</div>
                <div style={{ fontFamily: "'Space Grotesk'", fontSize: 24, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-.5px" }}>{c.val}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, position: "relative", zIndex: 1, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200, maxWidth: 340 }}>
          <i className="fas fa-search" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", fontSize: 13 }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por SKU, motivo..." style={searchInp} />
        </div>
        <select value={tipoFilter} onChange={(e) => setTipoFilter(e.target.value)} style={filterInp}>
          <option value="">Todos los tipos</option>
          <option value="entrada">Entrada</option>
          <option value="salida">Salida</option>
        </select>
        <select value={bodegaFilter} onChange={(e) => setBodegaFilter(e.target.value)} style={filterInp}>
          <option value="">Todas las bodegas</option>
          {bodegas.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
        </select>
        <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} style={{ ...searchInp, maxWidth: 160, paddingLeft: 14, minWidth: 0, flex: "none" }} />
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: "auto", whiteSpace: "nowrap" }}>
          Mostrando <strong style={{ color: "var(--accent)", fontWeight: 700 }}>{filtered.length}</strong> registros
        </div>
      </div>

      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--card-radius)", overflow: "hidden", boxShadow: "var(--card-shadow)", position: "relative", zIndex: 1 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Fecha</th>
              <th style={th}>Tipo</th>
              <th style={th}>Motivo</th>
              <th style={th}>SKU</th>
              <th style={th}>Bodega</th>
              <th style={th}>Cantidad</th>
              <th style={th}>Costo</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ ...td, textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Cargando...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ ...td, textAlign: "center", padding: 50, color: "var(--text-muted)" }}>
                <i className="fas fa-arrow-right-arrow-left" style={{ fontSize: 28, display: "block", marginBottom: 12, opacity: .3 }} />
                No se encontraron movimientos
              </td></tr>
            ) : (
              filtered.map((m) => {
                const isEntrada = m.tipo === "entrada";
                const bc = getBodClass(m.bodega_nombre);
                const d = new Date(m.fecha);
                return (
                  <tr key={m.id} style={{ borderBottom: "1px solid var(--row-border)", transition: "background .15s ease" }}>
                    <td style={td}>
                      <span style={{ fontFamily: "'Space Grotesk'", fontSize: 13, color: "var(--text-primary)", fontWeight: 500 }}>
                        {d.toLocaleDateString("es-CL")}
                        <span style={{ color: "var(--text-muted)", fontWeight: 400, fontSize: 11, marginLeft: 6 }}>
                          {d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </span>
                    </td>
                    <td style={td}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 12px", borderRadius: "var(--badge-radius)", fontSize: 11, fontWeight: 700,
                        background: isEntrada ? "var(--entrada-bg)" : "var(--salida-bg)", color: isEntrada ? "var(--entrada)" : "var(--salida)", minWidth: 95, justifyContent: "center",
                      }}>
                        <span style={{ fontWeight: 800, fontSize: 13 }}>{isEntrada ? "+" : "−"}</span> {isEntrada ? "Entrada" : "Salida"}
                      </span>
                    </td>
                    <td style={td}><span style={{ color: "var(--text-primary)", fontWeight: 500, fontSize: 13, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>{m.motivo ? m.motivo.replace(/_/g, " ") : m.referencia || "—"}</span></td>
                    <td style={td}><span style={{ fontFamily: "'Space Grotesk'", fontWeight: 600, color: "var(--accent)", fontSize: 12.5 }}>{m.sku_codigo}</span></td>
                    <td style={td}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: "var(--badge-radius)", fontSize: 11, fontWeight: 600,
                        background: bc === "bc" ? "var(--bod-c-bg)" : bc === "bn" ? "var(--bod-n-bg)" : "var(--bod-s-bg)",
                        color: bc === "bc" ? "var(--bod-c-t)" : bc === "bn" ? "var(--bod-n-t)" : "var(--bod-s-t)", }}>
                        <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor" }} /> {m.bodega_nombre}
                      </span>
                    </td>
                    <td style={td}>
                      <span style={{ fontFamily: "'Space Grotesk'", fontWeight: 700, fontSize: 14, color: isEntrada ? "var(--entrada)" : "var(--salida)" }}>
                        {isEntrada ? "+" : "−"}{m.cantidad.toLocaleString()}
                      </span>
                    </td>
                    <td style={td}>
                      <span style={{ fontFamily: "'Space Grotesk'", fontWeight: 600, color: "var(--text-primary)", fontSize: 13 }}>
                        ${(m.costo_total || 0).toLocaleString()}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Modal isOpen={showModal} title="Nuevo Movimiento" subtitle="Registrar una entrada o salida de inventario" icon="fa-arrow-right-arrow-left" onClose={() => setShowModal(false)} maxWidth={580}>
        <form onSubmit={handleSubmit}>
          {error && <div style={{ background: "var(--danger-bg)", color: "var(--danger)", padding: "8px 12px", borderRadius: "var(--radius-sm)", marginBottom: 14, fontSize: 13 }}>{error}</div>}
          <div style={{ marginBottom: 20 }}>
            <div style={sectionTitle}><i className="fas fa-arrows-up-down" /> Tipo de Movimiento</div>
            <div style={{ marginBottom: 16 }}>
              <label style={lbl}><i className="fas fa-toggle-on" style={{ fontSize: 11 }} /> Tipo</label>
              <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} style={selInp}>
                <option value="entrada">Entrada (+)</option>
                <option value="salida">Salida (−)</option>
              </select>
            </div>
            <div>
              <label style={lbl}><i className="fas fa-comment" style={{ fontSize: 11 }} /> Motivo</label>
              <input value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} style={inp} placeholder="Ej: Compra a proveedor, Despacho a cliente..." />
            </div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <div style={sectionTitle}><i className="fas fa-box" /> Producto</div>
            <div style={{ marginBottom: 16 }}>
              <label style={lbl}><i className="fas fa-barcode" style={{ fontSize: 11 }} /> SKU</label>
              <select value={form.sku_id} onChange={(e) => setForm({ ...form, sku_id: e.target.value })} style={selInp} required>
                <option value="">Seleccionar...</option>
                {skus.map((s) => <option key={s.id} value={s.id}>{s.codigo_sku} — {s.descripcion}</option>)}
              </select>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <label style={lbl}><i className="fas fa-cubes" style={{ fontSize: 11 }} /> Cantidad</label>
                <input type="number" min="0.01" step="0.01" value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: e.target.value })} style={inp} placeholder="0" required />
              </div>
              <div>
                <label style={lbl}><i className="fas fa-dollar-sign" style={{ fontSize: 11 }} /> Costo Unitario</label>
                <input type="number" min="0" step="0.01" value={form.costo_unitario} onChange={(e) => setForm({ ...form, costo_unitario: e.target.value })} style={inp} placeholder="0.00" />
              </div>
            </div>
          </div>
          <div style={{ marginBottom: 8 }}>
            <div style={sectionTitle}><i className="fas fa-warehouse" /> Destino</div>
            <div>
              <label style={lbl}><i className="fas fa-location-dot" style={{ fontSize: 11 }} /> Bodega</label>
              <select value={form.bodega_id} onChange={(e) => setForm({ ...form, bodega_id: e.target.value })} style={selInp} required>
                <option value="">Seleccionar...</option>
                {bodegas.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 0 6px", borderTop: "1px solid var(--m-divider)" }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 5 }}>
              <i className="fas fa-circle-info" style={{ fontSize: 10, color: "var(--accent)" }} /> El costo total se calcula automáticamente
            </span>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" onClick={() => setShowModal(false)} style={btnGhost}>Cancelar</button>
              <button type="submit" style={btnPri}><i className="fas fa-check" style={{ fontSize: 11 }} /> Registrar Movimiento</button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}

const btnPri: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none", color: "#fff", fontFamily: "inherit", background: "linear-gradient(135deg, var(--accent-grad-start), var(--accent-grad-end))", boxShadow: "0 4px 16px var(--accent-glow)", transition: "all .25s ease" };
const btnGhost: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", fontFamily: "inherit", transition: "all .3s ease" };
const searchInp: React.CSSProperties = { width: "100%", padding: "10px 14px 10px 40px", borderRadius: 8, border: "1px solid var(--input-border)", background: "var(--input-bg)", color: "var(--text-primary)", fontSize: 13, fontFamily: "inherit", outline: "none", transition: "all .25s ease" };
const filterInp: React.CSSProperties = { padding: "10px 36px 10px 14px", borderRadius: 8, border: "1px solid var(--input-border)", background: "var(--input-bg)", color: "var(--text-primary)", fontSize: 13, fontFamily: "inherit", outline: "none", cursor: "pointer", transition: "all .25s ease", appearance: "none", WebkitAppearance: "none" };
const inp: React.CSSProperties = { width: "100%", padding: "11px 14px", borderRadius: 10, border: "1.5px solid var(--m-input-border)", background: "var(--m-input-bg)", color: "var(--text-primary)", fontSize: 13.5, fontFamily: "inherit", outline: "none", boxSizing: "border-box", transition: "all .25s ease" };
const selInp: React.CSSProperties = { width: "100%", padding: "11px 36px 11px 14px", borderRadius: 10, border: "1.5px solid var(--m-input-border)", background: "var(--m-input-bg)", color: "var(--text-primary)", fontSize: 13.5, fontFamily: "inherit", outline: "none", cursor: "pointer", appearance: "none", WebkitAppearance: "none", boxSizing: "border-box", transition: "all .25s ease" };
const lbl: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".7px", color: "var(--m-label)", marginBottom: 7 };
const sectionTitle: React.CSSProperties = { fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px", color: "var(--m-label)", marginBottom: 14, paddingBottom: 8, borderBottom: "1px solid var(--m-divider)", display: "flex", alignItems: "center", gap: 8 };
const th: React.CSSProperties = { textAlign: "left", padding: "13px 16px", fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".8px", color: "var(--text-muted)", background: "var(--bg-table-head)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "13px 16px", fontSize: 13, color: "var(--text-secondary)", verticalAlign: "middle", whiteSpace: "nowrap" };
