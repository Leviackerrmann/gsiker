import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import api from "../../lib/api";
import { useToast } from "../../components/Toast";
import { formatMoney } from "../../lib/money";

interface FacturaItem { sku_codigo: string; sku_descripcion: string; cantidad: number; precio_unitario: number; precio_total: number; }
interface Factura {
  id: number; numero: string; pedido_id: number; pedido_numero: string;
  cliente_nombre: string; fecha_emision: string; fecha_vencimiento: string | null;
  moneda: string; subtotal: number; impuesto_porcentaje: number; impuesto_total: number; total: number;
  estado: string; notas: string | null;
}
interface FacturaDetalle extends Factura { items: FacturaItem[]; }

const ESTADO_META: Record<string, { label: string; bg: string; fg: string }> = {
  pendiente: { label: "Pendiente", bg: "var(--warning-bg)", fg: "var(--warning-text)" },
  pagada: { label: "Pagada", bg: "var(--success-bg)", fg: "var(--success-text)" },
  anulada: { label: "Anulada", bg: "var(--danger-bg)", fg: "var(--danger-text)" },
};

function fmtFecha(s: string | null) { return s ? new Date(s).toLocaleDateString("es-GT", { day: "2-digit", month: "short", year: "numeric" }) : "—"; }

export default function FacturasPage() {
  const toast = useToast();
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<FacturaDetalle | null>(null);
  const [search, setSearch] = useState("");
  const [filtro, setFiltro] = useState("");

  const load = () => { api.get("/ventas/facturas").then((r) => { setFacturas(r.data); setLoading(false); }); };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!detail) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDetail(null); };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", onKey); };
  }, [detail]);

  const openDetail = async (id: number) => { try { const { data } = await api.get(`/ventas/facturas/${id}`); setDetail(data); } catch { toast.error("No se pudo abrir la factura"); } };
  const handlePagar = async (id: number) => { await api.post(`/ventas/facturas/${id}/pagar`); toast.success("Factura marcada como pagada"); setDetail(null); load(); };
  const handleAnular = async (id: number) => { if (!confirm("¿Anular esta factura?")) return; await api.post(`/ventas/facturas/${id}/anular`); toast.success("Factura anulada"); setDetail(null); load(); };

  const counts = useMemo(() => ({
    todas: facturas.length,
    pendiente: facturas.filter((f) => f.estado === "pendiente").length,
    pagada: facturas.filter((f) => f.estado === "pagada").length,
    anulada: facturas.filter((f) => f.estado === "anulada").length,
  }), [facturas]);

  const totalFacturado = facturas.filter((f) => f.estado !== "anulada").reduce((a, f) => a + f.total, 0);
  const totalPendiente = facturas.filter((f) => f.estado === "pendiente").reduce((a, f) => a + f.total, 0);
  const totalPagado = facturas.filter((f) => f.estado === "pagada").reduce((a, f) => a + f.total, 0);
  const monedaFmt = facturas[0]?.moneda || "GTQ";

  const filtered = facturas.filter((f) => {
    if (filtro && f.estado !== filtro) return false;
    if (search) { const h = `${f.numero} ${f.pedido_numero} ${f.cliente_nombre}`.toLowerCase(); if (!h.includes(search.toLowerCase())) return false; }
    return true;
  });

  const chips = [
    { key: "", label: "Todas", count: counts.todas },
    { key: "pendiente", label: "Pendientes", count: counts.pendiente },
    { key: "pagada", label: "Pagadas", count: counts.pagada },
    { key: "anulada", label: "Anuladas", count: counts.anulada },
  ];

  return (
    <div style={{ animation: "fadeInUp .45s ease forwards" }}>
      <style>{FV_CSS}</style>

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "'Space Grotesk'", fontSize: 26, fontWeight: 700, letterSpacing: "-0.5px", color: "var(--text-primary)", margin: 0 }}>Facturas de venta</h1>
        <p style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 4 }}>Comprobantes emitidos, cobros y anulaciones</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 24 }}>
        <div className="fv-stat fv-stat-dark"><div className="fv-stat-top"><span className="fv-stat-lbl" style={{ color: "rgba(255,255,255,.75)" }}>Facturado</span><i className="fas fa-file-invoice-dollar" /></div><div className="fv-stat-val" style={{ color: "#fff" }}>{formatMoney(totalFacturado, monedaFmt)}</div><div className="fv-stat-foot" style={{ color: "rgba(255,255,255,.7)" }}>{counts.todas} facturas</div></div>
        <div className="fv-stat"><div className="fv-stat-top"><span className="fv-stat-lbl">Por cobrar</span><i className="fas fa-clock" style={{ color: "var(--warning-text)" }} /></div><div className="fv-stat-val" style={{ color: "var(--warning-text)" }}>{formatMoney(totalPendiente, monedaFmt)}</div><div className="fv-stat-foot">{counts.pendiente} pendientes</div></div>
        <div className="fv-stat"><div className="fv-stat-top"><span className="fv-stat-lbl">Cobrado</span><i className="fas fa-circle-check" style={{ color: "var(--success-text)" }} /></div><div className="fv-stat-val" style={{ color: "var(--success-text)" }}>{formatMoney(totalPagado, monedaFmt)}</div><div className="fv-stat-foot">{counts.pagada} pagadas</div></div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 220, maxWidth: 340 }}>
          <i className="fas fa-search" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", fontSize: 13 }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por factura, pedido o cliente..." className="fv-search" />
        </div>
        <div className="fv-chips">
          {chips.map((ch) => <button key={ch.key || "todas"} className={`fv-chip ${filtro === ch.key ? "active" : ""}`} onClick={() => setFiltro(ch.key)}>{ch.label}<span className="fv-chip-count">{ch.count}</span></button>)}
        </div>
      </div>

      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--card-radius)", overflow: "hidden", boxShadow: "var(--card-shadow)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Factura</th><th style={th}>Pedido</th><th style={th}>Cliente</th><th style={th}>Emisión</th>
              <th style={{ ...th, textAlign: "right" }}>Subtotal</th><th style={{ ...th, textAlign: "right" }}>IVA</th><th style={{ ...th, textAlign: "right" }}>Total</th>
              <th style={th}>Estado</th><th style={{ ...th, width: 36 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ ...td, textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Cargando...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} style={{ ...td, textAlign: "center", padding: 50, color: "var(--text-muted)" }}><i className="fas fa-file-invoice" style={{ fontSize: 28, display: "block", marginBottom: 12, opacity: .3 }} />No hay facturas con estos filtros</td></tr>
            ) : filtered.map((f) => {
              const meta = ESTADO_META[f.estado] || ESTADO_META.anulada;
              return (
                <tr key={f.id} className="fv-row" onClick={() => openDetail(f.id)} style={{ borderBottom: "1px solid var(--row-border)" }}>
                  <td style={td}><span style={{ fontFamily: "'Space Grotesk'", fontWeight: 700, color: "var(--primary)" }}>{f.numero}</span></td>
                  <td style={td}><span style={{ fontFamily: "'Space Grotesk'", fontSize: 12, color: "var(--text-muted)" }}>{f.pedido_numero}</span></td>
                  <td style={{ ...td, fontWeight: 600, color: "var(--text-primary)" }}>{f.cliente_nombre}</td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>{fmtFecha(f.fecha_emision)}</td>
                  <td style={{ ...td, textAlign: "right", fontFamily: "'Space Grotesk'" }}>{formatMoney(f.subtotal, f.moneda)}</td>
                  <td style={{ ...td, textAlign: "right", fontFamily: "'Space Grotesk'", color: "var(--text-muted)" }}>{formatMoney(f.impuesto_total, f.moneda)}</td>
                  <td style={{ ...td, textAlign: "right", fontFamily: "'Space Grotesk'", fontWeight: 700 }}>{formatMoney(f.total, f.moneda)}</td>
                  <td style={td}><span className="fv-badge" style={{ background: meta.bg, color: meta.fg }}>{meta.label}</span></td>
                  <td style={{ ...td, textAlign: "right" }}><i className="fas fa-chevron-right fv-chevron" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Drawer detalle */}
      {detail && createPortal(
        <>
          <div className="fv-overlay" onClick={() => setDetail(null)} />
          <aside className="fv-drawer" role="dialog" aria-modal="true">
            <div className="fv-drawer-head">
              <div><div className="fv-drawer-title">Factura {detail.numero}</div><div className="fv-drawer-sub">Pedido {detail.pedido_numero}</div></div>
              <button className="fv-close" onClick={() => setDetail(null)} aria-label="Cerrar"><i className="fas fa-xmark" /></button>
            </div>
            <div className="fv-drawer-body">
              <div className="fv-hero">
                <div className="fv-hero-icon"><i className="fas fa-file-invoice-dollar" /></div>
                <div style={{ minWidth: 0 }}>
                  <div className="fv-hero-name">{detail.cliente_nombre}</div>
                  <div className="fv-hero-sub">Emitida {fmtFecha(detail.fecha_emision)}{detail.fecha_vencimiento ? ` · vence ${fmtFecha(detail.fecha_vencimiento)}` : ""}</div>
                  <div className="fv-hero-badges"><span className="fv-badge" style={{ background: (ESTADO_META[detail.estado] || ESTADO_META.anulada).bg, color: (ESTADO_META[detail.estado] || ESTADO_META.anulada).fg }}>{(ESTADO_META[detail.estado] || ESTADO_META.anulada).label}</span></div>
                </div>
              </div>

              <div className="fv-section">
                <div className="fv-section-title">Detalle ({detail.items.length})</div>
                <div className="fv-items">
                  {detail.items.map((it, i) => (
                    <div key={i} className="fv-item">
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{it.sku_descripcion}</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'Space Grotesk'" }}>{it.sku_codigo} · {it.cantidad} × {formatMoney(it.precio_unitario, detail.moneda)}</div>
                      </div>
                      <div style={{ fontFamily: "'Space Grotesk'", fontWeight: 700, color: "var(--text)" }}>{formatMoney(it.precio_total, detail.moneda)}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="fv-totals">
                <div className="fv-total-row"><span>Subtotal</span><span>{formatMoney(detail.subtotal, detail.moneda)}</span></div>
                <div className="fv-total-row"><span>IVA ({detail.impuesto_porcentaje}%)</span><span>{formatMoney(detail.impuesto_total, detail.moneda)}</span></div>
                <div className="fv-total-row fv-total-grand"><span>Total</span><span>{formatMoney(detail.total, detail.moneda)}</span></div>
              </div>

              {detail.notas && <div className="fv-section" style={{ marginTop: 20 }}><div className="fv-section-title">Notas</div><div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{detail.notas}</div></div>}
            </div>
            {detail.estado === "pendiente" && (
              <div className="fv-drawer-foot">
                <button className="fv-btn-danger" onClick={() => handleAnular(detail.id)}><i className="fas fa-ban" /> Anular</button>
                <button className="fv-btn-primary" style={{ marginLeft: "auto" }} onClick={() => handlePagar(detail.id)}><i className="fas fa-check" /> Marcar pagada</button>
              </div>
            )}
          </aside>
        </>,
        document.body
      )}
    </div>
  );
}

const th: React.CSSProperties = { textAlign: "left", padding: "13px 16px", fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".8px", color: "var(--text-muted)", background: "var(--bg-table-head)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "12px 16px", fontSize: 13, color: "var(--text-secondary)", verticalAlign: "middle" };

const FV_CSS = `
.fv-btn-primary{display:inline-flex;align-items:center;gap:8px;background:var(--primary);color:#fff;border:none;border-radius:10px;padding:9px 16px;font:inherit;font-weight:600;font-size:13px;cursor:pointer;transition:all .2s}
.fv-btn-primary:hover{background:var(--primary-hover)}
.fv-btn-danger{display:inline-flex;align-items:center;gap:8px;background:var(--danger-bg);color:var(--danger-text);border:none;border-radius:10px;padding:9px 16px;font:inherit;font-weight:600;font-size:13px;cursor:pointer;transition:all .2s}
.fv-btn-danger:hover{filter:brightness(.96)}

.fv-stat{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--card-radius);padding:18px;box-shadow:var(--card-shadow)}
.fv-stat-dark{background:linear-gradient(135deg,var(--primary),var(--primary-hover));border:none}
.fv-stat-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.fv-stat-top i{font-size:16px}
.fv-stat-lbl{font-size:11px;text-transform:uppercase;letter-spacing:.8px;color:var(--text-muted);font-weight:600}
.fv-stat-val{font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:700;color:var(--text-primary);letter-spacing:-.5px}
.fv-stat-foot{font-size:11.5px;color:var(--text-muted);margin-top:6px}

.fv-search{width:100%;padding:10px 14px 10px 40px;border-radius:8px;border:1px solid var(--input-border);background:var(--input-bg);color:var(--text-primary);font-size:13px;font-family:inherit;outline:none;box-sizing:border-box}
.fv-search:focus{border-color:var(--primary)}
.fv-chips{display:flex;gap:8px;flex-wrap:wrap}
.fv-chip{display:inline-flex;align-items:center;gap:7px;padding:7px 13px;border-radius:20px;border:1.5px solid var(--border);background:transparent;color:var(--text-secondary);font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;transition:all .18s}
.fv-chip:hover{border-color:var(--primary);color:var(--primary)}
.fv-chip.active{border-color:var(--primary);background:var(--primary);color:#fff}
.fv-chip-count{font-size:11px;background:var(--border-light);color:var(--text-muted);border-radius:10px;padding:1px 7px;font-weight:700}
.fv-chip.active .fv-chip-count{background:rgba(255,255,255,.25);color:#fff}

.fv-row{cursor:pointer;transition:background .15s}
.fv-row:hover{background:var(--bg-table-row-hover)}
.fv-chevron{color:var(--text-muted);font-size:12px;opacity:.4;transition:all .18s}
.fv-row:hover .fv-chevron{opacity:1;color:var(--primary);transform:translateX(2px)}
.fv-badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;white-space:nowrap}

.fv-overlay{position:fixed;inset:0;background:rgba(15,23,42,0.45);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);z-index:900;animation:fadeIn .25s ease}
.fv-drawer{position:fixed;top:0;right:0;bottom:0;width:500px;max-width:100vw;background:var(--surface);z-index:901;display:flex;flex-direction:column;box-shadow:-10px 0 40px rgba(0,0,0,0.2);animation:fvSlide .35s cubic-bezier(0.32,0.72,0,1)}
@keyframes fvSlide{from{transform:translateX(100%)}to{transform:translateX(0)}}
.fv-drawer-head{padding:22px 26px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-shrink:0}
.fv-drawer-title{font-size:18px;font-weight:800;letter-spacing:-0.3px;color:var(--text)}
.fv-drawer-sub{font-size:12px;color:var(--text-muted);margin-top:2px;font-family:'Space Grotesk',sans-serif}
.fv-close{width:36px;height:36px;border-radius:10px;background:var(--bg);border:1px solid var(--border);cursor:pointer;color:var(--text-muted);display:flex;align-items:center;justify-content:center;transition:all .2s}
.fv-close:hover{background:var(--danger-bg);color:var(--danger);border-color:transparent}
.fv-drawer-body{flex:1;overflow-y:auto;padding:22px 26px}
.fv-drawer-foot{padding:14px 26px;border-top:1px solid var(--border);display:flex;align-items:center;gap:12px;flex-shrink:0}

.fv-hero{display:flex;align-items:center;gap:16px;padding:18px;background:var(--primary-light);border:1px solid var(--border);border-radius:14px;margin-bottom:20px}
.fv-hero-icon{width:52px;height:52px;border-radius:14px;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;box-shadow:0 8px 20px rgba(0,0,0,0.12)}
.fv-hero-name{font-weight:700;font-size:16px;color:var(--text);line-height:1.25}
.fv-hero-sub{font-size:12.5px;color:var(--text-muted);margin-top:2px}
.fv-hero-badges{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}

.fv-section{margin-bottom:20px}
.fv-section-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:14px;display:flex;align-items:center;gap:8px}
.fv-section-title::before{content:'';width:3px;height:14px;background:var(--primary);border-radius:2px}
.fv-items{display:flex;flex-direction:column;gap:8px}
.fv-item{display:flex;align-items:center;gap:12px;padding:11px 14px;background:var(--bg);border:1px solid var(--border);border-radius:10px}
.fv-totals{background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:14px 16px}
.fv-total-row{display:flex;justify-content:space-between;font-size:13px;color:var(--text-secondary);padding:4px 0;font-family:'Space Grotesk',sans-serif}
.fv-total-grand{border-top:1px solid var(--border);margin-top:6px;padding-top:10px;font-size:17px;font-weight:800;color:var(--text)}
.fv-total-grand span:last-child{color:var(--primary)}

@media(max-width:640px){.fv-drawer{width:100vw}}
`;
