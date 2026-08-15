import { useEffect, useRef, useState } from "react";
import api from "../lib/api";
import { useAuth } from "../contexts/AuthContext";

interface Accion { herramienta: string; input: Record<string, unknown>; }
interface Msg { role: "user" | "assistant"; content: string; acciones?: Accion[]; }

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
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get("/ia/estado")
      .then((r) => { setDisponible(r.data.disponible); setModelo(r.data.modelo); })
      .catch(() => setDisponible(false));
  }, []);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [msgs, enviando]);

  const enviar = async (texto: string) => {
    const pregunta = texto.trim();
    if (!pregunta || enviando) return;
    const historial = msgs.map((m) => ({ role: m.role, content: m.content }));
    setMsgs((prev) => [...prev, { role: "user", content: pregunta }]);
    setInput("");
    setEnviando(true);
    try {
      const { data } = await api.post("/ia/chat", { mensaje: pregunta, historial });
      setMsgs((prev) => [...prev, { role: "assistant", content: data.respuesta, acciones: data.acciones }]);
    } catch (e: any) {
      const detalle = e.response?.data?.detail || "No se pudo obtener respuesta.";
      setMsgs((prev) => [...prev, { role: "assistant", content: `⚠️ ${detalle}` }]);
    } finally { setEnviando(false); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 120px)", maxWidth: 820, margin: "0 auto" }}>
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 34, height: 34, borderRadius: 9, background: "linear-gradient(135deg, var(--accent-grad-start, #6366f1), var(--accent-grad-end, #8b5cf6))", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
            <i className="fas fa-wand-magic-sparkles" style={{ fontSize: 15 }} />
          </span>
          Asistente IA
        </h2>
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

      <div ref={scrollRef} style={{ ...card, flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
        {msgs.length === 0 ? (
          <div style={{ margin: "auto", textAlign: "center", color: "var(--text-muted)", maxWidth: 420 }}>
            <div style={{ fontSize: 34, marginBottom: 10, opacity: 0.5 }}><i className="fas fa-comments" /></div>
            <p style={{ marginBottom: 16, fontSize: 14 }}>Hazme una pregunta sobre {empresa?.nombre || "tu negocio"}.</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
              {SUGERENCIAS.map((s) => (
                <button key={s} onClick={() => enviar(s)} disabled={disponible === false} style={chip}>{s}</button>
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
          placeholder={disponible === false ? "Asistente no disponible" : "Escribe tu pregunta…"}
          disabled={disponible === false || enviando} style={inp} />
        <button type="submit" disabled={disponible === false || enviando || !input.trim()} style={{
          ...btnPri, background: !input.trim() || disponible === false ? "var(--border)" : "var(--primary)",
          cursor: !input.trim() || disponible === false ? "not-allowed" : "pointer", minWidth: 48,
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
