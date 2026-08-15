import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useNodeNetwork, AUTH_CSS } from "../lib/authUi";
import api from "../lib/api";
import type { RegimenFiscal } from "../types";

export default function Register() {
  const [empresaNombre, setEmpresaNombre] = useState("");
  const [nit, setNit] = useState("");
  const [regimen, setRegimen] = useState<RegimenFiscal>("general");
  const [nombreCompleto, setNombreCompleto] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // null = aún consultando; false = registro cerrado; true = habilitado.
  const [habilitado, setHabilitado] = useState<boolean | null>(null);
  const { registerEmpresa } = useAuth();
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useNodeNetwork(canvasRef);

  useEffect(() => {
    api.get("/auth/registration-status")
      .then((r) => setHabilitado(Boolean(r.data?.enabled)))
      .catch(() => setHabilitado(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!empresaNombre.trim()) return setError("Ingresa el nombre de tu negocio");
    if (!nombreCompleto.trim()) return setError("Ingresa tu nombre");
    if (!username.trim()) return setError("Elige un usuario");
    if (password.length < 6) return setError("La contraseña debe tener al menos 6 caracteres");

    setLoading(true);
    try {
      await registerEmpresa({
        empresa_nombre: empresaNombre.trim(),
        nit: nit.trim() || undefined,
        regimen_fiscal: regimen,
        admin_nombre_completo: nombreCompleto.trim(),
        admin_username: username.trim(),
        admin_password: password,
      });
      navigate("/dashboard");
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "No se pudo crear el negocio";
      setError(detail);
      setLoading(false);
    }
  };

  // Mientras se consulta el estado, evitamos parpadear el formulario.
  if (habilitado === null) {
    return (
      <div className="nlogin">
        <style>{AUTH_CSS}</style>
        <div className="container" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span className="nl-loader" />
        </div>
      </div>
    );
  }

  // Registro cerrado: el sistema está en preparación. Aunque alguien llegue
  // directo a /register, el backend igual rechaza el alta con 403.
  if (habilitado === false) {
    return (
      <div className="nlogin">
        <style>{AUTH_CSS}</style>
        <div className="container" style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div className="form-container" style={{ textAlign: "center", maxWidth: 440 }}>
            <div className="brand-logo fade-up d-1" style={{ justifyContent: "center", marginBottom: 24 }}>
              <div className="logo-icon">g</div>
              <div className="logo-text">gsiker</div>
            </div>
            <div className="feature-icon fade-up d-1" style={{ margin: "0 auto 16px", width: 56, height: 56, fontSize: 22 }}>
              <i className="fa-solid fa-lock" />
            </div>
            <h2 className="fade-up d-2" style={{ marginBottom: 8 }}>Registro no disponible</h2>
            <p className="fade-up d-2" style={{ color: "var(--nl-text-dim, #64748b)", marginBottom: 24 }}>
              El registro de nuevos negocios está deshabilitado temporalmente mientras terminamos de preparar gsiker. Muy pronto podrás crear tu cuenta.
            </p>
            <div className="signup-row fade-up d-3">
              ¿Ya tienes cuenta? <Link to="/login">Inicia sesión</Link>
            </div>
            <div className="form-footer" style={{ marginTop: 24 }}>© {new Date().getFullYear()} gsiker · v1.0</div>
          </div>
        </div>
      </div>
    );
  }

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
                <span>Empieza gratis, sin tarjeta</span>
              </div>
              <h1>Digitaliza tu negocio en <span>un minuto</span>.</h1>
              <p>Crea tu cuenta y empieza a vender, controlar tu inventario y llevar tu cobranza — con un asistente de IA de tu lado.</p>
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
              <h2>Crea tu negocio</h2>
              <p>Configura gsiker en un minuto y empieza a operar hoy mismo.</p>
            </div>

            <form onSubmit={handleSubmit} noValidate>
              <div className="section-label fade-up d-2">Datos del negocio</div>

              <div className="input-group fade-up d-2">
                <label htmlFor="empresa">Nombre del negocio</label>
                <div className="input-wrap">
                  <input id="empresa" type="text" value={empresaNombre} autoFocus
                    placeholder="Mi Tienda" onChange={(e) => setEmpresaNombre(e.target.value)} />
                  <i className="fa-solid fa-store input-icon" />
                </div>
              </div>

              <div className="form-row fade-up d-2">
                <div className="input-group">
                  <label htmlFor="nit">NIT (opcional)</label>
                  <div className="input-wrap">
                    <input id="nit" type="text" value={nit}
                      placeholder="CF / 1234567-8" onChange={(e) => setNit(e.target.value)} />
                    <i className="fa-solid fa-id-card input-icon" />
                  </div>
                </div>
                <div className="input-group">
                  <label htmlFor="regimen">Régimen fiscal</label>
                  <div className="input-wrap">
                    <select id="regimen" value={regimen} onChange={(e) => setRegimen(e.target.value as RegimenFiscal)}>
                      <option value="general">General (IVA 12%)</option>
                      <option value="pequeno_contribuyente">Pequeño Contribuyente (5%)</option>
                    </select>
                    <i className="fa-solid fa-chevron-down select-chev" />
                  </div>
                </div>
              </div>

              <div className="section-label mt fade-up d-3">Tu cuenta de administrador</div>

              <div className="input-group fade-up d-3">
                <label htmlFor="nombre">Nombre completo</label>
                <div className="input-wrap">
                  <input id="nombre" type="text" value={nombreCompleto}
                    placeholder="Juan Pérez" onChange={(e) => setNombreCompleto(e.target.value)} />
                  <i className="fa-solid fa-user input-icon" />
                </div>
              </div>

              <div className="input-group fade-up d-3">
                <label htmlFor="usuario">Usuario</label>
                <div className="input-wrap">
                  <input id="usuario" type="text" value={username} autoComplete="username"
                    placeholder="juanperez" onChange={(e) => setUsername(e.target.value)} />
                  <i className="fa-solid fa-at input-icon" />
                </div>
              </div>

              <div className="input-group fade-up d-4">
                <label htmlFor="password">Contraseña</label>
                <div className="input-wrap">
                  <input id="password" type={showPassword ? "text" : "password"} value={password}
                    autoComplete="new-password" placeholder="Mínimo 6 caracteres"
                    onChange={(e) => setPassword(e.target.value)} />
                  <i className="fa-solid fa-lock input-icon" />
                  <button type="button" className="pwd-toggle" aria-label="Mostrar contraseña" onClick={() => setShowPassword((v) => !v)}>
                    <i className={`fa-solid ${showPassword ? "fa-eye-slash" : "fa-eye"}`} />
                  </button>
                </div>
              </div>

              {error && (
                <div className="err-box fade-up"><i className="fa-solid fa-circle-exclamation" /> {error}</div>
              )}

              <button type="submit" className="btn-submit fade-up d-4" disabled={loading}>
                {loading ? (
                  <><span className="nl-loader" /><span>Creando…</span></>
                ) : (
                  <><span>Crear negocio y empezar</span><i className="fa-solid fa-arrow-right" /></>
                )}
              </button>

              <div className="signup-row fade-up d-5">
                ¿Ya tienes cuenta? <Link to="/login">Inicia sesión</Link>
              </div>
            </form>

            <div className="form-footer">© {new Date().getFullYear()} gsiker · v1.0</div>
          </div>
        </section>
      </div>
    </div>
  );
}
