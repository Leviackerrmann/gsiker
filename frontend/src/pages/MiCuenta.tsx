import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../components/Toast";
import api from "../lib/api";

function Metodo({ icon, titulo, detalle, estado, color }: { icon: string; titulo: string; detalle: string; estado: string; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 18px", borderBottom: "1px solid var(--row-border)" }}>
      <span style={{ width: 40, height: 40, flex: "0 0 auto", borderRadius: 10, background: "var(--primary-light)", color: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
        <i className={`fa-solid ${icon}`} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{titulo}</div>
        <div style={{ fontSize: 12.5, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{detalle}</div>
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, padding: "5px 11px", borderRadius: 20, background: `${color}22`, color, whiteSpace: "nowrap" }}>{estado}</span>
    </div>
  );
}

export default function MiCuenta() {
  const { user, refrescarSesion } = useAuth();
  const toast = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const hasPassword = Boolean(user?.has_password);
  const hasGoogle = Boolean(user?.has_google);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (username.trim().length < 3) return setError("El usuario debe tener al menos 3 caracteres.");
    if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/\d/.test(password))
      return setError("La contraseña debe tener al menos 8 caracteres, una letra y un número.");
    setGuardando(true);
    try {
      await api.post("/auth/set-password", { username: username.trim(), password, email: email.trim() || undefined });
      await refrescarSesion();
      toast.success("Método de acceso agregado. Ya puedes entrar con usuario y contraseña.");
      setPassword("");
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail || "No se pudo guardar. Intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div style={{ animation: "fadeInUp .45s ease forwards", maxWidth: 640 }}>
      <div className="ui-head">
        <div>
          <h1 className="ui-title">Mi cuenta</h1>
          <p className="ui-subtitle">Tus datos y formas de iniciar sesión</p>
        </div>
      </div>

      {/* Aviso de respaldo si solo tiene teléfono/Google sin contraseña */}
      {!hasPassword && (
        <div style={{ display: "flex", gap: 12, padding: "14px 16px", borderRadius: "var(--card-radius)", background: "var(--warning-bg)", border: "1px solid var(--warning-text)", marginBottom: 20 }}>
          <i className="fa-solid fa-shield-halved" style={{ color: "var(--warning-text)", fontSize: 18, marginTop: 2 }} />
          <div style={{ fontSize: 13.5, color: "var(--warning-text)", lineHeight: 1.5 }}>
            <strong>Protege tu acceso.</strong> Hoy solo entras con tu teléfono. Agrega un usuario y contraseña para poder entrar aunque no tengas tu teléfono a mano.
          </div>
        </div>
      )}

      {/* Métodos de acceso */}
      <div className="ui-table-wrap" style={{ marginBottom: 22 }}>
        <div style={{ padding: "14px 18px", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--text-muted)", borderBottom: "1px solid var(--row-border)" }}>
          Métodos de acceso
        </div>
        <Metodo icon="fa-mobile-screen" titulo="Teléfono (WhatsApp)"
          detalle={user?.phone_number || "No configurado"}
          estado={user?.phone_number ? "Activo" : "—"}
          color={user?.phone_number ? "var(--success-text)" : "var(--text-muted)"} />
        <Metodo icon="fa-key" titulo="Usuario y contraseña"
          detalle={hasPassword ? `Usuario: ${user?.username}` : "No configurado — recomendado como respaldo"}
          estado={hasPassword ? "Configurada" : "Falta"}
          color={hasPassword ? "var(--success-text)" : "var(--warning-text)"} />
        <Metodo icon="fa-envelope" titulo="Correo electrónico"
          detalle={user?.email || "No configurado"}
          estado={user?.email ? "Guardado" : "—"}
          color={user?.email ? "var(--success-text)" : "var(--text-muted)"} />
        <div style={{ borderBottom: "none" }}>
          <Metodo icon="fa-brands fa-google" titulo="Google"
            detalle={hasGoogle ? "Cuenta de Google vinculada" : "Vincular tu cuenta de Google"}
            estado={hasGoogle ? "Vinculado" : "Pronto"}
            color={hasGoogle ? "var(--success-text)" : "var(--text-muted)"} />
        </div>
      </div>

      {/* Formulario para agregar usuario + contraseña */}
      {!hasPassword && (
        <div className="ui-table-wrap" style={{ padding: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 4px" }}>Agregar usuario y contraseña</h2>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 18px" }}>Podrás entrar con estos datos desde la pantalla de inicio de sesión → “Entrar con usuario y contraseña”.</p>

          {error && <div className="ui-error" style={{ marginBottom: 14 }}>{error}</div>}

          <form onSubmit={guardar}>
            <div className="ui-field">
              <label>Usuario</label>
              <input className="ui-input" type="text" autoComplete="username" placeholder="ej: juanperez"
                value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div className="ui-field">
              <label>Contraseña</label>
              <div style={{ position: "relative" }}>
                <input className="ui-input" type={showPass ? "text" : "password"} autoComplete="new-password"
                  placeholder="Mínimo 8 caracteres, una letra y un número" value={password}
                  onChange={(e) => setPassword(e.target.value)} style={{ paddingRight: 42 }} />
                <button type="button" onClick={() => setShowPass((v) => !v)} aria-label="Mostrar contraseña"
                  style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 6 }}>
                  <i className={`fa-solid ${showPass ? "fa-eye-slash" : "fa-eye"}`} />
                </button>
              </div>
            </div>
            <div className="ui-field">
              <label>Correo electrónico <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(opcional)</span></label>
              <input className="ui-input" type="email" autoComplete="email" placeholder="tucorreo@ejemplo.com"
                value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <button type="submit" className="ui-btn-primary" disabled={guardando}>
              {guardando ? <><i className="fas fa-spinner ui-spin" /> Guardando…</> : <><i className="fa-solid fa-shield-halved" /> Guardar método de respaldo</>}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
