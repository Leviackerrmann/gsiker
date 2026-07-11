import { useEffect, useState } from "react";
import api from "../../lib/api";
import { useToast } from "../../components/Toast";
import type { Bodega, Movimiento, SKU } from "../../types";

interface Transferencia {
  ref: string;
  fecha: string;
  sku_codigo: string;
  origen: string;
  destino: string;
  cantidad: number;
  usuario: string;
}

export default function TransferenciasPage() {
  const [transferencias, setTransferencias] = useState<Transferencia[]>([]);
  const [bodegas, setBodegas] = useState<Bodega[]>([]);
  const [skus, setSkus] = useState<SKU[]>([]);
  const [loading, setLoading] = useState(true);

  const [origenId, setOrigenId] = useState("");
  const [destinoId, setDestinoId] = useState("");
  const [skuId, setSkuId] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [referencia, setReferencia] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const toast = useToast();

  const load = async () => {
    try {
      const [salidasRes, entradasRes] = await Promise.all([
        api.get("/inventario/movimientos?motivo=transferencia_salida&limit=500"),
        api.get("/inventario/movimientos?motivo=transferencia_entrada&limit=500"),
      ]);
      const entradasMap = new Map<string, Movimiento>();
      (entradasRes.data as Movimiento[]).forEach((m) => {
        if (m.referencia) entradasMap.set(m.referencia, m);
      });

      const trfs: Transferencia[] = [];
      (salidasRes.data as Movimiento[]).forEach((m) => {
        const entrada = entradasMap.get(m.referencia || "");
        if (entrada) {
          trfs.push({
            ref: m.referencia || "—",
            fecha: m.fecha,
            sku_codigo: m.sku_codigo,
            origen: m.bodega_nombre,
            destino: entrada.bodega_nombre,
            cantidad: m.cantidad,
            usuario: m.usuario_id ? `Usuario #${m.usuario_id}` : "—",
          });
        }
      });
      setTransferencias(trfs);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    load();
    api.get("/inventario/bodegas").then((r) => setBodegas(r.data));
    api.get("/skus?limit=500").then((r) => setSkus(r.data));
  }, []);

  const resetForm = () => {
    setOrigenId(""); setDestinoId(""); setSkuId(""); setCantidad(""); setReferencia(""); setErrors({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!origenId) errs.origen = "Selecciona una bodega de origen";
    if (!destinoId) errs.destino = "Selecciona una bodega de destino";
    if (origenId && destinoId && origenId === destinoId) {
      errs.origen = "No puede ser la misma bodega";
      errs.destino = "No puede ser la misma bodega";
    }
    if (!skuId) errs.sku = "Selecciona un producto";
    if (!cantidad || Number(cantidad) <= 0) errs.cantidad = "Ingresa una cantidad válida";
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    try {
      await api.post("/inventario/transferencias", {
        sku_id: Number(skuId),
        bodega_origen_id: Number(origenId),
        bodega_destino_id: Number(destinoId),
        cantidad: Number(cantidad),
        referencia: referencia || undefined,
      });
      toast.success(`Transferencia ${referencia || "realizada"} completada`);
      resetForm();
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Error en transferencia");
    }
  };

  const totalUnidades = transferencias.reduce((a, t) => a + t.cantidad, 0);
  const hoy = new Date().toISOString().split("T")[0];
  const transferenciasHoy = transferencias.filter((t) => t.fecha.startsWith(hoy)).length;

  const getBodClass = (name: string) => {
    if (name.includes("Central")) return "bc";
    if (name.includes("Materia") || name.includes("Norte")) return "bn";
    return "bs";
  };

  return (
    <div style={{ animation: "fadeInUp .45s ease forwards" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 28, position: "relative", zIndex: 1 }}>
        <div>
          <h1 style={{ fontFamily: "'Space Grotesk'", fontSize: 26, fontWeight: 700, letterSpacing: "-0.5px", color: "var(--text-primary)", margin: 0 }}>Transferencias</h1>
          <p style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 4 }}>Mover stock entre bodegas</p>
        </div>
      </div>

      {!loading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 28, position: "relative", zIndex: 1 }}>
          {[
            { label: "Total Transferencias", val: transferencias.length, ic: "fa-truck-fast", s: "s1" },
            { label: "Unidades Transferidas", val: totalUnidades.toLocaleString(), ic: "fa-boxes-stacked", s: "s2" },
            { label: "Transferencias Hoy", val: transferenciasHoy, ic: "fa-calendar-day", s: "s3" },
          ].map((c, i) => (
            <div key={c.label} style={{
              background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--card-radius)",
              padding: 18, display: "flex", alignItems: "center", gap: 14, boxShadow: "var(--card-shadow)",
              animation: `fadeInUp .5s ease forwards`, animationDelay: `${0.05 + i * 0.05}s`, opacity: 0,
            }}>
              <div style={{ width: 42, height: 42, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0,
                background: c.s === "s1" ? "var(--accent-soft)" : c.s === "s2" ? "var(--c5-soft)" : "var(--c2-soft)",
                color: c.s === "s1" ? "var(--accent)" : c.s === "s2" ? "var(--c5)" : "var(--c2)",
              }}><i className={`fas ${c.ic}`} /></div>
              <div><div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".8px", color: "var(--text-muted)", fontWeight: 600, marginBottom: 4 }}>{c.label}</div>
                <div style={{ fontFamily: "'Space Grotesk'", fontSize: 24, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-.5px" }}>{c.val}</div></div>
            </div>
          ))}
        </div>
      )}

      <div style={formCard}>
        <div style={formHead}>
          <div style={formIcon}><i className="fas fa-truck-fast" style={{ fontSize: 17 }} /></div>
          <div>
            <div style={formTitle}>Nueva Transferencia</div>
            <div style={formSub}>Selecciona origen, destino y producto a mover</div>
          </div>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: 28 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 0, alignItems: "center", marginBottom: 28 }}>
            <div style={{ ...bodBox, borderColor: errors.origen ? "var(--danger)" : "var(--border)" }}>
              <div style={boxLbl}><i className="fas fa-circle-dot" style={{ fontSize: 11, color: "var(--accent)" }} /> Bodega Origen</div>
              <select value={origenId} onChange={(e) => setOrigenId(e.target.value)} style={bodSel}>
                <option value="">Seleccionar bodega...</option>
                {bodegas.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
              </select>
              {errors.origen && <div style={errMsg}><i className="fas fa-circle-exclamation" /> {errors.origen}</div>}
            </div>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--bg-card)", border: `1px solid ${errors.destino && errors.origen ? "var(--danger)" : "var(--border)"}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 -10px", position: "relative", zIndex: 2 }}>
              <i className="fas fa-arrow-right" style={{ fontSize: 20, color: errors.destino && errors.origen ? "var(--danger)" : "var(--accent)" }} />
            </div>
            <div style={{ ...bodBox, borderColor: errors.destino ? "var(--danger)" : "var(--border)" }}>
              <div style={boxLbl}><i className="fas fa-location-dot" style={{ fontSize: 11, color: "var(--accent)" }} /> Bodega Destino</div>
              <select value={destinoId} onChange={(e) => setDestinoId(e.target.value)} style={bodSel}>
                <option value="">Seleccionar bodega...</option>
                {bodegas.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
              </select>
              {errors.destino && <div style={errMsg}><i className="fas fa-circle-exclamation" /> {errors.destino}</div>}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: 14, marginBottom: 18 }}>
            <div>
              <label style={lbl}><i className="fas fa-barcode" style={{ fontSize: 11, opacity: .6 }} />SKU</label>
              <select value={skuId} onChange={(e) => setSkuId(e.target.value)} style={{ ...selInp, borderColor: errors.sku ? "var(--danger)" : "var(--m-input-border)" }}>
                <option value="">Seleccionar producto...</option>
                {skus.map((s) => <option key={s.id} value={s.id}>{s.codigo_sku} — {s.descripcion}</option>)}
              </select>
              {errors.sku && <div style={errMsg}><i className="fas fa-circle-exclamation" /> {errors.sku}</div>}
            </div>
            <div>
              <label style={lbl}><i className="fas fa-cubes" style={{ fontSize: 11, opacity: .6 }} />Cantidad</label>
              <div style={{ position: "relative" }}>
                <input type="number" min="1" value={cantidad} onChange={(e) => setCantidad(e.target.value)} style={{ ...fiInp, borderColor: errors.cantidad ? "var(--danger)" : "var(--m-input-border)" }} placeholder="0" />
                <i className="fas fa-cubes fi-icon" />
              </div>
              {errors.cantidad && <div style={errMsg}><i className="fas fa-circle-exclamation" /> {errors.cantidad}</div>}
            </div>
          </div>

          <div style={{ maxWidth: 320 }}>
            <label style={lbl}><i className="fas fa-hashtag" style={{ fontSize: 11, opacity: .6 }} />Referencia <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, opacity: .6 }}>(opcional)</span></label>
            <div style={{ position: "relative" }}>
              <input value={referencia} onChange={(e) => setReferencia(e.target.value)} style={fiInp} placeholder="Ej: TRF - 001" />
              <i className="fas fa-hashtag fi-icon" />
            </div>
          </div>
        </form>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 28px 28px" }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 5 }}>
            <i className="fas fa-circle-info" style={{ fontSize: 10, color: "var(--accent)" }} />
            El stock se actualizará automáticamente en ambas bodegas
          </div>
          <button onClick={handleSubmit} style={btnSubmit}>
            <i className="fas fa-truck-fast" style={{ fontSize: 13 }} /> Realizar Transferencia
          </button>
        </div>
      </div>

      <div style={tableCard}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px", borderBottom: "1px solid var(--border)" }}>
          <h3 style={{ fontFamily: "'Space Grotesk'", fontSize: 15, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>Transferencias Recientes</h3>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Referencia</th>
              <th style={th}>Fecha</th>
              <th style={th}>SKU</th>
              <th style={th}>Ruta</th>
              <th style={th}>Cantidad</th>
              <th style={th}>Usuario</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ ...td, textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Cargando...</td></tr>
            ) : transferencias.length === 0 ? (
              <tr><td colSpan={6}><div style={{ textAlign: "center", padding: 48, color: "var(--text-muted)" }}>
                <i className="fas fa-truck-fast" style={{ fontSize: 36, display: "block", marginBottom: 14, opacity: .2 }} />
                <p style={{ fontSize: 13, marginBottom: 4 }}>Aún no hay transferencias registradas</p>
                <p style={{ fontSize: 11, opacity: .6 }}>Usa el formulario de arriba para realizar la primera</p>
              </div></td></tr>
            ) : (
              transferencias.map((t, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--row-border)" }}>
                  <td style={td}><span style={{ fontFamily: "'Space Grotesk'", fontWeight: 600, color: "var(--accent)", fontSize: 13 }}>{t.ref}</span></td>
                  <td style={td}>
                    <span style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500 }}>
                      {new Date(t.fecha).toLocaleDateString("es-CL")}
                      <span style={{ color: "var(--text-muted)", fontWeight: 400, fontSize: 11, marginLeft: 6 }}>
                        {new Date(t.fecha).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </span>
                  </td>
                  <td style={td}><span style={{ fontFamily: "'Space Grotesk'", fontWeight: 600, color: "var(--accent)", fontSize: 12.5 }}>{t.sku_codigo}</span></td>
                  <td style={td}>
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: "var(--badge-radius)", fontSize: 11, fontWeight: 600,
                        background: getBodClass(t.origen) === "bc" ? "var(--bod-c-bg)" : getBodClass(t.origen) === "bn" ? "var(--bod-n-bg)" : "var(--bod-s-bg)",
                        color: getBodClass(t.origen) === "bc" ? "var(--bod-c-t)" : getBodClass(t.origen) === "bn" ? "var(--bod-n-t)" : "var(--bod-s-t)",
                      }}>
                        <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor" }} /> {t.origen}
                      </span>
                      <i className="fas fa-arrow-right" style={{ fontSize: 10, margin: "0 6px", color: "var(--accent)" }} />
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: "var(--badge-radius)", fontSize: 11, fontWeight: 600,
                        background: getBodClass(t.destino) === "bc" ? "var(--bod-c-bg)" : getBodClass(t.destino) === "bn" ? "var(--bod-n-bg)" : "var(--bod-s-bg)",
                        color: getBodClass(t.destino) === "bc" ? "var(--bod-c-t)" : getBodClass(t.destino) === "bn" ? "var(--bod-n-t)" : "var(--bod-s-t)",
                      }}>
                        <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor" }} /> {t.destino}
                      </span>
                    </span>
                  </td>
                  <td style={td}><span style={{ fontFamily: "'Space Grotesk'", fontWeight: 700, fontSize: 14, color: "var(--text-primary)" }}>{t.cantidad.toLocaleString()}</span></td>
                  <td style={td}><span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t.usuario}</span></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const formCard: React.CSSProperties = { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--card-radius)", boxShadow: "var(--card-shadow)", overflow: "hidden", position: "relative", zIndex: 1, marginBottom: 24 };
const formHead: React.CSSProperties = { display: "flex", alignItems: "center", gap: 12, padding: "20px 28px", borderBottom: "1px solid var(--border)", background: "rgba(255,255,255,0.02)" };
const formIcon: React.CSSProperties = { width: 42, height: 42, borderRadius: 12, background: "linear-gradient(135deg, var(--accent-grad-start), var(--accent-grad-end))", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", boxShadow: "0 4px 14px var(--accent-glow)", flexShrink: 0 };
const formTitle: React.CSSProperties = { fontFamily: "'Space Grotesk'", fontSize: 16, fontWeight: 700, color: "var(--text-primary)" };
const formSub: React.CSSProperties = { fontSize: 12, color: "var(--text-muted)", marginTop: 2 };
const tableCard: React.CSSProperties = { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--card-radius)", overflow: "hidden", boxShadow: "var(--card-shadow)", position: "relative", zIndex: 1 };

const bodBox: React.CSSProperties = { border: "1.5px solid var(--border)", borderRadius: 12, padding: "18px 20px", transition: "all .25s ease", background: "rgba(255,255,255,0.02)" };
const boxLbl: React.CSSProperties = { fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", color: "var(--text-muted)", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 };
const bodSel: React.CSSProperties = { width: "100%", padding: "10px 14px", borderRadius: 8, border: "1.5px solid var(--input-border)", background: "var(--input-bg)", color: "var(--text-primary)", fontSize: 13.5, fontFamily: "inherit", outline: "none", cursor: "pointer", appearance: "none", WebkitAppearance: "none" };
const btnSubmit: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 28px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", border: "none", color: "#fff", fontFamily: "inherit", background: "linear-gradient(135deg, var(--accent-grad-start), var(--accent-grad-end))", boxShadow: "0 4px 16px var(--accent-glow)", transition: "all .25s ease" };
const errMsg: React.CSSProperties = { fontSize: 11, color: "var(--danger)", marginTop: 5, display: "flex", alignItems: "center", gap: 4, fontWeight: 500 };

const fiInp: React.CSSProperties = { width: "100%", padding: "11px 14px 11px 40px", borderRadius: 10, border: "1.5px solid var(--m-input-border)", background: "var(--m-input-bg)", color: "var(--text-primary)", fontSize: 13.5, fontFamily: "inherit", outline: "none", boxSizing: "border-box", transition: "all .25s ease" };
const selInp: React.CSSProperties = { width: "100%", padding: "11px 36px 11px 14px", borderRadius: 10, border: "1.5px solid var(--m-input-border)", background: "var(--m-input-bg)", color: "var(--text-primary)", fontSize: 13.5, fontFamily: "inherit", outline: "none", cursor: "pointer", appearance: "none", WebkitAppearance: "none", boxSizing: "border-box", transition: "all .25s ease" };
const lbl: React.CSSProperties = { display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".7px", color: "var(--text-muted)", marginBottom: 7 };
const th: React.CSSProperties = { textAlign: "left", padding: "13px 18px", fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".8px", color: "var(--text-muted)", background: "var(--bg-table-head)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "14px 18px", fontSize: 13, color: "var(--text-secondary)", verticalAlign: "middle", whiteSpace: "nowrap" };
