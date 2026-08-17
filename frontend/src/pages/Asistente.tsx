import { useEffect, useRef, useState } from "react";
import api from "../lib/api";
import { uuidv4 } from "../lib/uuid";
import { useAuth } from "../contexts/AuthContext";

interface Accion { herramienta: string; input: Record<string, unknown>; }
interface Msg { role: "user" | "assistant"; content: string; acciones?: Accion[]; }
interface DimConsumo { estado: string; usado: number; limite: number | null; }

function textoError(detalle: any): string {
  if (typeof detalle === "string") return detalle;
  if (detalle?.error === "limite_excedido") return `Alcanzaste el límite de IA (${detalle.dimension}). Renová tu plan o esperá al próximo período.`;
  if (detalle?.mensaje) return detalle.mensaje;
  return "No se pudo obtener respuesta.";
}

const SUGERENCIAS = [
  "¿Cómo van las ventas de hoy?",
  "¿Qué productos están por agotarse?",
  "¿Cuánto me deben en fiado?",
];

export default function AsistentePage() {
  const { empresa } = useAuth();
  const [disponible, setDisponible] = useState<boolean | null>(null);
  const [modelo, setModelo] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [consumo, setConsumo] = useState<Record<string, DimConsumo> | null>(null);
  const [planSinIa, setPlanSinIa] = useState(false);
  const [cargado, setCargado] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // El historial se conserva por empresa en el navegador: no se pierde al
  // cambiar de sección ni al recargar (hasta que el usuario lo limpie).
  const storageKey = empresa ? `ia_chat_${empresa.id}` : null;

  useEffect(() => {
    if (!storageKey) return;
    try {
      const guardado = localStorage.getItem(storageKey);
      setMsgs(guardado ? JSON.parse(guardado) : []);
    } catch { setMsgs([]); }
    setCargado(true);
  }, [storageKey]);

  useEffect(() => {
    if (!cargado || !storageKey) return;
    try { localStorage.setItem(storageKey, JSON.stringify(msgs.slice(-50))); } catch { /* cuota llena */ }
  }, [msgs, cargado, storageKey]);

  const limpiar = () => {
    setMsgs([]);
    if (storageKey) localStorage.removeItem(storageKey);
  };

  const cargarConsumo = () => {
    api.get("/ia/consumo")
      .then((r) => {
        setPlanSinIa(r.data?.motivo === "plan_sin_ia");
        setConsumo(r.data?.dimensiones || null);
      })
      .catch(() => { setConsumo(null); setPlanSinIa(false); });
  };

  useEffect(() => {
    api.get("/ia/estado")
      .then((r) => { setDisponible(r.data.disponible); setModelo(r.data.modelo); })
      .catch(() => setDisponible(false));
    cargarConsumo();
  }, []);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [msgs, enviando]);

  const enviar = async (texto: string) => {
    const pregunta = texto.trim();
    if (!pregunta || enviando) return;
    const historial = msgs.map((m) => ({ role: m.role, content: m.content }));
    setMsgs((prev) => [...prev, { role: "user", content: pregunta }]);
    setInput("");
    setEnviando(true);
    // Clave de idempotencia POR ENVÍO. Sin reintento automático: si falla, el
    // usuario reenvía a mano (genera una clave nueva) y no pierde una respuesta cobrada.
    const idempotency_key = uuidv4();
    try {
      const { data } = await api.post("/ia/chat", { mensaje: pregunta, historial, idempotency_key });
      setMsgs((prev) => [...prev, { role: "assistant", content: data.respuesta, acciones: data.acciones }]);
    } catch (e: any) {
      setMsgs((prev) => [...prev, { role: "assistant", content: `⚠️ ${textoError(e.response?.data?.detail)}` }]);
    } finally {
      setEnviando(false);
      cargarConsumo();
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 120px)", maxWidth: 820, margin: "0 auto" }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 34, height: 34, borderRadius: 9, background: "linear-gradient(135deg, var(--accent-grad-start, #6366f1), var(--accent-grad-end, #8b5cf6))", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
              <i className="fas fa-wand-magic-sparkles" style={{ fontSize: 15 }} />
            </span>
            Asistente IA
          </h2>
          {msgs.length > 0 && (
            <button onClick={limpiar} title="Borrar la conversación guardada"
              style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--text-secondary)", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 13 }}>
              <i className="fas fa-trash-can" style={{ marginRight: 6 }} />Limpiar
            </button>
          )}
        </div>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>
          Pregunta en lenguaje natural sobre tu negocio: ventas, inventario y cobranza.
          {modelo && <span style={{ color: "var(--text-muted)" }}> · {modelo}</span>}
        </p>
      </div>

      {disponible === false && (
        <div style={{ ...card, background: "var(--warning-bg, #fffbeb)", border: "1px solid var(--warning, #f59e0b)", color: "var(--warning-text, #92400e)", marginBottom: 12 }}>
          <i className="fas fa-triangle-exclamation" style={{ marginRight: 8 }} />
          El asistente aún no está configurado (falta la clave de la API de Claude). Avísale al administrador para activarlo.
        </div>
      )}

      {planSinIa && (
        <div style={{ ...card, background: "#eef2ff", border: "1px solid #c7d2fe", color: "#3730a3", marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
          <i className="fas fa-wand-magic-sparkles" />
          <span>Tu plan actual no incluye el asistente con IA. Actualizá al plan <b>Pro</b> para activarlo.</span>
        </div>
      )}

      {consumo?.requests && consumo.requests.limite != null && (
        <div style={{ marginBottom: 12 }}>
          {(consumo.requests.estado === "cerca" || consumo.requests.estado === "excedido") && (
            <div style={{ ...card, padding: "8px 14px", marginBottom: 8, fontSize: 13,
              background: consumo.requests.estado === "excedido" ? "#fef2f2" : "#fffbeb",
              color: consumo.requests.estado === "excedido" ? "#b91c1c" : "#92400e",
              border: `1px solid ${consumo.requests.estado === "excedido" ? "#fecaca" : "#fde68a"}` }}>
              <i className="fas fa-gauge-high" style={{ marginRight: 8 }} />
              {consumo.requests.estado === "excedido"
                ? "Agotaste tus consultas de IA de este período. Renová tu plan para seguir."
                : "Te estás acercando al límite de consultas de IA de tu plan."}
            </div>
          )}
          <div style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 8 }}>
            <span>Consultas IA: {consumo.requests.usado}/{consumo.requests.limite}</span>
            <div style={{ flex: 1, maxWidth: 160, height: 5, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.min(100, (consumo.requests.usado / consumo.requests.limite) * 100)}%`,
                background: consumo.requests.estado === "excedido" ? "#dc2626" : consumo.requests.estado === "cerca" ? "#f59e0b" : "#16a34a" }} />
            </div>
          </div>
        </div>
      )}

      <div ref={scrollRef} style={{ ...card, flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
        {msgs.length === 0 ? (
          <div style={{ margin: "auto", textAlign: "center", color: "var(--text-muted)", maxWidth: 420 }}>
            <div style={{ fontSize: 34, marginBottom: 10, opacity: 0.5 }}><i className="fas fa-comments" /></div>
            <p style={{ marginBottom: 16, fontSize: 14 }}>Hazme una pregunta sobre {empresa?.nombre || "tu negocio"}.</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
              {SUGERENCIAS.map((s) => (
                <button key={s} onClick={() => enviar(s)} disabled={disponible === false || planSinIa} style={chip}>{s}</button>
              ))}
            </div>
          </div>
        ) : msgs.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "78%", padding: "10px 14px", borderRadius: 14, fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap",
              background: m.role === "user" ? "var(--primary)" : "var(--bg-subtle, #f3f4f6)",
              color: m.role === "user" ? "#fff" : "var(--text)",
              borderBottomRightRadius: m.role === "user" ? 4 : 14,
              borderBottomLeftRadius: m.role === "user" ? 14 : 4,
            }}>
              {m.content}
              {m.acciones && m.acciones.length > 0 && (
                <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {m.acciones.map((a, j) => (
                    <span key={j} style={{ fontSize: 11, color: "var(--text-muted)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 999, padding: "2px 8px" }}>
                      <i className="fas fa-bolt" style={{ marginRight: 4, opacity: 0.6 }} />{a.herramienta}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {enviando && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div style={{ padding: "10px 14px", borderRadius: 14, background: "var(--bg-subtle, #f3f4f6)", color: "var(--text-muted)", fontSize: 14 }}>
              <i className="fas fa-circle-notch fa-spin" style={{ marginRight: 8 }} />Pensando…
            </div>
          </div>
        )}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); enviar(input); }} style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input value={input} onChange={(e) => setInput(e.target.value)}
          placeholder={planSinIa ? "Tu plan no incluye IA" : disponible === false ? "Asistente no disponible" : "Escribe tu pregunta…"}
          disabled={disponible === false || planSinIa || enviando} style={inp} />
        <button type="submit" disabled={disponible === false || planSinIa || enviando || !input.trim()} style={{
          ...btnPri, background: !input.trim() || disponible === false || planSinIa ? "var(--border)" : "var(--primary)",
          cursor: !input.trim() || disponible === false || planSinIa ? "not-allowed" : "pointer", minWidth: 48,
        }}>
          <i className="fas fa-paper-plane" />
        </button>
      </form>
    </div>
  );
}

const card: React.CSSProperties = { background: "var(--surface)", padding: 18, borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow)" };
const btnPri: React.CSSProperties = { padding: "0 16px", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 15, fontWeight: 600 };
const chip: React.CSSProperties = { padding: "8px 14px", borderRadius: 999, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-secondary)", cursor: "pointer", fontSize: 13 };
const inp: React.CSSProperties = { flex: 1, padding: "12px 14px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 14, background: "var(--surface)", color: "var(--text)", boxSizing: "border-box" };
