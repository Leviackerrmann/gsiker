import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
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
  const { registerEmpresa } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!empresaNombre.trim()) return setError("Ingresa el nombre de la empresa");
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
        "No se pudo crear la empresa";
      setError(detail);
      setLoading(false);
    }
  };

  return (
    <div>
      <style>{`
        @keyframes cardIn { from{opacity:0;transform:translateY(24px) scale(0.97)} to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes spin { to{transform:rotate(360deg)} }
      `}</style>
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "var(--bg)", position: "relative", overflow: "hidden", fontFamily: "'DM Sans', sans-serif", padding: "40px 0",
      }}>
        <div className="glow" style={{ position: "fixed", borderRadius: "50%", filter: "blur(100px)", pointerEvents: "none", zIndex: 0, width: 500, height: 500, background: "var(--glow-a)", top: -150, right: -100 }} />
        <div className="glow" style={{ position: "fixed", borderRadius: "50%", filter: "blur(100px)", pointerEvents: "none", zIndex: 0, width: 400, height: 400, background: "var(--glow-b)", bottom: -100, left: -80 }} />

        <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 460, padding: 24 }}>
          <div style={{
            background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 20, padding: "36px 36px 32px",
            backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
            boxShadow: "0 32px 80px rgba(0,0,0,0.35)", animation: "cardIn .6s cubic-bezier(.2,.8,.3,1) forwards",
          }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 28 }}>
              <div style={{ width: 60, height: 60, borderRadius: 16, background: "linear-gradient(135deg, var(--accent-grad-start), var(--accent-grad-end))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, color: "#fff", boxShadow: "0 8px 28px var(--accent-glow)", marginBottom: 14 }}>
                <i className="fas fa-building" />
              </div>
              <div style={{ fontFamily: "'Space Grotesk'", fontSize: 24, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-.5px" }}>Crea tu empresa</div>
              <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4, textAlign: "center" }}>Empieza gratis. Configura tu ERP en un minuto.</div>
            </div>

            <form onSubmit={handleSubmit}>
              <div style={sectionLbl}>Datos de la empresa</div>
              <Field icon="fa-building" label="Nombre de la empresa">
                <input style={inp} value={empresaNombre} onChange={(e) => setEmpresaNombre(e.target.value)} placeholder="Mi Empresa S.A." autoFocus />
              </Field>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <Field icon="fa-id-card" label="NIT (opcional)">
                    <input style={inp} value={nit} onChange={(e) => setNit(e.target.value)} placeholder="1234567-8" />
                  </Field>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={lbl}><i className="fas fa-scale-balanced" style={{ fontSize: 11 }} />Régimen fiscal</label>
                  <select style={{ ...inp, paddingLeft: 14 }} value={regimen} onChange={(e) => setRegimen(e.target.value as RegimenFiscal)}>
                    <option value="general">General (IVA 12%)</option>
                    <option value="pequeno_contribuyente">Pequeño Contribuyente (5%)</option>
                  </select>
                </div>
              </div>

              <div style={{ ...sectionLbl, marginTop: 8 }}>Tu cuenta de administrador</div>
              <Field icon="fa-user" label="Nombre completo">
                <input style={inp} value={nombreCompleto} onChange={(e) => setNombreCompleto(e.target.value)} placeholder="Juan Pérez" />
              </Field>
              <Field icon="fa-at" label="Usuario">
                <input style={inp} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="juanperez" />
              </Field>
              <label style={lbl}><i className="fas fa-lock" style={{ fontSize: 11 }} />Contraseña</label>
              <div style={{ position: "relative", marginBottom: 18 }}>
                <input type={showPassword ? "text" : "password"} style={inp} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
                <i className="fas fa-lock" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", fontSize: 14, pointerEvents: "none" }} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 14 }}>
                  <i className={`fas fa-eye${showPassword ? "-slash" : ""}`} />
                </button>
              </div>

              {error && <div style={{ fontSize: 12.5, color: "#F43F5E", marginBottom: 16, display: "flex", alignItems: "center", gap: 6 }}><i className="fas fa-circle-exclamation" /> {error}</div>}

              <button type="submit" disabled={loading} style={{
                width: "100%", padding: 14, borderRadius: 12, border: "none",
                background: "linear-gradient(135deg, var(--accent-grad-start), var(--accent-grad-end))",
                color: "#fff", fontSize: 15, fontWeight: 700, fontFamily: "'Space Grotesk'",
                cursor: loading ? "default" : "pointer", opacity: loading ? .7 : 1,
                boxShadow: "0 4px 20px var(--accent-glow)", display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              }}>
                {loading ? <div style={{ width: 18, height: 18, border: "2px solid rgba(255,255,255,.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin .6s linear infinite" }} /> : "Crear empresa y empezar"}
              </button>
            </form>

            <div style={{ textAlign: "center", marginTop: 20, paddingTop: 18, borderTop: "1px solid var(--border)" }}>
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>¿Ya tienes cuenta? </span>
              <Link to="/login" style={{ fontSize: 13, color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}>Inicia sesión</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={lbl}><i className={`fas ${icon}`} style={{ fontSize: 11 }} />{label}</label>
      <div style={{ position: "relative" }}>
        {children}
        <i className={`fas ${icon}`} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", fontSize: 14, pointerEvents: "none" }} />
      </div>
    </div>
  );
}

const inp: React.CSSProperties = { width: "100%", padding: "13px 14px 13px 44px", borderRadius: 12, border: "1.5px solid var(--input-border)", background: "var(--input-bg)", color: "var(--text-primary)", fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box", transition: "all .25s ease" };
const lbl: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".7px", color: "var(--text-muted)", marginBottom: 8 };
const sectionLbl: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 14, letterSpacing: ".3px" };
