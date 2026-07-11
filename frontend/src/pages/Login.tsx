import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => {
    try { return !!localStorage.getItem("inv-remember"); } catch { return false; }
  });
  const [error, setError] = useState({ field: "", msg: "" });
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

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
    setError({ field: "", msg: "" });
    if (!username.trim()) { setError({ field: "user", msg: "Ingresa tu usuario" }); return; }
    if (!password) { setError({ field: "pass", msg: "Ingresa tu contraseña" }); return; }

    setLoading(true);
    try {
      await login(username, password);
      if (rememberMe) {
        localStorage.setItem("inv-remember", JSON.stringify({ u: username, r: true }));
      } else {
        localStorage.removeItem("inv-remember");
      }
      navigate("/dashboard");
    } catch {
      setError({ field: "pass", msg: "Credenciales inválidas" });
      setLoading(false);
    }
  };

  const clearErrors = () => setError({ field: "", msg: "" });

  return (
    <div>
      <style>{`
        @keyframes cardIn { from{opacity:0;transform:translateY(24px) scale(0.97)} to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes logoIn { from{opacity:0;transform:scale(0.8) translateY(-10px)} to{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes spin { to{transform:rotate(360deg)} }
        .login-body::before{ content:'';position:fixed;inset:0;z-index:0;background-image:radial-gradient(circle,rgba(20,184,166,.08) 1px,transparent 1px);background-size:32px 32px;opacity:.5 }
      `}</style>
      <div className="login-body" style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "var(--bg)", position: "relative", overflow: "hidden", fontFamily: "'DM Sans', sans-serif",
      }}>
        <div className="glow" style={{ position: "fixed", borderRadius: "50%", filter: "blur(100px)", pointerEvents: "none", zIndex: 0, width: 500, height: 500, background: "var(--glow-a)", top: -150, right: -100 }} />
        <div className="glow" style={{ position: "fixed", borderRadius: "50%", filter: "blur(100px)", pointerEvents: "none", zIndex: 0, width: 400, height: 400, background: "var(--glow-b)", bottom: -100, left: -80 }} />

        <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 420, padding: 24 }}>
          <div style={{
            background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 20, padding: "40px 36px 36px",
            backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
            boxShadow: "0 32px 80px rgba(0,0,0,0.35)", position: "relative", overflow: "hidden",
            animation: "cardIn .6s cubic-bezier(.2,.8,.3,1) forwards",
          }}>
            <div style={{ position: "absolute", top: -60, left: "50%", transform: "translateX(-50%)", width: 200, height: 120, borderRadius: "50%", background: "var(--accent)", filter: "blur(80px)", opacity: .15, pointerEvents: "none" }} />

            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 32, position: "relative", zIndex: 1, animation: "logoIn .5s ease .2s both" }}>
              <div style={{ width: 64, height: 64, borderRadius: 16, background: "linear-gradient(135deg, var(--accent-grad-start), var(--accent-grad-end))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, color: "#fff", boxShadow: "0 8px 28px var(--accent-glow)", marginBottom: 16 }}>
                <i className="fas fa-boxes-stacked" />
              </div>
              <div style={{ fontFamily: "'Space Grotesk'", fontSize: 26, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-.5px" }}>minisap</div>
              <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4, fontWeight: 500, letterSpacing: ".3px" }}>ERP — Sistema de Gestión</div>
            </div>

            <form onSubmit={handleSubmit} style={{ position: "relative", zIndex: 1 }}>
              <div style={{ marginBottom: 20, animation: "fadeIn .4s ease .35s both" }}>
                <label style={lbl}><i className="fas fa-user" style={{ fontSize: 11 }} />Usuario</label>
                <div style={{ position: "relative" }}>
                  <input
                    type="text" value={username} onChange={(e) => { setUsername(e.target.value); clearErrors(); }}
                    style={{ ...inp, borderColor: error.field === "user" ? "#F43F5E" : "var(--input-border)", boxShadow: error.field === "user" ? "0 0 0 3px rgba(244,63,94,0.15)" : "none" }}
                    placeholder="Ingresa tu usuario" autoFocus
                  />
                  <i className="fas fa-user" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", fontSize: 14, pointerEvents: "none" }} />
                </div>
                {error.field === "user" && <div style={errMsg}><i className="fas fa-circle-exclamation" style={{ fontSize: 11 }} /> {error.msg}</div>}
              </div>

              <div style={{ marginBottom: 20, animation: "fadeIn .4s ease .42s both" }}>
                <label style={lbl}><i className="fas fa-lock" style={{ fontSize: 11 }} />Contraseña</label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPassword ? "text" : "password"} value={password}
                    onChange={(e) => { setPassword(e.target.value); clearErrors(); }}
                    style={{ ...inp, borderColor: error.field === "pass" ? "#F43F5E" : "var(--input-border)", boxShadow: error.field === "pass" ? "0 0 0 3px rgba(244,63,94,0.15)" : "none" }}
                    placeholder="Ingresa tu contraseña"
                  />
                  <i className="fas fa-lock" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", fontSize: 14, pointerEvents: "none" }} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 14, padding: 4 }}>
                    <i className={`fas fa-eye${showPassword ? "-slash" : ""}`} />
                  </button>
                </div>
                {error.field === "pass" && <div style={errMsg}><i className="fas fa-circle-exclamation" style={{ fontSize: 11 }} /> {error.msg}</div>}
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24, cursor: "pointer", animation: "fadeIn .4s ease .48s both" }}>
                <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} style={{ display: "none" }} />
                <div style={{ width: 18, height: 18, borderRadius: 5, border: "1.5px solid var(--input-border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: rememberMe ? "var(--accent)" : "var(--input-bg)", borderColor: rememberMe ? "var(--accent)" : "var(--input-border)" }}>
                  {rememberMe && <i className="fas fa-check" style={{ fontSize: 9, color: "#fff" }} />}
                </div>
                <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Recordar usuario</span>
              </label>

              <button type="submit" disabled={loading} style={{
                width: "100%", padding: 14, borderRadius: 12, border: "none",
                background: "linear-gradient(135deg, var(--accent-grad-start), var(--accent-grad-end))",
                color: "#fff", fontSize: 15, fontWeight: 700, fontFamily: "'Space Grotesk'",
                cursor: loading ? "default" : "pointer", opacity: loading ? .7 : 1,
                boxShadow: "0 4px 20px var(--accent-glow)",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                letterSpacing: ".3px", animation: "fadeIn .4s ease .52s both",
              }}>
                {loading ? (
                  <div style={{ width: 18, height: 18, border: "2px solid rgba(255,255,255,.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin .6s linear infinite" }} />
                ) : (
                  "Iniciar sesión"
                )}
              </button>

              <div style={{ textAlign: "center", marginTop: 20, animation: "fadeIn .4s ease .56s both" }}>
                <a href="#" onClick={(e) => { e.preventDefault(); }} style={{ fontSize: 13, color: "var(--accent)", textDecoration: "none", fontWeight: 500 }}>¿Olvidaste tu contraseña?</a>
              </div>
            </form>

            <div style={{ textAlign: "center", marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--border)", position: "relative", zIndex: 1, animation: "fadeIn .4s ease .6s both" }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: ".5px" }}>minisap v1.0</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const inp: React.CSSProperties = { width: "100%", padding: "13px 14px 13px 44px", borderRadius: 12, border: "1.5px solid var(--input-border)", background: "var(--input-bg)", color: "var(--text-primary)", fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box", transition: "all .25s ease" };
const lbl: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".7px", color: "var(--text-muted)", marginBottom: 8 };
const errMsg: React.CSSProperties = { fontSize: 11, color: "#F43F5E", marginTop: 6, display: "flex", alignItems: "center", gap: 5, fontWeight: 500 };
