import { useEffect, useMemo, useState } from "react";
import api from "../../lib/api";
import Modal from "../../components/Modal";
import SearchableSelect from "../../components/SearchableSelect";
import { useToast } from "../../components/Toast";
import { useAuth } from "../../contexts/AuthContext";
import { formatMoney } from "../../lib/money";

interface Cuenta {
  id: number; cliente_id: number; origen: string; origen_id: number | null;
  concepto: string | null; moneda: string; monto_total: number; saldo_pendiente: number;
  estado: string; fecha: string; fecha_vencimiento: string | null; notas: string | null;
}
interface Abono { id: number; cuenta_id: number; monto: number; metodo: string; fecha: string; notas: string | null; }
interface CuentaDetalle extends Cuenta { abonos: Abono[]; }
interface Cliente { id: number; codigo: string; nombre: string; }
interface Resumen { cuentas_abiertas: number; por_cobrar: number; vencido: number; }

const ESTADO_COLOR: Record<string, { bg: string; fg: string }> = {
  pendiente: { bg: "#fef3c7", fg: "#92400e" },
  parcial: { bg: "#dbeafe", fg: "#1e40af" },
  pagada: { bg: "#dcfce7", fg: "#166534" },
  anulada: { bg: "#f3f4f6", fg: "#6b7280" },
};

const METODOS = ["efectivo", "tarjeta", "transferencia"];

export default function CobranzaPage() {
  const toast = useToast();
  const { empresa } = useAuth();
  const moneda = empresa?.moneda || "GTQ";

  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState("");

  const [crearOpen, setCrearOpen] = useState(false);
  const [nuevoCliente, setNuevoCliente] = useState("");
  const [nuevoMonto, setNuevoMonto] = useState("");
  const [nuevoConcepto, setNuevoConcepto] = useState("");
  const [nuevoVenc, setNuevoVenc] = useState("");

  const [detalle, setDetalle] = useState<CuentaDetalle | null>(null);
  const [abonoMonto, setAbonoMonto] = useState("");
  const [abonoMetodo, setAbonoMetodo] = useState("efectivo");

  const clienteNombre = useMemo(() => {
    const m: Record<number, string> = {};
    for (const c of clientes) m[c.id] = c.nombre;
    return m;
  }, [clientes]);

  const load = () => {
    setLoading(true);
    const q = filtroEstado ? `?estado=${filtroEstado}` : "";
    Promise.all([
      api.get(`/cobranza/cuentas${q}`),
      api.get("/cobranza/resumen"),
    ]).then(([cs, rs]) => { setCuentas(cs.data); setResumen(rs.data); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { api.get("/ventas/clientes").then((r) => setClientes(r.data)).catch(() => setClientes([])); }, []);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filtroEstado]);

  const crearCuenta = async () => {
    if (!nuevoCliente || !(parseFloat(nuevoMonto) > 0)) { toast.error("Elige cliente y un monto válido"); return; }
    try {
      await api.post("/cobranza/cuentas", {
        cliente_id: Number(nuevoCliente),
        monto_total: parseFloat(nuevoMonto),
        concepto: nuevoConcepto || null,
        fecha_vencimiento: nuevoVenc ? new Date(nuevoVenc).toISOString() : null,
      });
      toast.success("Cuenta por cobrar creada");
      setCrearOpen(false); setNuevoCliente(""); setNuevoMonto(""); setNuevoConcepto(""); setNuevoVenc("");
      load();
    } catch (e: any) { toast.error(e.response?.data?.detail || "No se pudo crear la cuenta"); }
  };

  const abrirDetalle = async (id: number) => {
    try { const { data } = await api.get(`/cobranza/cuentas/${id}`); setDetalle(data); setAbonoMonto(""); setAbonoMetodo("efectivo"); }
    catch { toast.error("No se pudo abrir la cuenta"); }
  };

  const registrarAbono = async () => {
    if (!detalle) return;
    const monto = parseFloat(abonoMonto);
    if (!(monto > 0)) { toast.error("Ingresa un monto válido"); return; }
    try {
      await api.post(`/cobranza/cuentas/${detalle.id}/abonos`, { monto, metodo: abonoMetodo });
      toast.success("Abono registrado");
      await abrirDetalle(detalle.id);
      load();
    } catch (e: any) { toast.error(e.response?.data?.detail || "No se pudo registrar el abono"); }
  };

  const anular = async (id: number) => {
    try { await api.post(`/cobranza/cuentas/${id}/anular`); toast.success("Cuenta anulada"); setDetalle(null); load(); }
    catch (e: any) { toast.error(e.response?.data?.detail || "No se pudo anular"); }
  };

  const badge = (estado: string) => {
    const c = ESTADO_COLOR[estado] || ESTADO_COLOR.anulada;
    return <span style={{ fontWeight: 600, fontSize: 12, padding: "3px 10px", borderRadius: 999, background: c.bg, color: c.fg }}>{estado.toUpperCase()}</span>;
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", margin: 0 }}>Cobranza — Cuentas por cobrar</h2>
        <button onClick={() => setCrearOpen(true)} style={{ ...btnPri, background: "var(--primary)" }}>
          <i className="fas fa-plus" style={{ marginRight: 8 }} />Nueva cuenta (fiado)
        </button>
      </div>

      {/* Resumen de cartera */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
        <StatCard label="Por cobrar" value={formatMoney(resumen?.por_cobrar, moneda)} icon="fa-hand-holding-dollar" color="var(--primary)" />
        <StatCard label="Vencido" value={formatMoney(resumen?.vencido, moneda)} icon="fa-triangle-exclamation" color="var(--danger)" />
        <StatCard label="Cuentas abiertas" value={String(resumen?.cuentas_abiertas ?? 0)} icon="fa-folder-open" color="var(--text-secondary)" />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {["", "pendiente", "parcial", "pagada"].map((e) => (
          <button key={e || "todas"} onClick={() => setFiltroEstado(e)} style={{
            ...chip, background: filtroEstado === e ? "var(--accent-soft, #eff6ff)" : "transparent",
            borderColor: filtroEstado === e ? "var(--primary)" : "var(--border)",
            color: filtroEstado === e ? "var(--primary)" : "var(--text-secondary)",
          }}>{e === "" ? "Todas" : e.charAt(0).toUpperCase() + e.slice(1)}</button>
        ))}
      </div>

      <div style={card}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th style={th}>Cliente</th>
              <th style={th}>Concepto</th>
              <th style={th}>Fecha</th>
              <th style={th}>Vence</th>
              <th style={{ ...th, textAlign: "right" }}>Total</th>
              <th style={{ ...th, textAlign: "right" }}>Saldo</th>
              <th style={th}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ ...td, textAlign: "center", color: "var(--text-muted)" }}>Cargando...</td></tr>
            ) : cuentas.length === 0 ? (
              <tr><td colSpan={7} style={{ ...td, textAlign: "center", color: "var(--text-muted)", padding: "28px 0" }}>Sin cuentas por cobrar</td></tr>
            ) : cuentas.map((c) => (
              <tr key={c.id} style={{ borderBottom: "1px solid var(--border)", cursor: "pointer" }} onClick={() => abrirDetalle(c.id)}>
                <td style={{ ...td, fontWeight: 600, color: "var(--primary)" }}>{clienteNombre[c.cliente_id] || `#${c.cliente_id}`}</td>
                <td style={td}>{c.concepto || <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                <td style={td}>{new Date(c.fecha).toLocaleDateString()}</td>
                <td style={td}>{c.fecha_vencimiento ? new Date(c.fecha_vencimiento).toLocaleDateString() : "—"}</td>
                <td style={{ ...td, textAlign: "right" }}>{formatMoney(c.monto_total, c.moneda)}</td>
                <td style={{ ...td, textAlign: "right", fontWeight: 700, color: c.saldo_pendiente > 0 ? "var(--text)" : "var(--success, #16a34a)" }}>{formatMoney(c.saldo_pendiente, c.moneda)}</td>
                <td style={td}>{badge(c.estado)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Crear cuenta */}
      <Modal isOpen={crearOpen} title="Nueva cuenta por cobrar (fiado)" onClose={() => setCrearOpen(false)} maxWidth={440}>
        <label style={lbl}>Cliente</label>
        <SearchableSelect
          options={clientes.map((c) => ({ value: String(c.id), label: c.nombre, sublabel: c.codigo }))}
          value={nuevoCliente} onChange={setNuevoCliente} placeholder="Buscar cliente…" />
        <div style={{ height: 12 }} />
        <label style={lbl}>Monto total (Q)</label>
        <input type="number" min={0} step="0.01" value={nuevoMonto} onChange={(e) => setNuevoMonto(e.target.value)} style={inp} />
        <div style={{ height: 12 }} />
        <label style={lbl}>Concepto (opcional)</label>
        <input value={nuevoConcepto} onChange={(e) => setNuevoConcepto(e.target.value)} placeholder="Ej. Fiado de la semana" style={inp} />
        <div style={{ height: 12 }} />
        <label style={lbl}>Fecha de vencimiento (opcional)</label>
        <input type="date" value={nuevoVenc} onChange={(e) => setNuevoVenc(e.target.value)} style={inp} />
        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
          <button onClick={() => setCrearOpen(false)} style={btnGhost}>Cancelar</button>
          <button onClick={crearCuenta} style={{ ...btnPri, background: "var(--primary)" }}>Crear</button>
        </div>
      </Modal>

      {/* Detalle + abonos */}
      <Modal isOpen={!!detalle} title="Cuenta por cobrar" onClose={() => setDetalle(null)} maxWidth={560}>
        {detalle && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13, marginBottom: 16 }}>
              <div><strong>Cliente:</strong> {clienteNombre[detalle.cliente_id] || `#${detalle.cliente_id}`}</div>
              <div><strong>Estado:</strong> {badge(detalle.estado)}</div>
              <div><strong>Concepto:</strong> {detalle.concepto || "—"}</div>
              <div><strong>Origen:</strong> {detalle.origen}</div>
              <div><strong>Total:</strong> {formatMoney(detalle.monto_total, detalle.moneda)}</div>
              <div><strong>Saldo:</strong> <span style={{ fontWeight: 700, color: "var(--primary)" }}>{formatMoney(detalle.saldo_pendiente, detalle.moneda)}</span></div>
            </div>

            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Abonos</div>
            {detalle.abonos.length === 0 ? (
              <div style={{ color: "var(--text-muted)", fontSize: 13, padding: "6px 0 12px" }}>Sin abonos aún</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
                <tbody>
                  {detalle.abonos.map((a) => (
                    <tr key={a.id} style={{ borderBottom: "1px dashed var(--border)" }}>
                      <td style={{ ...td, padding: "6px 4px" }}>{new Date(a.fecha).toLocaleDateString()}</td>
                      <td style={{ ...td, padding: "6px 4px", textTransform: "capitalize" }}>{a.metodo}</td>
                      <td style={{ ...td, padding: "6px 4px", textAlign: "right", fontWeight: 600 }}>{formatMoney(a.monto, detalle.moneda)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {detalle.estado !== "pagada" && detalle.estado !== "anulada" && (
              <div style={{ background: "var(--bg-subtle, #f9fafb)", padding: 12, borderRadius: "var(--radius-sm)", marginTop: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Registrar abono</div>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <label style={lbl}>Monto</label>
                    <input type="number" min={0} step="0.01" value={abonoMonto} onChange={(e) => setAbonoMonto(e.target.value)}
                      placeholder={String(detalle.saldo_pendiente)} style={inp} />
                  </div>
                  <div style={{ minWidth: 130 }}>
                    <label style={lbl}>Método</label>
                    <select value={abonoMetodo} onChange={(e) => setAbonoMetodo(e.target.value)} style={inp}>
                      {METODOS.map((m) => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
                    </select>
                  </div>
                  <button onClick={registrarAbono} style={{ ...btnPri, background: "var(--success, #16a34a)" }}>Abonar</button>
                </div>
              </div>
            )}

            {detalle.estado !== "pagada" && detalle.estado !== "anulada" && (
              <div style={{ marginTop: 12, textAlign: "right" }}>
                <button onClick={() => anular(detalle.id)} style={{ ...btnGhost, color: "var(--danger)", borderColor: "var(--danger)" }}>Anular cuenta</button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: string; icon: string; color: string }) {
  return (
    <div style={{ ...card, display: "flex", alignItems: "center", gap: 14, padding: 16 }}>
      <div style={{ width: 42, height: 42, borderRadius: 10, background: "var(--accent-soft, #eff6ff)", display: "flex", alignItems: "center", justifyContent: "center", color, flexShrink: 0 }}>
        <i className={`fas ${icon}`} style={{ fontSize: 18 }} />
      </div>
      <div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{label}</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text)" }}>{value}</div>
      </div>
    </div>
  );
}

const card: React.CSSProperties = { background: "var(--surface)", padding: 20, borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow)", overflowX: "auto" };
const btnPri: React.CSSProperties = { padding: "8px 16px", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 13, fontWeight: 600 };
const btnGhost: React.CSSProperties = { padding: "8px 16px", background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 13, fontWeight: 600 };
const chip: React.CSSProperties = { padding: "6px 14px", borderRadius: 999, border: "1px solid var(--border)", cursor: "pointer", fontSize: 13, fontWeight: 600, background: "transparent" };
const th: React.CSSProperties = { padding: "10px 12px", textAlign: "left", fontSize: 12, color: "var(--text-secondary)", textTransform: "uppercase", fontWeight: 600 };
const td: React.CSSProperties = { padding: "10px 12px", fontSize: 14, color: "var(--text)" };
const lbl: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 };
const inp: React.CSSProperties = { width: "100%", padding: "10px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 14, background: "var(--surface)", color: "var(--text)", boxSizing: "border-box" };
