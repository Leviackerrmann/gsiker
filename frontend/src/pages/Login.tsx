import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";


export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(""); setLoading(true);
    try { await login(username, password); navigate("/dashboard"); }
    catch { setError("Credenciales inválidas"); setLoading(false); }
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "linear-gradient(135deg, var(--bg-body) 0%, var(--bg-sidebar) 50%, #0F1525 100%)",
      padding: 20,
    }}>
      <div style={{
        width: "100%", maxWidth: 400, animation: "fadeIn 0.3s ease",
      }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: "var(--primary)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 800, color: "#fff", marginBottom: 16 }}><i className="fas fa-boxes-stacked" style={{ fontSize: 24 }} /></div>
          <h1 style={{ color: "#F1F5F9", fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: "-0.5px" }}>minisap</h1>
          <p style={{ color: "#64748B", fontSize: 14, marginTop: 6 }}>ERP — Sistema de Gestión</p>
        </div>

        <form onSubmit={handleSubmit} style={{
          background: "var(--surface)", padding: "32px", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)",
        }}>
          {error && (
            <div style={{
              background: "var(--danger-bg)", color: "var(--danger-text)", padding: "10px 14px",
              borderRadius: "var(--radius-sm)", marginBottom: 20, fontSize: 13, fontWeight: 500,
              display: "flex", alignItems: "center", gap: 8, animation: "fadeIn 0.2s ease",
            }}>
              <i className="fas fa-circle-exclamation" style={{ fontSize: 14 }} /> {error}
            </div>
          )}

          <div style={{ marginBottom: 18 }}>
            <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 600, color: "var(--text)" }}>Usuario</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus
              style={{ width: "100%", padding: "11px 14px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 14, boxSizing: "border-box", transition: "var(--transition)", background: "var(--bg)" }}
              placeholder="admin" />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 600, color: "var(--text)" }}>Contraseña</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
              style={{ width: "100%", padding: "11px 14px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 14, boxSizing: "border-box", transition: "var(--transition)", background: "var(--bg)" }}
              placeholder="••••••••" />
          </div>

          <button type="submit" disabled={loading} style={{
            width: "100%", padding: "12px", background: loading ? "var(--primary-hover)" : "var(--primary)",
            color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontSize: 15, fontWeight: 600,
            cursor: loading ? "default" : "pointer", transition: "var(--transition)", opacity: loading ? 0.8 : 1,
          }}>
            {loading ? "Ingresando..." : "Iniciar sesión"}
          </button>
        </form>
      </div>
    </div>
  );
}
