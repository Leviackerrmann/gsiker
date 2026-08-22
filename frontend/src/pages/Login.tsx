import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../components/Toast";
import { useNodeNetwork, AUTH_CSS } from "../lib/authUi";
import { PAISES } from "../lib/authShell";
import api from "../lib/api";

// Extras sobre AUTH_CSS: botón Google, separador y fila de teléfono en el login.
const LOGIN_EXTRA_CSS = `
.nlogin .g-btn{width:100%;height:50px;border:1.5px solid var(--nl-border);background:#fff;color:#1f2937;border-radius:12px;font-weight:700;font-size:14px;display:flex;align-items:center;justify-content:center;gap:9px;cursor:pointer;transition:background .2s,transform .15s;font-family:inherit}
.nlogin .g-btn:hover{background:#f8fafc;transform:translateY(-1px)}
.nlogin .sep{display:flex;align-items:center;gap:12px;color:var(--nl-muted2);font-size:12px;margin:18px 0;text-transform:none}
.nlogin .sep::before,.nlogin .sep::after{content:"";flex:1;height:1px;background:var(--nl-border)}
.nlogin .phone-row{display:flex;gap:10px}
.nlogin .phone-row .cc{flex:0 0 130px}
.nlogin .linkbtn{background:none;border:none;color:var(--nl-accent);font-weight:700;cursor:pointer;font-family:inherit;font-size:14px;padding:6px 0}
.nlogin .linkbtn:hover{color:var(--nl-accent-h)}
.nlogin .center{text-align:center;margin-top:8px}
`;

export default function Login() {
  const navigate = useNavigate();
  const toast = useToast();
  const { login } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useNodeNetwork(canvasRef);

  const [registroHabilitado, setRegistroHabilitado] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);

  // Acceso por teléfono (mismo flujo que el registro).
  const [paisCode, setPaisCode] = useState("GT");
  const [telefono, setTelefono] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  // Acceso legacy por usuario + contraseña (operadores / cuentas antiguas).
  const [modoPassword, setModoPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get("/auth/registration-status")
      .then((r) => { setRegistroHabilitado(Boolean(r.data?.enabled)); setGoogleEnabled(Boolean(r.data?.google_enabled)); })
      .catch(() => { setRegistroHabilitado(false); setGoogleEnabled(false); });
    try {
      const saved = localStorage.getItem("inv-remember");
      if (saved) { const d = JSON.parse(saved); setUsername(d.u || ""); if (d.r) setRememberMe(true); }
    } catch { /* ignora */ }
  }, []);

  const pais = useMemo(() => PAISES.find((p) => p.code === paisCode) || PAISES[0], [paisCode]);
  const digitos = telefono.replace(/\D/g, "");

  const enviarCodigo = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (digitos.length < 7) return setError("Ingresa un número de teléfono válido.");
    setEnviando(true);
    try {
      const { data } = await api.post("/auth/phone/send-code", { country_code: pais.dial, phone_number: digitos });
      navigate("/register/verify", { state: { phone: data.phone_number, devCode: data.dev_code ?? null } });
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail || "No se pudo enviar el código. Intenta de nuevo.");
      setEnviando(false);
    }
  };

  const continuarConGoogle = () => {
    setError(googleEnabled
      ? "Google aún no está configurado en este entorno."
      : "El inicio de sesión con Google estará disponible muy pronto. Usa tu teléfono por ahora.");
  };

  const loginPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return toast.error("Ingresa tu usuario");
    if (!password) return toast.error("Ingresa tu contraseña");
    setLoading(true);
    try {
      await login(username, password);
      if (rememberMe) localStorage.setItem("inv-remember", JSON.stringify({ u: username, r: true }));
      else localStorage.removeItem("inv-remember");
      navigate("/dashboard");
    } catch {
      toast.error("Credenciales inválidas");
      setLoading(false);
    }
  };

  return (
    <div className="nlogin">
      <style>{AUTH_CSS}{LOGIN_EXTRA_CSS}</style>
      <div className="container">
        {/* Panel visual (marca) */}
        <aside className="visual-panel">
          <canvas ref={canvasRef} id="nlCanvas" />
          <div className="grid-bg" />
          <div className="orb orb-1" />
          <div className="orb orb-2" />
          <div className="visual-content">
            <div className="brand-logo fade-up d-1">
              <div className="logo-icon">g</div>
              <div className="logo-text">gsiker</div>
            </div>
            <div className="hero-text fade-up d-2">
              <div className="badge">
                <span style={{ width: 6, height: 6, background: "var(--nl-accent-l)", borderRadius: "50%", display: "inline-block" }} />
                <span>Potenciado con Inteligencia Artificial</span>
              </div>
              <h1>Administra tu negocio <span>sin complicaciones</span>.</h1>
              <p>Ventas, inventario y cobranza en un solo lugar — con un asistente de IA que responde cómo va tu negocio, cuando quieras.</p>
            </div>
            <div className="features-grid fade-up d-3">
              <div className="feature-item">
                <div className="feature-icon"><i className="fa-solid fa-cash-register" /></div>
                <h4>Punto de Venta</h4><p>Cobra rápido, al contado o al fiado</p>
              </div>
              <div className="feature-item">
                <div className="feature-icon"><i className="fa-solid fa-boxes-stacked" /></div>
                <h4>Inventario</h4><p>Controla tu stock en tiempo real</p>
              </div>
              <div className="feature-item">
                <div className="feature-icon"><i className="fa-solid fa-robot" /></div>
                <h4>Asistente IA</h4><p>Pregúntale cómo va tu negocio</p>
              </div>
            </div>
          </div>
        </aside>

        {/* Panel del formulario */}
        <section className="form-panel">
          <div className="form-container">
            <div className="form-header fade-up d-1">
              <h2>Bienvenido de vuelta</h2>
              <p>Entra a tu negocio en gsiker.</p>
            </div>

            {error && <div className="err-box fade-up"><i className="fa-solid fa-circle-exclamation" /> {error}</div>}

            {!modoPassword ? (
              <div className="fade-up d-2">
                <button type="button" className="g-btn" onClick={continuarConGoogle}>
                  <i className="fa-brands fa-google" style={{ color: "#ea4335" }} /> Continuar con Google
                  {!googleEnabled && <span style={{ fontSize: 11, color: "var(--nl-muted2)", fontWeight: 600 }}>· Pronto</span>}
                </button>

                <div className="sep">o con tu teléfono</div>

                <form onSubmit={enviarCodigo} noValidate>
                  <div className="input-group">
                    <label htmlFor="tel">Número de WhatsApp</label>
                    <div className="phone-row">
                      <div className="input-wrap cc">
                        <select value={paisCode} onChange={(e) => setPaisCode(e.target.value)} aria-label="País">
                          {PAISES.map((p) => <option key={p.code} value={p.code}>{p.flag} {p.dial}</option>)}
                        </select>
                        <i className="fa-solid fa-chevron-down select-chev" />
                      </div>
                      <div className="input-wrap" style={{ flex: 1 }}>
                        <input id="tel" type="tel" inputMode="numeric" autoFocus placeholder="5555 1234"
                          value={telefono} onChange={(e) => setTelefono(e.target.value)} />
                        <i className="fa-solid fa-phone input-icon" />
                      </div>
                    </div>
                  </div>

                  <button type="submit" className="btn-submit" disabled={enviando || digitos.length < 7}>
                    {enviando ? <><span className="nl-loader" /><span>Enviando…</span></> : <><i className="fa-brands fa-whatsapp" /><span>Enviar código</span></>}
                  </button>
                </form>

                <div className="center">
                  <button type="button" className="linkbtn" onClick={() => { setModoPassword(true); setError(""); }}>
                    Entrar con usuario y contraseña
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={loginPassword} noValidate className="fade-up d-2">
                <div className="input-group">
                  <label htmlFor="usuario">Usuario</label>
                  <div className="input-wrap">
                    <input id="usuario" type="text" autoComplete="username" autoFocus placeholder="Tu usuario"
                      value={username} onChange={(e) => setUsername(e.target.value)} />
                    <i className="fa-solid fa-user input-icon" />
                  </div>
                </div>
                <div className="input-group">
                  <label htmlFor="password">Contraseña</label>
                  <div className="input-wrap">
                    <input id="password" type={showPassword ? "text" : "password"} autoComplete="current-password"
                      placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
                    <i className="fa-solid fa-lock input-icon" />
                    <button type="button" className="pwd-toggle" aria-label="Mostrar contraseña" onClick={() => setShowPassword((v) => !v)}>
                      <i className={`fa-solid ${showPassword ? "fa-eye-slash" : "fa-eye"}`} />
                    </button>
                  </div>
                </div>
                <div className="options-row">
                  <label className="remember-me">
                    <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
                    <span className="checkmark"><i className="fa-solid fa-check" /></span>
                    <span>Recordarme</span>
                  </label>
                  <button type="button" className="forgot-link" onClick={() => toast.info("Contacta al administrador para restablecer tu contraseña.")}>
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>
                <button type="submit" className="btn-submit" disabled={loading}>
                  {loading ? <><span className="nl-loader" /><span>Verificando…</span></> : <><span>Iniciar sesión</span><i className="fa-solid fa-arrow-right-to-bracket" /></>}
                </button>
                <div className="center">
                  <button type="button" className="linkbtn" onClick={() => { setModoPassword(false); setError(""); }}>
                    ← Volver a teléfono / Google
                  </button>
                </div>
              </form>
            )}

            {registroHabilitado && (
              <div className="signup-row fade-up d-5">
                ¿No tienes cuenta? <Link to="/register">Regístrate gratis</Link>
              </div>
            )}

            <div className="form-footer">© {new Date().getFullYear()} gsiker · v1.0</div>
          </div>
        </section>
      </div>
    </div>
  );
}
