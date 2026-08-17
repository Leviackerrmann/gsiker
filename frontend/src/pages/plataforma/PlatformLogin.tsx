import { useState } from "react";
import { useNavigate } from "react-router-dom";
import platformApi, { PLATFORM_TOKEN_KEY } from "../../lib/platformApi";

export default function PlatformLogin() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await platformApi.post("/auth/login", { username, password });
      localStorage.setItem(PLATFORM_TOKEN_KEY, data.access_token);
      navigate("/plataforma");
    } catch (err: any) {
      setError(err?.response?.data?.detail || "No se pudo iniciar sesión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0f172a" }}>
      <form onSubmit={submit} style={{ background: "#fff", padding: 32, borderRadius: 12, width: 360, boxShadow: "0 10px 40px rgba(0,0,0,0.3)" }}>
        <div style={{ textAlign: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: "#4f46e5" }}>gsiker</span>
          <div style={{ fontSize: 12, color: "#64748b", letterSpacing: 1 }}>PLATAFORMA · SUPERADMIN</div>
        </div>
        <h2 style={{ fontSize: 16, margin: "16px 0", color: "#0f172a" }}>Ingreso de plataforma</h2>
        {error && <div style={{ background: "#fef2f2", color: "#dc2626", padding: "8px 12px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{error}</div>}
        <label style={lbl}>Usuario</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} style={inp} autoFocus required />
        <label style={lbl}>Contraseña</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={inp} required />
        <button type="submit" disabled={loading} style={{ ...btn, opacity: loading ? 0.6 : 1 }}>
          {loading ? "Ingresando..." : "Ingresar"}
        </button>
      </form>
    </div>
  );
}

const lbl: React.CSSProperties = { display: "block", fontSize: 13, color: "#334155", marginBottom: 4, marginTop: 12 };
const inp: React.CSSProperties = { width: "100%", padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 14, boxSizing: "border-box" };
const btn: React.CSSProperties = { width: "100%", marginTop: 20, padding: "11px", background: "#4f46e5", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" };
