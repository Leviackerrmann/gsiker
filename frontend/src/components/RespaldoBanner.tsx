import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

/** Aviso en el dashboard para que quien entró por teléfono/Google agregue un
 * método de respaldo (usuario+contraseña) y no quede bloqueado si pierde el
 * teléfono. Se oculta si ya tiene contraseña o si el usuario lo descarta. */
export default function RespaldoBanner() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const key = user ? `respaldo-dismiss-${user.id}` : "";
  const [oculto, setOculto] = useState(() => (key ? localStorage.getItem(key) === "1" : true));

  if (!user || user.has_password || oculto) return null;

  const cerrar = () => { if (key) localStorage.setItem(key, "1"); setOculto(true); };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", marginBottom: 22, borderRadius: "var(--card-radius)", background: "var(--warning-bg)", border: "1px solid var(--warning-text)" }}>
      <i className="fa-solid fa-shield-halved" style={{ color: "var(--warning-text)", fontSize: 20, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: "var(--warning-text)", lineHeight: 1.5 }}>
        <strong>Protege tu cuenta.</strong> Entraste con tu teléfono. Agrega un usuario y contraseña para poder ingresar aunque no lo tengas a mano.
      </div>
      <button onClick={() => navigate("/cuenta")}
        style={{ flexShrink: 0, background: "var(--warning-text)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
        Agregar respaldo
      </button>
      <button onClick={cerrar} aria-label="Cerrar" title="Descartar"
        style={{ flexShrink: 0, background: "none", border: "none", color: "var(--warning-text)", cursor: "pointer", padding: 4, opacity: 0.8 }}>
        <i className="fa-solid fa-xmark" />
      </button>
    </div>
  );
}
