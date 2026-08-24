import { useEffect, useRef, useState } from "react";
import api from "../lib/api";
import { uuidv4 } from "../lib/uuid";
import { useAuth } from "../contexts/AuthContext";

interface Accion { herramienta: string; input: Record<string, unknown>; }
interface Msg { role: "user" | "assistant"; content: string; acciones?: Accion[]; }
interface Conversacion { id: string; titulo: string; mensajes: Msg[]; actualizado: number; }
interface DimConsumo { estado: string; usado: number; limite: number | null; }

function textoError(detalle: any): string {
  if (typeof detalle === "string") return detalle;
  if (detalle?.error === "limite_excedido") return `Alcanzaste el límite de IA (${detalle.dimension}). Renová tu plan o esperá al próximo período.`;
  if (detalle?.mensaje) return detalle.mensaje;
  return "No se pudo obtener respuesta.";
}

const SUGERENCIAS: { texto: string; icon: string }[] = [
  { texto: "¿Cómo van las ventas de hoy?", icon: "fa-chart-line" },
  { texto: "¿Qué productos están por agotarse?", icon: "fa-boxes-stacked" },
  { texto: "¿Cuánto me deben en fiado?", icon: "fa-hand-holding-dollar" },
  { texto: "Resume las órdenes de compra pendientes", icon: "fa-file-invoice" },
];

const FUENTES = [
  { nombre: "Ventas & POS", icon: "fa-cash-register", color: "var(--primary)" },
  { nombre: "Inventario", icon: "fa-box-archive", color: "var(--success-text)" },
  { nombre: "Cobranza / Fiado", icon: "fa-hand-holding-dollar", color: "var(--warning-text)" },
  { nombre: "Compras", icon: "fa-truck-field", color: "#8b5cf6" },
];

function iniciales(nombre?: string): string {
  if (!nombre) return "TÚ";
  const p = nombre.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "TÚ";
  return (p.length === 1 ? p[0].slice(0, 2) : p[0][0] + p[p.length - 1][0]).toUpperCase();
}
function derivarTitulo(mensajes: Msg[]): string {
  const primera = mensajes.find((m) => m.role === "user")?.content?.trim() || "Nueva conversación";
  return primera.length > 60 ? primera.slice(0, 58) + "…" : primera;
}
function hace(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return "hace un momento";
  const m = Math.floor(s / 60); if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60); if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24); if (d < 7) return `hace ${d} d`;
  return new Date(ms).toLocaleDateString("es-GT", { day: "2-digit", month: "short" });
}

export default function AsistentePage() {
  const { empresa, user } = useAuth();
  const [disponible, setDisponible] = useState<boolean | null>(null);
  const [convs, setConvs] = useState<Conversacion[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [consumo, setConsumo] = useState<Record<string, DimConsumo> | null>(null);
  const [planSinIa, setPlanSinIa] = useState(false);
  const [cargado, setCargado] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Las conversaciones se guardan por empresa en el navegador.
  const convKey = empresa ? `ia_convs_${empresa.id}` : null;
  const bloqueado = disponible === false || planSinIa;

  useEffect(() => {
    if (!convKey || !empresa) return;
    try {
      const raw = localStorage.getItem(convKey);
      let list: Conversacion[] = raw ? JSON.parse(raw) : [];
      // Migración del formato viejo (una sola conversación plana).
      const oldRaw = localStorage.getItem(`ia_chat_${empresa.id}`);
      if (oldRaw && list.length === 0) {
        try {
          const old: Msg[] = JSON.parse(oldRaw);
          if (Array.isArray(old) && old.length) list = [{ id: uuidv4(), titulo: derivarTitulo(old), mensajes: old, actualizado: Date.now() }];
        } catch { /* ignora */ }
        localStorage.removeItem(`ia_chat_${empresa.id}`);
      }
      setConvs(list);
    } catch { setConvs([]); }
    setActiveId(null); setMsgs([]);
    setCargado(true);
  }, [convKey, empresa]);

  // Guarda/actualiza la conversación activa cuando cambian sus mensajes.
  useEffect(() => {
    if (!cargado || !activeId || msgs.length === 0) return;
    setConvs((prev) => {
      const titulo = derivarTitulo(msgs);
      const idx = prev.findIndex((c) => c.id === activeId);
      if (idx >= 0) { const copy = [...prev]; copy[idx] = { ...copy[idx], mensajes: msgs, titulo, actualizado: Date.now() }; return copy; }
      return [{ id: activeId, titulo, mensajes: msgs, actualizado: Date.now() }, ...prev];
    });
  }, [msgs, activeId, cargado]);

  // Persiste la lista de conversaciones.
  useEffect(() => {
    if (!cargado || !convKey) return;
    try { localStorage.setItem(convKey, JSON.stringify(convs.slice(0, 40))); } catch { /* cuota llena */ }
  }, [convs, cargado, convKey]);

  const nuevaConversacion = () => { setActiveId(null); setMsgs([]); if (taRef.current) taRef.current.style.height = "auto"; };
  const abrirConversacion = (c: Conversacion) => { setActiveId(c.id); setMsgs(c.mensajes); };
  const borrarConversacion = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConvs((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) { setActiveId(null); setMsgs([]); }
  };

  const cargarConsumo = () => {
    api.get("/ia/consumo")
      .then((r) => { setPlanSinIa(r.data?.motivo === "plan_sin_ia"); setConsumo(r.data?.dimensiones || null); })
      .catch(() => { setConsumo(null); setPlanSinIa(false); });
  };

  useEffect(() => {
    api.get("/ia/estado").then((r) => { setDisponible(r.data.disponible); }).catch(() => setDisponible(false));
    cargarConsumo();
  }, []);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [msgs, enviando]);

  const enviar = async (texto: string) => {
    const pregunta = texto.trim();
    if (!pregunta || enviando || bloqueado) return;
    if (!activeId) setActiveId(uuidv4()); // arranca una conversación nueva
    const historial = msgs.map((m) => ({ role: m.role, content: m.content }));
    setMsgs((prev) => [...prev, { role: "user", content: pregunta }]);
    setInput("");
    if (taRef.current) taRef.current.style.height = "auto";
    setEnviando(true);
    const idempotency_key = uuidv4();
    try {
      const { data } = await api.post("/ia/chat", { mensaje: pregunta, historial, idempotency_key });
      setMsgs((prev) => [...prev, { role: "assistant", content: data.respuesta, acciones: data.acciones }]);
    } catch (e: any) {
      setMsgs((prev) => [...prev, { role: "assistant", content: `⚠️ ${textoError(e.response?.data?.detail)}` }]);
    } finally { setEnviando(false); cargarConsumo(); }
  };

  const autoResize = () => { const ta = taRef.current; if (ta) { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 140) + "px"; } };
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(input); } };

  const reqDim = consumo?.requests;
  const subtitulo = disponible === false ? "No configurado" : planSinIa ? "Tu plan no incluye IA" : "Conectado";
  const ordenadas = [...convs].sort((a, b) => b.actualizado - a.actualizado);

  return (
    <div className="as-wrap">
      <style>{AS_CSS}</style>

      <div className="as-chat">
        <header className="as-header">
          <div className="as-title">
            <div className={`as-ai-avatar ${disponible ? "on" : ""}`}><i className="fas fa-robot" /></div>
            <div>
              <h1>Asistente IA</h1>
              <p>{disponible && <span className="as-status-dot" />}{subtitulo}</p>
            </div>
          </div>
          <div className="as-header-actions">
            <button className="as-icon-btn" onClick={nuevaConversacion} title="Nueva conversación"><i className="fas fa-plus" /></button>
          </div>
        </header>

        <div className="as-messages" ref={scrollRef}>
          {bloqueado && (
            <div className="as-banner" style={{ marginTop: 8 }}>
              <span>{planSinIa
                ? <>Tu plan actual no incluye el asistente con IA. Actualizá al plan <b>Pro</b> para activarlo.</>
                : "El asistente aún no está configurado (falta la clave de la API del proveedor). Avisale al administrador."}</span>
            </div>
          )}

          {reqDim && reqDim.limite != null && (reqDim.estado === "cerca" || reqDim.estado === "excedido") && (
            <div className="as-banner">
              <span style={{ background: reqDim.estado === "excedido" ? "var(--danger-bg)" : "var(--warning-bg)", color: reqDim.estado === "excedido" ? "var(--danger-text)" : "var(--warning-text)", border: "none" }}>
                <i className="fas fa-gauge-high" />{reqDim.estado === "excedido" ? "Agotaste tus consultas de IA de este período. Renová tu plan para seguir." : "Te estás acercando al límite de consultas de IA de tu plan."}
              </span>
            </div>
          )}

          {msgs.length === 0 ? (
            <div className="as-welcome">
              <div className="as-welcome-badge"><i className="fas fa-wand-magic-sparkles" /></div>
              <h2>¿En qué te ayudo hoy?</h2>
              <p>Preguntame en lenguaje natural sobre {empresa?.nombre || "tu negocio"}: ventas, inventario, cobranza o compras.</p>
              <div className="as-suggestions">
                {SUGERENCIAS.map((s) => (
                  <button key={s.texto} className="as-sugg" onClick={() => enviar(s.texto)} disabled={bloqueado}>
                    <span className="as-sugg-icon"><i className={`fas ${s.icon}`} /></span>
                    <span className="as-sugg-text">{s.texto}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : msgs.map((m, i) => (
            <div key={i} className={`as-msg ${m.role}`}>
              <div className={`as-msg-avatar ${m.role}`}>{m.role === "assistant" ? <i className="fas fa-robot" /> : iniciales(user?.nombre_completo || user?.username || undefined)}</div>
              <div className="as-msg-content">
                <div className="as-msg-name">{m.role === "assistant" ? "Asistente IA" : "Tú"}</div>
                <div className="as-bubble">
                  {m.content}
                  {m.acciones && m.acciones.length > 0 && (
                    <div className="as-tools">
                      {m.acciones.map((a, j) => (<span key={j} className="as-tool"><i className="fas fa-bolt" />{a.herramienta}</span>))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {enviando && (
            <div className="as-msg assistant">
              <div className="as-msg-avatar assistant"><i className="fas fa-robot" /></div>
              <div className="as-msg-content">
                <div className="as-msg-name">Asistente IA</div>
                <div className="as-bubble"><div className="as-typing"><span /><span /><span /></div></div>
              </div>
            </div>
          )}
        </div>

        <div className="as-input-area">
          <form className="as-input-wrap" onSubmit={(e) => { e.preventDefault(); enviar(input); }}>
            <textarea ref={taRef} rows={1} className="as-input" value={input}
              onChange={(e) => setInput(e.target.value)} onInput={autoResize} onKeyDown={onKeyDown}
              placeholder={planSinIa ? "Tu plan no incluye IA" : disponible === false ? "Asistente no disponible" : "Preguntame sobre tu negocio…"}
              disabled={bloqueado || enviando} />
            <button type="submit" className="as-send" disabled={bloqueado || enviando || !input.trim()}>
              <i className={`fas ${enviando ? "fa-circle-notch fa-spin" : "fa-paper-plane"}`} />
            </button>
          </form>
          <div className="as-input-meta">Presioná <kbd>Enter</kbd> para enviar · <kbd>Shift + Enter</kbd> para nueva línea</div>
        </div>
      </div>

      <aside className="as-panel">
        <div className="as-panel-title"><i className="fas fa-database" /> Fuentes de datos</div>
        {FUENTES.map((f) => (
          <div key={f.nombre} className="as-source">
            <div className="as-source-icon" style={{ background: "var(--bg)", color: f.color }}><i className={`fas ${f.icon}`} /></div>
            <div style={{ flex: 1 }}>
              <div className="as-source-name">{f.nombre}</div>
              <div className="as-source-status"><span className="as-dot" />Disponible</div>
            </div>
          </div>
        ))}

        {reqDim && reqDim.limite != null && (
          <>
            <div className="as-panel-title" style={{ marginTop: 26 }}><i className="fas fa-gauge-high" /> Consumo de IA</div>
            <div className="as-consumo">
              <div className="as-consumo-top"><span>Consultas este período</span><span className="as-consumo-num">{reqDim.usado}/{reqDim.limite}</span></div>
              <div className="as-bar"><div className="as-bar-fill" style={{ width: `${Math.min(100, (reqDim.usado / reqDim.limite) * 100)}%`, background: reqDim.estado === "excedido" ? "var(--danger)" : reqDim.estado === "cerca" ? "var(--warning-text)" : "var(--success-text)" }} /></div>
            </div>
          </>
        )}

        <div className="as-panel-title" style={{ marginTop: 26 }}><i className="fas fa-clock-rotate-left" /> Conversaciones</div>
        {ordenadas.length === 0 ? (
          <div className="as-empty-hist">Tus conversaciones guardadas aparecerán aquí.</div>
        ) : ordenadas.map((c) => (
          <div key={c.id} className={`as-history ${c.id === activeId ? "active" : ""}`} onClick={() => abrirConversacion(c)}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="as-history-title">{c.titulo}</div>
              <div className="as-history-meta">{hace(c.actualizado)} · {c.mensajes.filter((m) => m.role === "user").length} preguntas</div>
            </div>
            <button className="as-history-del" onClick={(e) => borrarConversacion(c.id, e)} title="Eliminar"><i className="fas fa-trash-can" /></button>
          </div>
        ))}
      </aside>
    </div>
  );
}

const AS_CSS = `
.as-wrap{display:flex;gap:20px;height:calc(100vh - 104px);animation:fadeIn .4s ease}
.as-chat{flex:1;min-width:0;display:flex;flex-direction:column;background:var(--bg-card);border:1px solid var(--border);border-radius:16px;overflow:hidden;box-shadow:var(--card-shadow)}

.as-header{display:flex;justify-content:space-between;align-items:center;padding:16px 24px;border-bottom:1px solid var(--border);flex-shrink:0}
.as-title{display:flex;align-items:center;gap:14px}
.as-ai-avatar{width:44px;height:44px;border-radius:13px;background:linear-gradient(135deg,var(--primary),#8b5cf6);display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px;position:relative;box-shadow:0 6px 16px rgba(99,102,241,.28);flex-shrink:0}
.as-ai-avatar.on::after{content:'';position:absolute;bottom:-1px;right:-1px;width:12px;height:12px;border-radius:50%;background:var(--success-text);border:2px solid var(--bg-card)}
.as-title h1{font-family:'Space Grotesk',sans-serif;font-size:18px;font-weight:800;letter-spacing:-.3px;color:var(--text);margin:0}
.as-title p{font-size:12px;color:var(--text-muted);margin-top:3px;display:flex;align-items:center;gap:7px}
.as-status-dot{width:7px;height:7px;border-radius:50%;background:var(--success-text);position:relative;flex-shrink:0}
.as-status-dot::after{content:'';position:absolute;inset:-3px;border-radius:50%;background:var(--success-text);opacity:.3;animation:asPulse 2s infinite}
@keyframes asPulse{0%{transform:scale(.8);opacity:.6}100%{transform:scale(2.2);opacity:0}}
.as-header-actions{display:flex;gap:8px}
.as-icon-btn{width:36px;height:36px;border-radius:10px;background:var(--bg);border:1px solid var(--border);cursor:pointer;color:var(--text-muted);display:flex;align-items:center;justify-content:center;transition:all .2s}
.as-icon-btn:hover{background:var(--primary-light);color:var(--primary);border-color:var(--primary)}

.as-messages{flex:1;overflow-y:auto;padding:26px 0;display:flex;flex-direction:column;gap:22px}
.as-messages::-webkit-scrollbar{width:6px}
.as-messages::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}

.as-banner{max-width:760px;width:100%;margin:0 auto 4px;padding:0 26px}
.as-banner>span{background:var(--primary-light);border:1px solid var(--border);color:var(--text);border-radius:12px;padding:12px 16px;font-size:13px;line-height:1.5;display:flex;gap:10px;align-items:center}
.as-banner>span>i{opacity:.8}

.as-welcome{max-width:640px;margin:auto;padding:0 26px;text-align:center;animation:fadeInUp .5s ease}
.as-welcome-badge{width:60px;height:60px;border-radius:18px;margin:0 auto 18px;background:linear-gradient(135deg,var(--primary),#8b5cf6);display:flex;align-items:center;justify-content:center;color:#fff;font-size:24px;box-shadow:0 10px 26px rgba(99,102,241,.3)}
.as-welcome h2{font-family:'Space Grotesk',sans-serif;font-size:27px;font-weight:800;background:linear-gradient(135deg,var(--primary),#8b5cf6);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:8px}
.as-welcome p{color:var(--text-muted);font-size:14.5px;margin-bottom:24px;line-height:1.5}
.as-suggestions{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
.as-sugg{display:flex;align-items:center;gap:12px;text-align:left;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px;cursor:pointer;transition:all .2s;font:inherit}
.as-sugg:hover:not(:disabled){border-color:var(--primary);background:var(--primary-light);transform:translateY(-2px);box-shadow:0 6px 16px rgba(99,102,241,.1)}
.as-sugg:disabled{opacity:.5;cursor:not-allowed}
.as-sugg-icon{width:36px;height:36px;border-radius:10px;background:var(--primary-light);color:var(--primary);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.as-sugg-text{font-size:13px;font-weight:600;color:var(--text)}

.as-msg{max-width:760px;width:100%;margin:0 auto;padding:0 26px;display:flex;gap:14px;animation:fadeInUp .35s ease}
.as-msg.user{flex-direction:row-reverse}
.as-msg-avatar{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:13px;font-weight:700;font-family:'Space Grotesk',sans-serif;color:#fff}
.as-msg-avatar.assistant{background:linear-gradient(135deg,var(--primary),#8b5cf6)}
.as-msg-avatar.user{background:linear-gradient(135deg,var(--success-text),#059669)}
.as-msg-content{flex:1;min-width:0}
.as-msg.user .as-msg-content{display:flex;flex-direction:column;align-items:flex-end}
.as-msg-name{font-size:12.5px;font-weight:700;margin-bottom:6px;color:var(--text)}
.as-bubble{background:var(--bg);border:1px solid var(--border);border-radius:2px 14px 14px 14px;padding:14px 18px;font-size:14px;line-height:1.6;color:var(--text);white-space:pre-wrap;word-break:break-word;max-width:100%}
.as-msg.user .as-bubble{background:var(--primary);color:#fff;border-color:var(--primary);border-radius:14px 2px 14px 14px;display:inline-block}
.as-tools{margin-top:10px;display:flex;flex-wrap:wrap;gap:6px}
.as-tool{font-size:11px;color:var(--text-muted);background:var(--surface);border:1px solid var(--border);border-radius:999px;padding:2px 9px;display:inline-flex;align-items:center;gap:4px}
.as-tool i{opacity:.6;font-size:9px}

.as-typing{display:flex;gap:5px;align-items:center;padding:4px 0}
.as-typing span{width:8px;height:8px;border-radius:50%;background:var(--text-muted);animation:asType 1.4s infinite}
.as-typing span:nth-child(2){animation-delay:.2s}
.as-typing span:nth-child(3){animation-delay:.4s}
@keyframes asType{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-6px);opacity:1}}

.as-input-area{padding:16px 24px 18px;border-top:1px solid var(--border);flex-shrink:0}
.as-input-wrap{max-width:760px;margin:0 auto;position:relative}
.as-input{width:100%;background:var(--bg);border:1.5px solid var(--border);border-radius:16px;padding:15px 60px 15px 18px;font-family:inherit;font-size:14px;color:var(--text);outline:none;resize:none;max-height:140px;line-height:1.5;box-sizing:border-box;transition:all .2s}
.as-input:focus{border-color:var(--primary);box-shadow:0 0 0 4px var(--primary-light)}
.as-input:disabled{opacity:.6}
.as-send{position:absolute;right:9px;bottom:9px;width:40px;height:40px;border-radius:12px;background:var(--primary);border:none;cursor:pointer;color:#fff;font-size:15px;display:flex;align-items:center;justify-content:center;transition:all .2s;box-shadow:0 4px 12px rgba(99,102,241,.3)}
.as-send:hover:not(:disabled){background:var(--primary-hover);transform:scale(1.05)}
.as-send:disabled{background:var(--border);color:var(--text-muted);cursor:not-allowed;box-shadow:none}
.as-input-meta{text-align:center;font-size:11px;color:var(--text-muted);margin-top:8px}
.as-input-meta kbd{background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:1px 5px;font-family:monospace;font-size:10px}

.as-panel{width:300px;flex-shrink:0;background:var(--bg-card);border:1px solid var(--border);border-radius:16px;padding:22px;overflow-y:auto;box-shadow:var(--card-shadow)}
.as-panel::-webkit-scrollbar{width:6px}
.as-panel::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}
.as-panel-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:14px;display:flex;align-items:center;gap:8px}
.as-panel-title i{color:var(--primary)}
.as-source{background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:8px;display:flex;align-items:center;gap:12px}
.as-source-icon{width:32px;height:32px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;border:1px solid var(--border)}
.as-source-name{font-size:13px;font-weight:600;color:var(--text)}
.as-source-status{font-size:11px;color:var(--text-muted);display:flex;align-items:center;gap:5px;margin-top:1px}
.as-dot{width:6px;height:6px;border-radius:50%;background:var(--success-text)}
.as-consumo{background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:14px}
.as-consumo-top{display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--text-muted);margin-bottom:10px}
.as-consumo-num{font-family:'Space Grotesk',sans-serif;font-weight:700;color:var(--text)}
.as-bar{width:100%;height:6px;background:var(--border-light);border-radius:4px;overflow:hidden}
.as-bar-fill{height:100%;border-radius:4px;transition:width .3s ease}
.as-empty-hist{font-size:12.5px;color:var(--text-muted);line-height:1.5;padding:4px 2px}
.as-history{position:relative;display:flex;align-items:center;gap:8px;padding:11px 12px;padding-right:30px;border-radius:10px;cursor:pointer;transition:background .2s;border:1px solid transparent}
.as-history:hover{background:var(--bg)}
.as-history.active{background:var(--primary-light);border-color:var(--primary)}
.as-history-title{font-size:13px;font-weight:600;color:var(--text);line-height:1.35;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.as-history-meta{font-size:11px;color:var(--text-muted);margin-top:3px}
.as-history-del{position:absolute;right:8px;top:50%;transform:translateY(-50%);width:24px;height:24px;border-radius:7px;border:none;background:transparent;color:var(--text-muted);cursor:pointer;opacity:0;transition:all .18s;display:flex;align-items:center;justify-content:center;font-size:11px}
.as-history:hover .as-history-del{opacity:1}
.as-history-del:hover{background:var(--danger-bg);color:var(--danger-text)}

@media(max-width:1180px){.as-panel{display:none}}
@media(max-width:900px){.as-wrap{height:calc(100vh - 84px);gap:0}.as-suggestions{grid-template-columns:1fr}.as-msg,.as-banner{padding:0 16px}.as-header{padding:14px 18px}.as-input-area{padding:14px 16px}}
`;
