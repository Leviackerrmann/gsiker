import { useEffect, useState } from "react";
import api from "../../lib/api";
import type { Bodega, StockItem } from "../../types";

export default function StockPage() {
  const [stock, setStock] = useState<StockItem[]>([]);
  const [bodegas, setBodegas] = useState<Bodega[]>([]);
  const [bodegaFilter, setBodegaFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    const params = new URLSearchParams();
    if (bodegaFilter) params.set("bodega_id", bodegaFilter);
    params.set("limit", "500");
    api.get(`/inventario/stock?${params}`).then((res) => { setStock(res.data); setLoading(false); });
  };

  useEffect(() => { api.get("/inventario/bodegas").then((r) => setBodegas(r.data)); }, []);
  useEffect(() => { setLoading(true); load(); }, [bodegaFilter]);

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
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ ...td, textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Cargando...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} style={{ ...td, textAlign: "center", padding: 50, color: "var(--text-muted)" }}>
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
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const searchInp: React.CSSProperties = { width: "100%", padding: "10px 14px 10px 40px", borderRadius: 8, border: "1px solid var(--input-border)", background: "var(--input-bg)", color: "var(--text-primary)", fontSize: 13, fontFamily: "inherit", outline: "none", transition: "all .25s ease" };
const filterInp: React.CSSProperties = { padding: "10px 36px 10px 14px", borderRadius: 8, border: "1px solid var(--input-border)", background: "var(--input-bg)", color: "var(--text-primary)", fontSize: 13, fontFamily: "inherit", outline: "none", cursor: "pointer", transition: "all .25s ease", appearance: "none", WebkitAppearance: "none" };
const th: React.CSSProperties = { textAlign: "left", padding: "13px 16px", fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".8px", color: "var(--text-muted)", background: "var(--bg-table-head)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "13px 16px", fontSize: 13, color: "var(--text-secondary)", verticalAlign: "middle", whiteSpace: "nowrap" };
