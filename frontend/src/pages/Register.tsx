import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../lib/api";
import { AuthShell, PAISES } from "../lib/authShell";

export default function Register() {
  const navigate = useNavigate();
  const [estado, setEstado] = useState<"cargando" | "abierto" | "cerrado">("cargando");
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [paisCode, setPaisCode] = useState("GT");
  const [telefono, setTelefono] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api.get("/auth/registration-status")
      .then((r) => {
        setEstado(r.data?.enabled ? "abierto" : "cerrado");
        setGoogleEnabled(Boolean(r.data?.google_enabled));
      })
      .catch(() => setEstado("cerrado"));
  }, []);

  const pais = useMemo(() => PAISES.find((p) => p.code === paisCode) || PAISES[0], [paisCode]);
  const digitos = telefono.replace(/\D/g, "");
  const puedeEnviar = digitos.length >= 7 && !enviando;

  const enviarCodigo = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (digitos.length < 7) return setError("Ingresa un número de teléfono válido.");
    setEnviando(true);
    try {
      const { data } = await api.post("/auth/phone/send-code", {
        country_code: pais.dial,
        phone_number: digitos,
      });
      navigate("/register/verify", {
        state: { phone: data.phone_number, devCode: data.dev_code ?? null },
      });
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail || "No se pudo enviar el código. Intenta de nuevo.");
      setEnviando(false);
    }
  };

  const continuarConGoogle = () => {
    if (!googleEnabled) {
      setError("El registro con Google estará disponible muy pronto. Usa tu teléfono por ahora.");
      return;
    }
    // Con GOOGLE_CLIENT_ID configurado (backend + VITE_GOOGLE_CLIENT_ID) acá se
    // dispara Google Identity Services y se hace POST /auth/google { token }.
    setError("Google aún no está configurado en este entorno.");
  };

  if (estado === "cargando") {
    return (
      <AuthShell>
        <div style={{ display: "flex", justifyContent: "center", padding: "20px 0" }}>
          <span className="a2-loader light" />
        </div>
      </AuthShell>
    );
  }

  if (estado === "cerrado") {
    return (
      <AuthShell>
        <h1>Registro no disponible</h1>
        <p className="a2-sub">
          El registro de nuevos negocios está deshabilitado temporalmente mientras terminamos de preparar gsiker. Muy pronto podrás crear tu cuenta.
        </p>
        <div className="a2-foot">¿Ya tienes cuenta? <Link to="/login">Inicia sesión</Link></div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h1>Crea tu cuenta</h1>
      <p className="a2-sub">Empieza gratis en un minuto. Sin tarjeta.</p>

      {error && <div className="a2-err"><i className="fa-solid fa-circle-exclamation" /> {error}</div>}

      <button type="button" className="a2-btn a2-btn-google" onClick={continuarConGoogle}>
        <i className="fa-brands fa-google" style={{ color: "#ea4335" }} /> Continuar con Google
        {!googleEnabled && <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>· Pronto</span>}
      </button>

      <div className="a2-sep">o con tu teléfono</div>

      <form onSubmit={enviarCodigo} noValidate>
        <div className="a2-field">
          <label htmlFor="tel">Número de WhatsApp</label>
          <div className="a2-phone">
            <select className="a2-select" value={paisCode} onChange={(e) => setPaisCode(e.target.value)} aria-label="País">
              {PAISES.map((p) => (
                <option key={p.code} value={p.code}>{p.flag} {p.dial}</option>
              ))}
            </select>
            <input
              id="tel" className="a2-input" type="tel" inputMode="numeric" autoFocus
              placeholder="5555 1234" value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
            />
          </div>
          <div className="a2-hint">Te enviaremos un código de verificación por WhatsApp.</div>
        </div>

        <button type="submit" className="a2-btn a2-btn-primary" disabled={!puedeEnviar}>
          {enviando ? <><span className="a2-loader" /> Enviando…</> : <><i className="fa-brands fa-whatsapp" /> Enviar código por WhatsApp</>}
        </button>
      </form>

      <div className="a2-foot">¿Ya tienes cuenta? <Link to="/login">Inicia sesión</Link></div>
    </AuthShell>
  );
}
