import { useEffect, useState } from "react";
import api from "../../lib/api";
import Modal from "../../components/Modal";
import { useToast } from "../../components/Toast";
import type { Bodega, StockItem } from "../../types";

type AccionTipo = "entrada" | "ajuste" | "transfer";

export default function StockPage() {
  const [stock, setStock] = useState<StockItem[]>([]);
  const [bodegas, setBodegas] = useState<Bodega[]>([]);
  const [bodegaFilter, setBodegaFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  // Acción rápida sobre una fila de stock (entrada / ajuste / transferencia).
  const [accion, setAccion] = useState<{ tipo: AccionTipo; row: StockItem } | null>(null);
  const [acCantidad, setAcCantidad] = useState("");
  const [acCosto, setAcCosto] = useState("");
  const [acMotivo, setAcMotivo] = useState("compra");
  const [acDestino, setAcDestino] = useState("");
  const [acError, setAcError] = useState("");
  const [acLoading, setAcLoading] = useState(false);

  const load = () => {
    const params = new URLSearchParams();
    if (bodegaFilter) params.set("bodega_id", bodegaFilter);
    params.set("limit", "500");
    api.get(`/inventario/stock?${params}`).then((res) => { setStock(res.data); setLoading(false); });
  };

  useEffect(() => { api.get("/inventario/bodegas").then((r) => setBodegas(r.data)); }, []);
  useEffect(() => { setLoading(true); load(); }, [bodegaFilter]);

  const abrirAccion = (tipo: AccionTipo, row: StockItem) => {
    setAccion({ tipo, row });
    setAcCantidad(tipo === "ajuste" ? String(row.cantidad) : "");
    setAcCosto("0");
    setAcMotivo(tipo === "entrada" ? "compra" : "ajuste");
    setAcDestino("");
    setAcError("");
  };

  const ejecutarAccion = async () => {
    if (!accion) return;
    const { tipo, row } = accion;
    const cant = Number(acCantidad);
    setAcError("");
    try {
      setAcLoading(true);
      if (tipo === "entrada") {
        if (cant <= 0) { setAcError("Cantidad debe ser mayor a 0"); setAcLoading(false); return; }
        await api.post("/inventario/movimientos", { tipo: "entrada", motivo: acMotivo, sku_id: row.sku_id, bodega_id: row.bodega_id, cantidad: cant, costo_unitario: Number(acCosto) || 0 });
        toast.success(`Entrada de ${cant} registrada`);
      } else if (tipo === "ajuste") {
        const diff = cant - row.cantidad;
        if (diff === 0) { setAcError("La cantidad es igual al stock actual"); setAcLoading(false); return; }
        await api.post("/inventario/movimientos", { tipo: diff > 0 ? "entrada" : "salida", motivo: "ajuste", sku_id: row.sku_id, bodega_id: row.bodega_id, cantidad: Math.abs(diff), costo_unitario: 0 });
        toast.success(`Ajuste aplicado (${diff > 0 ? "+" : ""}${diff})`);
      } else {
        if (cant <= 0) { setAcError("Cantidad debe ser mayor a 0"); setAcLoading(false); return; }
        if (!acDestino) { setAcError("Selecciona la bodega destino"); setAcLoading(false); return; }
        await api.post("/inventario/transferencias", { sku_id: row.sku_id, bodega_origen_id: row.bodega_id, bodega_destino_id: Number(acDestino), cantidad: cant });
        toast.success("Transferencia completada");
      }
      setAccion(null); load();
    } catch (err: any) {
      setAcError(err.response?.data?.detail || "Error al ejecutar la acción");
    } finally { setAcLoading(false); }
  };

  const getLevel = (s: StockItem) => {
    if (s.cantidad === 0) return "low";
    if (s.cantidad_minima && s.cantidad <= s.cantidad_minima) return "warn";
    return "ok";
  };

  const filtered = stock.filter((s) => {
    if (search && !s.sku_codigo.toLowerCase().includes(search.toLowerCase()) &&
        !s.sku_descripcion.toLowerCase().includes(search.toLowerCase()) &&
        !(s.lote_numero || "").toLowerCase().includes(search.toLowerCase())) return false;
    if (levelFilter && getLevel(s) !== levelFilter) return false;
    return true;
  });

  const getBodClass = (name: string) => {
    if (name.includes("Central")) return "bc";
    if (name.includes("Materia") || name.includes("Norte")) return "bn";
    return "bs";
  };

  const totalRegistros = filtered.length;
  const totalStock = filtered.reduce((a, s) => a + s.cantidad, 0);
  const totalDisp = filtered.reduce((a, s) => a + s.cantidad_disponible, 0);
  const totalReserv = filtered.reduce((a, s) => a + s.cantidad_reservada, 0);
  const lowItems = filtered.filter(s => getLevel(s) !== "ok").length;

  return (
    <div style={{ animation: "fadeInUp .45s ease forwards" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 24, position: "relative", zIndex: 1 }}>
        <div>
          <h1 style={{ fontFamily: "'Space Grotesk'", fontSize: 26, fontWeight: 700, letterSpacing: "-0.5px", color: "var(--text-primary)", margin: 0 }}>Stock</h1>
          <p style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 4 }}>Detalle de existencias por lote, bodega y disponibilidad</p>
        </div>
      </div>

      {!loading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14, marginBottom: 24, position: "relative", zIndex: 1 }}>
          {[
            { label: "Registros", val: totalRegistros, icon: "fa-list", s: "s1" },
            { label: "Stock Total", val: totalStock.toLocaleString(), icon: "fa-cubes", s: "s2" },
            { label: "Disponible", val: totalDisp.toLocaleString(), icon: "fa-box-open", s: "s5" },
            { label: "Reservado", val: totalReserv.toLocaleString(), icon: "fa-lock", s: "s4" },
            { label: "Stock Bajo", val: lowItems, icon: "fa-triangle-exclamation", s: "s3" },
          ].map((c, i) => (
            <div key={c.label} style={{
              background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--card-radius)",
              padding: 18, position: "relative", overflow: "hidden", boxShadow: "var(--card-shadow)",
              animation: `fadeInUp .5s ease forwards`, animationDelay: `${0.05 + i * 0.05}s`, opacity: 0,
            }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(90deg, var(--accent), transparent)", opacity: 0, transition: "opacity .3s", display: "var(--stat-line)" }} />
              <div style={{ width: 40, height: 40, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, marginBottom: 12,
                background: c.s === "s1" ? "var(--accent-soft)" : c.s === "s2" ? "var(--c3-soft)" : c.s === "s3" ? "var(--c4-soft)" : c.s === "s4" ? "var(--c2-soft)" : "var(--c5-soft)",
                color: c.s === "s1" ? "var(--accent)" : c.s === "s2" ? "var(--c3)" : c.s === "s3" ? "var(--c4)" : c.s === "s4" ? "var(--c2)" : "var(--c5)",
              }}><i className={`fas ${c.icon}`} /></div>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".8px", color: "var(--text-muted)", fontWeight: 600, marginBottom: 6 }}>{c.label}</div>
              <div style={{ fontFamily: "'Space Grotesk'", fontSize: 24, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-.5px" }}>{c.val}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, position: "relative", zIndex: 1, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 220, maxWidth: 360 }}>
          <i className="fas fa-search" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", fontSize: 13 }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por código, descripción o lote..." style={searchInp} />
        </div>
        <select value={bodegaFilter} onChange={(e) => setBodegaFilter(e.target.value)} style={filterInp}>
          <option value="">Todas las bodegas</option>
          {bodegas.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
        </select>
        <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} style={filterInp}>
          <option value="">Todos los niveles</option>
          <option value="ok">Stock normal</option>
          <option value="warn">Stock bajo</option>
          <option value="low">Sin stock</option>
        </select>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: "auto", whiteSpace: "nowrap" }}>
          Mostrando <strong style={{ color: "var(--accent)", fontWeight: 700 }}>{filtered.length}</strong> registros
        </div>
      </div>

      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--card-radius)", overflow: "hidden", boxShadow: "var(--card-shadow)", position: "relative", zIndex: 1 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Código</th>
              <th style={th}>Descripción</th>
              <th style={th}>Lote</th>
              <th style={th}>Bodega</th>
              <th style={th}>Stock</th>
              <th style={th}>Nivel</th>
              <th style={{ ...th, textAlign: "right" }}>Disponible</th>
              <th style={{ ...th, textAlign: "right" }}>Reservado</th>
              <th style={{ ...th, width: 120 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ ...td, textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Cargando...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} style={{ ...td, textAlign: "center", padding: 50, color: "var(--text-muted)" }}>
                <i className="fas fa-cubes" style={{ fontSize: 28, display: "block", marginBottom: 12, opacity: .3 }} />
                No se encontraron registros con los filtros aplicados
              </td></tr>
            ) : (
              filtered.map((s) => {
                const lv = getLevel(s);
                const bc = getBodClass(s.bodega_nombre);
                const barPct = s.cantidad_minima && s.cantidad_minima > 0
                  ? Math.min((s.cantidad / (s.cantidad_minima * 3)) * 100, 100)
                  : (s.cantidad > 0 ? 100 : 0);
                return (
                  <tr key={s.id} style={{ borderBottom: "1px solid var(--row-border)", transition: "background .15s ease" }}>
                    <td style={td}><span style={{ fontFamily: "'Space Grotesk'", fontWeight: 600, color: "var(--accent)", fontSize: 12.5 }}>{s.sku_codigo}</span></td>
                    <td style={td}><span style={{ color: "var(--text-primary)", fontWeight: 500, fontSize: 13, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>{s.sku_descripcion}</span></td>
                    <td style={td}>{s.lote_numero ? <span style={{ fontFamily: "'Space Grotesk'", fontSize: 12, color: "var(--text-muted)", background: "var(--stat-icon-bg)", padding: "3px 8px", borderRadius: 4 }}>{s.lote_numero}</span> : <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                    <td style={td}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: "var(--badge-radius)", fontSize: 11, fontWeight: 600,
                        background: bc === "bc" ? "var(--bod-c-bg)" : bc === "bn" ? "var(--bod-n-bg)" : "var(--bod-s-bg)",
                        color: bc === "bc" ? "var(--bod-c-t)" : bc === "bn" ? "var(--bod-n-t)" : "var(--bod-s-t)", }}>
                        <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor" }} /> {s.bodega_nombre}
                      </span>
                    </td>
                    <td style={td}>
                      <div style={{ fontFamily: "'Space Grotesk'", fontWeight: 700, fontSize: 14,
                        color: lv === "low" ? "var(--stock-low)" : lv === "warn" ? "var(--stock-warn)" : "var(--stock-ok)",
                      }}>{s.cantidad.toLocaleString()}</div>
                      <div style={{ width: 50, height: 4, background: "rgba(128,128,128,0.1)", borderRadius: 2, marginTop: 4, overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: 2, width: `${Math.max(barPct, 2)}%`,
                          background: lv === "low" ? "var(--stock-low)" : lv === "warn" ? "var(--stock-warn)" : "var(--stock-ok)",
                        }} />
                      </div>
                    </td>
                    <td style={td}>
                      <span style={{ fontFamily: "'Space Grotesk'", fontWeight: 700, fontSize: 14,
                        color: lv === "low" ? "var(--stock-low)" : lv === "warn" ? "var(--stock-warn)" : "var(--stock-ok)",
                      }}>{lv === "low" ? "Sin stock" : lv === "warn" ? "Bajo" : "Normal"}</span>
                    </td>
                    <td style={{ ...td, textAlign: "right", fontFamily: "'Space Grotesk'", fontWeight: 600, color: "var(--text-secondary)", fontSize: 13 }}>{s.cantidad_disponible.toLocaleString()}</td>
                    <td style={{ ...td, textAlign: "right", fontFamily: "'Space Grotesk'", fontWeight: 500, color: "var(--text-muted)", fontSize: 12 }}>{s.cantidad_reservada.toLocaleString()}</td>
                    <td style={td}>
                      <div className="row-actions" style={{ display: "flex", gap: 4, opacity: 0, transition: "opacity .2s" }}>
                        <button onClick={() => abrirAccion("entrada", s)} style={acBtn} title="Entrada rápida"><i className="fas fa-arrow-down" style={{ fontSize: 10 }} /></button>
                        <button onClick={() => abrirAccion("ajuste", s)} style={acBtn} title="Ajustar cantidad"><i className="fas fa-scale-balanced" style={{ fontSize: 10 }} /></button>
                        <button onClick={() => abrirAccion("transfer", s)} style={acBtn} title="Transferir"><i className="fas fa-right-left" style={{ fontSize: 10 }} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <style>{`table tbody tr:hover .row-actions { opacity: 1 !important; } table tbody tr:hover { background: var(--bg-table-row-hover); }`}</style>

      {accion && (
        <Modal
          isOpen={!!accion}
          title={accion.tipo === "entrada" ? "Entrada rápida" : accion.tipo === "ajuste" ? "Ajustar cantidad" : "Transferir stock"}
          subtitle={`${accion.row.sku_codigo} — ${accion.row.bodega_nombre} (actual: ${accion.row.cantidad.toLocaleString()})`}
          icon={accion.tipo === "entrada" ? "fa-arrow-down" : accion.tipo === "ajuste" ? "fa-scale-balanced" : "fa-right-left"}
          onClose={() => setAccion(null)}
          maxWidth={460}
        >
          <div>
            {acError && <div style={{ background: "var(--danger-bg)", color: "var(--danger)", padding: "8px 12px", borderRadius: 8, marginBottom: 14, fontSize: 13 }}>{acError}</div>}

            {accion.tipo === "entrada" && (
              <div style={{ marginBottom: 14 }}>
                <label style={mlbl}>Motivo</label>
                <select value={acMotivo} onChange={(e) => setAcMotivo(e.target.value)} style={msel}>
                  <option value="compra">Compra</option>
                  <option value="devolucion_cliente">Devolución de cliente</option>
                  <option value="stock_inicial">Stock inicial</option>
                  <option value="ajuste">Ajuste (+)</option>
                </select>
              </div>
            )}

            {accion.tipo === "transfer" && (
              <div style={{ marginBottom: 14 }}>
                <label style={mlbl}>Bodega destino</label>
                <select value={acDestino} onChange={(e) => setAcDestino(e.target.value)} style={msel}>
                  <option value="">Seleccionar...</option>
                  {bodegas.filter((b) => b.id !== accion.row.bodega_id).map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
                </select>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: accion.tipo === "entrada" ? "1fr 1fr" : "1fr", gap: 14, marginBottom: 20 }}>
              <div>
                <label style={mlbl}>{accion.tipo === "ajuste" ? "Cantidad real (contada)" : "Cantidad"}</label>
                <input type="number" min="0" step="0.01" value={acCantidad} onChange={(e) => setAcCantidad(e.target.value)} style={minp} autoFocus />
              </div>
              {accion.tipo === "entrada" && (
                <div>
                  <label style={mlbl}>Costo unitario</label>
                  <input type="number" min="0" step="0.01" value={acCosto} onChange={(e) => setAcCosto(e.target.value)} style={minp} />
                </div>
              )}
            </div>

            {accion.tipo === "ajuste" && (
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16, marginTop: -6 }}>
                Diferencia: <strong style={{ color: "var(--text-secondary)" }}>{(Number(acCantidad || 0) - accion.row.cantidad) >= 0 ? "+" : ""}{(Number(acCantidad || 0) - accion.row.cantidad).toLocaleString()}</strong> — se registra como movimiento de ajuste.
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 14, borderTop: "1px solid var(--m-divider)" }}>
              <button onClick={() => setAccion(null)} style={mbtnGhost}>Cancelar</button>
              <button onClick={ejecutarAccion} disabled={acLoading} style={{ ...mbtnPri, opacity: acLoading ? 0.6 : 1 }}>
                <i className="fas fa-check" style={{ fontSize: 11 }} /> Confirmar
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

const acBtn: React.CSSProperties = { width: 28, height: 28, borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 11, transition: "all .2s" };
const mlbl: React.CSSProperties = { display: "block", fontSize: 11.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".7px", color: "var(--m-label)", marginBottom: 7 };
const minp: React.CSSProperties = { width: "100%", padding: "11px 14px", borderRadius: 10, border: "1.5px solid var(--m-input-border)", background: "var(--m-input-bg)", color: "var(--text-primary)", fontSize: 13.5, fontFamily: "inherit", outline: "none", boxSizing: "border-box" };
const msel: React.CSSProperties = { ...minp, cursor: "pointer", appearance: "none", WebkitAppearance: "none" };
const mbtnPri: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none", color: "#fff", fontFamily: "inherit", background: "linear-gradient(135deg, var(--accent-grad-start), var(--accent-grad-end))", boxShadow: "0 4px 16px var(--accent-glow)" };
const mbtnGhost: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", fontFamily: "inherit" };

const searchInp: React.CSSProperties = { width: "100%", padding: "10px 14px 10px 40px", borderRadius: 8, border: "1px solid var(--input-border)", background: "var(--input-bg)", color: "var(--text-primary)", fontSize: 13, fontFamily: "inherit", outline: "none", transition: "all .25s ease" };
const filterInp: React.CSSProperties = { padding: "10px 36px 10px 14px", borderRadius: 8, border: "1px solid var(--input-border)", background: "var(--input-bg)", color: "var(--text-primary)", fontSize: 13, fontFamily: "inherit", outline: "none", cursor: "pointer", transition: "all .25s ease", appearance: "none", WebkitAppearance: "none" };
const th: React.CSSProperties = { textAlign: "left", padding: "13px 16px", fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".8px", color: "var(--text-muted)", background: "var(--bg-table-head)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "13px 16px", fontSize: 13, color: "var(--text-secondary)", verticalAlign: "middle", whiteSpace: "nowrap" };
