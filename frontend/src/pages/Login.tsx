import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../components/Toast";
import { useNodeNetwork, AUTH_CSS } from "../lib/authUi";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useNodeNetwork(canvasRef);

  // Prefill "recordar usuario" (mismo formato que usaba el login anterior).
  useEffect(() => {
    try {
      const saved = localStorage.getItem("inv-remember");
      if (saved) {
        const data = JSON.parse(saved);
        setUsername(data.u || "");
        if (data.r) setRememberMe(true);
      }
    } catch {}
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) { toast.error("Ingresa tu usuario"); return; }
    if (!password) { toast.error("Ingresa tu contraseña"); return; }
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
      <style>{AUTH_CSS}</style>
      <div className="container">
        {/* Panel visual */}
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
                <h4>Punto de Venta</h4>
                <p>Cobra rápido, al contado o al fiado</p>
              </div>
              <div className="feature-item">
                <div className="feature-icon"><i className="fa-solid fa-boxes-stacked" /></div>
                <h4>Inventario</h4>
                <p>Controla tu stock en tiempo real</p>
              </div>
              <div className="feature-item">
                <div className="feature-icon"><i className="fa-solid fa-robot" /></div>
                <h4>Asistente IA</h4>
                <p>Pregúntale cómo va tu negocio</p>
              </div>
            </div>
          </div>
        </aside>

        {/* Panel del formulario */}
        <section className="form-panel">
          <div className="form-container">
            <div className="form-header fade-up d-1">
              <h2>Iniciar sesión</h2>
              <p>Ingresa tus credenciales para administrar tu negocio.</p>
            </div>

            <form onSubmit={handleSubmit} noValidate>
              <div className="input-group fade-up d-2">
                <label htmlFor="usuario">Usuario</label>
                <div className="input-wrap">
                  <input
                    id="usuario" type="text" value={username} autoComplete="username" autoFocus
                    placeholder="Tu usuario" onChange={(e) => setUsername(e.target.value)}
                  />
                  <i className="fa-solid fa-user input-icon" />
                </div>
              </div>

              <div className="input-group fade-up d-3">
                <label htmlFor="password">Contraseña</label>
                <div className="input-wrap">
                  <input
                    id="password" type={showPassword ? "text" : "password"} value={password}
                    autoComplete="current-password" placeholder="••••••••"
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <i className="fa-solid fa-lock input-icon" />
                  <button type="button" className="pwd-toggle" aria-label="Mostrar contraseña" onClick={() => setShowPassword((v) => !v)}>
                    <i className={`fa-solid ${showPassword ? "fa-eye-slash" : "fa-eye"}`} />
                  </button>
                </div>
              </div>

              <div className="options-row fade-up d-4">
                <label className="remember-me">
                  <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
                  <span className="checkmark"><i className="fa-solid fa-check" /></span>
                  <span>Recordarme</span>
                </label>
                <button type="button" className="forgot-link" onClick={() => toast.info("Contacta al administrador para restablecer tu contraseña.")}>
                  ¿Olvidaste tu contraseña?
                </button>
              </div>

              <button type="submit" className="btn-submit fade-up d-4" disabled={loading}>
                {loading ? (
                  <><span className="nl-loader" /><span>Verificando…</span></>
                ) : (
                  <><span>Iniciar sesión</span><i className="fa-solid fa-arrow-right-to-bracket" /></>
                )}
              </button>

              <div className="signup-row fade-up d-5">
                ¿No tienes cuenta? <Link to="/register">Regístrala gratis</Link>
              </div>
            </form>

            <div className="form-footer">© {new Date().getFullYear()} gsiker · v1.0</div>
          </div>
        </section>
      </div>
    </div>
  );
}
