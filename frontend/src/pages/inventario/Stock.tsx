import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import api from "../../lib/api";
import { useToast } from "../../components/Toast";
import { useAuth } from "../../contexts/AuthContext";
import type { Bodega, StockItem } from "../../types";

type AccionTipo = "entrada" | "salida" | "ajuste" | "transfer" | "config";

const ACCIONES: { tipo: AccionTipo; label: string; icon: string; adminOnly?: boolean }[] = [
  { tipo: "entrada", label: "Entrada", icon: "fa-arrow-down" },
  { tipo: "salida", label: "Salida", icon: "fa-arrow-up" },
  { tipo: "ajuste", label: "Ajustar", icon: "fa-scale-balanced" },
  { tipo: "transfer", label: "Transferir", icon: "fa-right-left" },
  { tipo: "config", label: "Mín/Máx", icon: "fa-sliders", adminOnly: true },
];

function fmtNum(n: number): string {
  return Number(n).toLocaleString("es-GT", { maximumFractionDigits: 2 });
}
function fmtFechaHora(s: string): string {
  return new Date(s).toLocaleString("es-GT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function StockPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [stock, setStock] = useState<StockItem[]>([]);
  const [bodegas, setBodegas] = useState<Bodega[]>([]);
  // Puede llegar prefiltrado por bodega desde el módulo Bodegas (?bodega=ID).
  const [bodegaFilter, setBodegaFilter] = useState(searchParams.get("bodega") || "");
  const [levelFilter, setLevelFilter] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const { user } = useAuth();
  const esAdmin = user?.rol === "admin";

  // Drawer de detalle + acción inline seleccionada.
  const [detail, setDetail] = useState<StockItem | null>(null);
  const [accionTipo, setAccionTipo] = useState<AccionTipo | null>(null);
  const [acCantidad, setAcCantidad] = useState("");
  const [acCosto, setAcCosto] = useState("");
  const [acMotivo, setAcMotivo] = useState("compra");
  const [acDestino, setAcDestino] = useState("");
  const [acMin, setAcMin] = useState("");
  const [acMax, setAcMax] = useState("");
  const [acError, setAcError] = useState("");
  const [acLoading, setAcLoading] = useState(false);

  const load = async (): Promise<StockItem[]> => {
    const params = new URLSearchParams();
    if (bodegaFilter) params.set("bodega_id", bodegaFilter);
    params.set("limit", "500");
    const res = await api.get(`/inventario/stock?${params}`);
    setStock(res.data);
    setLoading(false);
    return res.data;
  };

  useEffect(() => { api.get("/inventario/bodegas").then((r) => setBodegas(r.data)); }, []);
  useEffect(() => { setLoading(true); load(); }, [bodegaFilter]);

  // Escape + bloqueo de scroll mientras el drawer está abierto.
  useEffect(() => {
    if (!detail) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") cerrarDetalle(); };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", onKey); };
  }, [detail]);

  const abrirDetalle = (row: StockItem) => { setDetail(row); setAccionTipo(null); setAcError(""); };
  const cerrarDetalle = () => { setDetail(null); setAccionTipo(null); };

  const abrirAccion = (tipo: AccionTipo) => {
    if (!detail) return;
    setAccionTipo(tipo);
    setAcCantidad(tipo === "ajuste" ? String(detail.cantidad) : "");
    setAcCosto("0");
    setAcMotivo(tipo === "entrada" ? "compra" : tipo === "salida" ? "merma" : "ajuste");
    setAcDestino("");
    setAcMin(detail.cantidad_minima != null ? String(detail.cantidad_minima) : "");
    setAcMax(detail.cantidad_maxima != null ? String(detail.cantidad_maxima) : "");
    setAcError("");
  };

  const ejecutarAccion = async () => {
    if (!detail || !accionTipo) return;
    const row = detail;
    const cant = Number(acCantidad);
    setAcError("");
    try {
      setAcLoading(true);
      if (accionTipo === "entrada") {
        if (cant <= 0) { setAcError("Cantidad debe ser mayor a 0"); setAcLoading(false); return; }
        await api.post("/inventario/movimientos", { tipo: "entrada", motivo: acMotivo, sku_id: row.sku_id, bodega_id: row.bodega_id, cantidad: cant, costo_unitario: Number(acCosto) || 0 });
        toast.success(`Entrada de ${fmtNum(cant)} registrada`);
      } else if (accionTipo === "salida") {
        if (cant <= 0) { setAcError("Cantidad debe ser mayor a 0"); setAcLoading(false); return; }
        if (cant > row.cantidad_disponible) { setAcError(`Solo hay ${fmtNum(row.cantidad_disponible)} disponibles`); setAcLoading(false); return; }
        await api.post("/inventario/movimientos", { tipo: "salida", motivo: acMotivo, sku_id: row.sku_id, bodega_id: row.bodega_id, cantidad: cant, costo_unitario: 0 });
        toast.success(`Salida de ${fmtNum(cant)} registrada`);
      } else if (accionTipo === "ajuste") {
        const diff = cant - row.cantidad;
        if (diff === 0) { setAcError("La cantidad es igual al stock actual"); setAcLoading(false); return; }
        await api.post("/inventario/movimientos", { tipo: diff > 0 ? "entrada" : "salida", motivo: "ajuste", sku_id: row.sku_id, bodega_id: row.bodega_id, cantidad: Math.abs(diff), costo_unitario: 0 });
        toast.success(`Ajuste aplicado (${diff > 0 ? "+" : ""}${fmtNum(diff)})`);
      } else if (accionTipo === "transfer") {
        if (cant <= 0) { setAcError("Cantidad debe ser mayor a 0"); setAcLoading(false); return; }
        if (!acDestino) { setAcError("Selecciona la bodega destino"); setAcLoading(false); return; }
        if (cant > row.cantidad_disponible) { setAcError(`Solo hay ${fmtNum(row.cantidad_disponible)} disponibles`); setAcLoading(false); return; }
        await api.post("/inventario/transferencias", { sku_id: row.sku_id, bodega_origen_id: row.bodega_id, bodega_destino_id: Number(acDestino), cantidad: cant });
        toast.success("Transferencia completada");
      } else if (accionTipo === "config") {
        const qs = new URLSearchParams();
        if (acMin !== "") qs.set("cantidad_minima", String(Number(acMin) || 0));
        if (acMax !== "") qs.set("cantidad_maxima", String(Number(acMax) || 0));
        await api.put(`/inventario/stock/${row.id}?${qs}`);
        toast.success("Niveles mín/máx actualizados");
      }
      const data = await load();
      setDetail(data.find((x) => x.id === row.id) || null);
      setAccionTipo(null);
    } catch (err: any) {
      setAcError(err.response?.data?.detail || "Error al ejecutar la acción");
    } finally { setAcLoading(false); }
  };

  const getLevel = (s: StockItem) => {
    if (s.cantidad === 0) return "low";
    if (s.cantidad_minima && s.cantidad <= s.cantidad_minima) return "warn";
    return "ok";
  };
  const nivelTexto = (lv: string) => (lv === "low" ? "Sin stock" : lv === "warn" ? "Bajo" : "Normal");
  const nivelColor = (lv: string) => (lv === "low" ? "var(--stock-low)" : lv === "warn" ? "var(--stock-warn)" : "var(--stock-ok)");

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
  const lowItems = filtered.filter((s) => getLevel(s) !== "ok").length;

  const irAKardex = (skuId: number) => { cerrarDetalle(); navigate(`/inventario/kardex?sku=${skuId}`); };

  const detailLv = detail ? getLevel(detail) : "ok";

  return (
    <div style={{ animation: "fadeInUp .45s ease forwards" }}>
      <style>{ST_CSS}</style>
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
              <th style={{ ...th, width: 36 }}></th>
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
                  <tr key={s.id} className="st-row" onClick={() => abrirDetalle(s)} style={{ borderBottom: "1px solid var(--row-border)" }}>
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
                      <div style={{ fontFamily: "'Space Grotesk'", fontWeight: 700, fontSize: 14, color: nivelColor(lv) }}>{s.cantidad.toLocaleString()}</div>
                      <div style={{ width: 50, height: 4, background: "rgba(128,128,128,0.1)", borderRadius: 2, marginTop: 4, overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: 2, width: `${Math.max(barPct, 2)}%`, background: nivelColor(lv) }} />
                      </div>
                    </td>
                    <td style={td}>
                      <span style={{ fontFamily: "'Space Grotesk'", fontWeight: 700, fontSize: 14, color: nivelColor(lv) }}>{nivelTexto(lv)}</span>
                    </td>
                    <td style={{ ...td, textAlign: "right", fontFamily: "'Space Grotesk'", fontWeight: 600, color: "var(--text-secondary)", fontSize: 13 }}>{s.cantidad_disponible.toLocaleString()}</td>
                    <td style={{ ...td, textAlign: "right", fontFamily: "'Space Grotesk'", fontWeight: 500, color: "var(--text-muted)", fontSize: 12 }}>{s.cantidad_reservada.toLocaleString()}</td>
                    <td style={{ ...td, textAlign: "right" }}><i className="fas fa-chevron-right st-chevron" /></td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Drawer de detalle + acciones */}
      {detail && createPortal(
        <>
          <div className="st-overlay" onClick={cerrarDetalle} />
          <aside className="st-drawer" role="dialog" aria-modal="true">
            <div className="st-drawer-head">
              <div>
                <div className="st-drawer-title">Detalle de existencia</div>
                <div className="st-drawer-sub">{detail.sku_codigo}</div>
              </div>
              <button className="st-close" onClick={cerrarDetalle} aria-label="Cerrar"><i className="fas fa-xmark" /></button>
            </div>

            <div className="st-drawer-body">
              {/* Hero */}
              <div className="st-hero">
                <div className="st-hero-icon"><i className="fas fa-cubes" /></div>
                <div style={{ minWidth: 0 }}>
                  <div className="st-hero-name">{detail.sku_descripcion}</div>
                  <div className="st-hero-code">{detail.sku_codigo}</div>
                  <div className="st-hero-badges">
                    <span className="st-tag"><i className="fas fa-warehouse" style={{ marginRight: 5 }} />{detail.bodega_nombre}</span>
                    {detail.lote_numero && <span className="st-tag"><i className="fas fa-layer-group" style={{ marginRight: 5 }} />Lote {detail.lote_numero}</span>}
                    <span className="st-tag" style={{ color: nivelColor(detailLv), borderColor: nivelColor(detailLv) }}><span className="st-dot" style={{ background: nivelColor(detailLv) }} />{nivelTexto(detailLv)}</span>
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="st-stats">
                <div><div className="st-stat-val">{fmtNum(detail.cantidad)}</div><div className="st-stat-lbl">Físico</div></div>
                <div><div className="st-stat-val" style={{ color: "var(--stock-ok)" }}>{fmtNum(detail.cantidad_disponible)}</div><div className="st-stat-lbl">Disponible</div></div>
                <div><div className="st-stat-val" style={{ color: "var(--text-muted)" }}>{fmtNum(detail.cantidad_reservada)}</div><div className="st-stat-lbl">Reservado</div></div>
              </div>

              {/* Acciones */}
              <div className="st-section">
                <div className="st-section-title">Acciones rápidas</div>
                <div className="st-actions">
                  {ACCIONES.filter((a) => !a.adminOnly || esAdmin).map((a) => (
                    <button key={a.tipo} className={`st-act-btn ${accionTipo === a.tipo ? "active" : ""}`} onClick={() => abrirAccion(a.tipo)}>
                      <i className={`fas ${a.icon}`} /> {a.label}
                    </button>
                  ))}
                </div>

                {accionTipo && (
                  <div className="st-form">
                    {acError && <div className="st-error">{acError}</div>}

                    {accionTipo === "entrada" && (
                      <div className="st-field">
                        <label>Motivo</label>
                        <select value={acMotivo} onChange={(e) => setAcMotivo(e.target.value)} className="st-input">
                          <option value="compra">Compra</option>
                          <option value="devolucion_cliente">Devolución de cliente</option>
                          <option value="stock_inicial">Stock inicial</option>
                          <option value="ajuste">Ajuste (+)</option>
                        </select>
                      </div>
                    )}

                    {accionTipo === "salida" && (
                      <div className="st-field">
                        <label>Motivo</label>
                        <select value={acMotivo} onChange={(e) => setAcMotivo(e.target.value)} className="st-input">
                          <option value="merma">Merma</option>
                          <option value="consumo">Consumo interno</option>
                          <option value="devolucion_proveedor">Devolución a proveedor</option>
                          <option value="ajuste">Ajuste (−)</option>
                        </select>
                      </div>
                    )}

                    {accionTipo === "transfer" && (
                      <div className="st-field">
                        <label>Bodega destino</label>
                        <select value={acDestino} onChange={(e) => setAcDestino(e.target.value)} className="st-input">
                          <option value="">Seleccionar...</option>
                          {bodegas.filter((b) => b.id !== detail.bodega_id).map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
                        </select>
                      </div>
                    )}

                    {accionTipo === "config" ? (
                      <div className="st-two">
                        <div className="st-field"><label>Cantidad mínima</label><input type="number" min="0" step="0.01" value={acMin} onChange={(e) => setAcMin(e.target.value)} className="st-input" placeholder="0" /></div>
                        <div className="st-field"><label>Cantidad máxima</label><input type="number" min="0" step="0.01" value={acMax} onChange={(e) => setAcMax(e.target.value)} className="st-input" placeholder="0" /></div>
                      </div>
                    ) : (
                      <div className={accionTipo === "entrada" ? "st-two" : ""}>
                        <div className="st-field">
                          <label>{accionTipo === "ajuste" ? "Cantidad real (contada)" : "Cantidad"}</label>
                          <input type="number" min="0" step="0.01" value={acCantidad} onChange={(e) => setAcCantidad(e.target.value)} className="st-input" autoFocus />
                        </div>
                        {accionTipo === "entrada" && (
                          <div className="st-field"><label>Costo unitario</label><input type="number" min="0" step="0.01" value={acCosto} onChange={(e) => setAcCosto(e.target.value)} className="st-input" /></div>
                        )}
                      </div>
                    )}

                    {accionTipo === "ajuste" && (
                      <div className="st-hint">
                        Diferencia: <strong style={{ color: "var(--text-secondary)" }}>{(Number(acCantidad || 0) - detail.cantidad) >= 0 ? "+" : ""}{fmtNum(Number(acCantidad || 0) - detail.cantidad)}</strong> — se registra como movimiento de ajuste.
                      </div>
                    )}

                    <div className="st-form-actions">
                      <button className="st-btn-ghost" onClick={() => setAccionTipo(null)}>Cancelar</button>
                      <button className="st-btn-primary" onClick={ejecutarAccion} disabled={acLoading}>
                        {acLoading ? <><i className="fas fa-spinner st-spin" /> Procesando…</> : <><i className="fas fa-check" /> Confirmar</>}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Ficha */}
              <div className="st-section">
                <div className="st-section-head">
                  <div className="st-section-title" style={{ margin: 0 }}>Detalle</div>
                  <button className="st-link" onClick={() => irAKardex(detail.sku_id)}>Ver kardex <i className="fas fa-arrow-right" style={{ fontSize: 10 }} /></button>
                </div>
                <div className="st-facts">
                  <div className="st-fact"><span className="st-fact-lbl">Bodega</span><span className="st-fact-val">{detail.bodega_nombre}</span></div>
                  <div className="st-fact"><span className="st-fact-lbl">Lote</span><span className="st-fact-val">{detail.lote_numero || "—"}</span></div>
                  <div className="st-fact"><span className="st-fact-lbl">Mínimo</span><span className="st-fact-val">{detail.cantidad_minima != null ? fmtNum(detail.cantidad_minima) : "—"}</span></div>
                  <div className="st-fact"><span className="st-fact-lbl">Máximo</span><span className="st-fact-val">{detail.cantidad_maxima != null ? fmtNum(detail.cantidad_maxima) : "—"}</span></div>
                  <div className="st-fact" style={{ gridColumn: "1 / -1" }}><span className="st-fact-lbl">Última actualización</span><span className="st-fact-val">{fmtFechaHora(detail.updated_at)}</span></div>
                </div>
              </div>
            </div>

            <div className="st-drawer-foot">
              <button className="st-btn-ghost" onClick={cerrarDetalle}>Cerrar</button>
            </div>
          </aside>
        </>,
        document.body
      )}
    </div>
  );
}

const searchInp: React.CSSProperties = { width: "100%", padding: "10px 14px 10px 40px", borderRadius: 8, border: "1px solid var(--input-border)", background: "var(--input-bg)", color: "var(--text-primary)", fontSize: 13, fontFamily: "inherit", outline: "none", transition: "all .25s ease" };
const filterInp: React.CSSProperties = { padding: "10px 36px 10px 14px", borderRadius: 8, border: "1px solid var(--input-border)", background: "var(--input-bg)", color: "var(--text-primary)", fontSize: 13, fontFamily: "inherit", outline: "none", cursor: "pointer", transition: "all .25s ease", appearance: "none", WebkitAppearance: "none" };
const th: React.CSSProperties = { textAlign: "left", padding: "13px 16px", fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".8px", color: "var(--text-muted)", background: "var(--bg-table-head)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "13px 16px", fontSize: 13, color: "var(--text-secondary)", verticalAlign: "middle", whiteSpace: "nowrap" };

const ST_CSS = `
.st-row{cursor:pointer;transition:background .15s}
.st-row:hover{background:var(--bg-table-row-hover)}
.st-chevron{color:var(--text-muted);font-size:12px;opacity:.4;transition:all .18s}
.st-row:hover .st-chevron{opacity:1;color:var(--accent);transform:translateX(2px)}

.st-overlay{position:fixed;inset:0;background:rgba(15,23,42,0.45);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);z-index:900;animation:fadeIn .25s ease}
.st-drawer{position:fixed;top:0;right:0;bottom:0;width:500px;max-width:100vw;background:var(--surface);z-index:901;display:flex;flex-direction:column;box-shadow:-10px 0 40px rgba(0,0,0,0.2);animation:stSlide .35s cubic-bezier(0.32,0.72,0,1)}
@keyframes stSlide{from{transform:translateX(100%)}to{transform:translateX(0)}}
.st-drawer-head{padding:22px 26px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-shrink:0}
.st-drawer-title{font-size:18px;font-weight:800;letter-spacing:-0.3px;color:var(--text)}
.st-drawer-sub{font-size:12px;color:var(--text-muted);margin-top:2px;font-family:'Space Grotesk',sans-serif}
.st-close{width:36px;height:36px;border-radius:10px;background:var(--bg);border:1px solid var(--border);cursor:pointer;color:var(--text-muted);display:flex;align-items:center;justify-content:center;transition:all .2s}
.st-close:hover{background:var(--danger-bg);color:var(--danger);border-color:transparent}
.st-drawer-body{flex:1;overflow-y:auto;padding:22px 26px}
.st-drawer-foot{padding:14px 26px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:12px;flex-shrink:0}

.st-hero{display:flex;align-items:center;gap:16px;padding:18px;background:var(--primary-light);border:1px solid var(--border);border-radius:14px;margin-bottom:20px}
.st-hero-icon{width:56px;height:56px;border-radius:15px;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;box-shadow:0 8px 20px rgba(0,0,0,0.12)}
.st-hero-name{font-weight:700;font-size:15px;color:var(--text);line-height:1.25}
.st-hero-code{font-size:12px;color:var(--text-muted);margin-top:2px;font-family:'Space Grotesk',sans-serif}
.st-hero-badges{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.st-tag{display:inline-flex;align-items:center;padding:3px 9px;border-radius:20px;font-size:11px;font-weight:600;background:var(--surface);border:1px solid var(--border);color:var(--text-secondary)}
.st-dot{width:6px;height:6px;border-radius:50%;margin-right:5px}

.st-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:24px}
.st-stats>div{background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:14px;text-align:center}
.st-stat-val{font-family:'Space Grotesk',sans-serif;font-size:20px;font-weight:800;color:var(--text)}
.st-stat-lbl{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);font-weight:600;margin-top:2px}

.st-section{margin-bottom:24px}
.st-section-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:14px;display:flex;align-items:center;gap:8px}
.st-section-title::before{content:'';width:3px;height:14px;background:var(--primary);border-radius:2px}
.st-section-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}
.st-link{background:none;border:none;font:inherit;font-size:12px;font-weight:600;color:var(--primary);cursor:pointer;display:inline-flex;align-items:center;gap:5px;padding:2px 4px;border-radius:6px}
.st-link:hover{text-decoration:underline}

.st-actions{display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:8px}
.st-act-btn{display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 6px;border:1.5px solid var(--border);border-radius:12px;background:var(--bg);color:var(--text-secondary);font:inherit;font-size:11.5px;font-weight:600;cursor:pointer;transition:all .18s}
.st-act-btn i{font-size:15px}
.st-act-btn:hover{border-color:var(--primary);color:var(--primary)}
.st-act-btn.active{border-color:var(--primary);background:var(--primary-light);color:var(--primary)}

.st-form{margin-top:14px;padding:16px;background:var(--bg);border:1px solid var(--border);border-radius:12px;animation:fadeIn .2s ease}
.st-two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.st-field{margin-bottom:12px}
.st-field label{display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);margin-bottom:6px}
.st-input{width:100%;background:var(--surface);border:1.5px solid var(--border);border-radius:10px;padding:10px 12px;font:inherit;font-size:13px;color:var(--text);outline:none;box-sizing:border-box;transition:all .2s}
.st-input:focus{border-color:var(--primary);box-shadow:0 0 0 4px var(--primary-light)}
.st-hint{font-size:12px;color:var(--text-muted);margin-bottom:12px}
.st-error{background:var(--danger-bg);color:var(--danger-text);padding:9px 12px;border-radius:8px;margin-bottom:12px;font-size:12.5px}
.st-form-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:4px}
.st-btn-primary{background:var(--primary);color:#fff;border:none;border-radius:10px;padding:9px 16px;font:inherit;font-weight:600;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;gap:8px;transition:all .2s}
.st-btn-primary:hover{background:var(--primary-hover)}
.st-btn-primary:disabled{opacity:.7;cursor:not-allowed}
.st-btn-ghost{background:transparent;border:1.5px solid var(--border);border-radius:10px;padding:9px 16px;font:inherit;font-weight:600;font-size:13px;color:var(--text);cursor:pointer;transition:all .2s}
.st-btn-ghost:hover{background:var(--border-light)}
.st-spin{animation:spin .7s linear infinite}

.st-facts{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--border);border:1px solid var(--border);border-radius:12px;overflow:hidden}
.st-fact{background:var(--surface);padding:12px 14px;display:flex;flex-direction:column;gap:3px}
.st-fact-lbl{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);font-weight:600}
.st-fact-val{font-size:13px;font-weight:600;color:var(--text)}

@media(max-width:640px){.st-drawer{width:100vw}}
`;
