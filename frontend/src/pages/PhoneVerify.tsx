import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import api from "../lib/api";
import { AuthShell } from "../lib/authShell";

interface NavState { phone?: string; devCode?: string | null }

const LARGO = 6;

export default function PhoneVerify() {
  const navigate = useNavigate();
  const location = useLocation();
  const { establecerToken } = useAuth();
  const state = (location.state || {}) as NavState;
  const phone = state.phone;

  const [digits, setDigits] = useState<string[]>(Array(LARGO).fill(""));
  const [devCode, setDevCode] = useState<string | null>(state.devCode ?? null);
  const [error, setError] = useState("");
  const [verificando, setVerificando] = useState(false);
  const [cooldown, setCooldown] = useState(60);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  // Sin teléfono en el state (entraron directo): volver al inicio del registro.
  useEffect(() => {
    if (!phone) navigate("/register", { replace: true });
    else inputs.current[0]?.focus();
  }, [phone, navigate]);

  // Contador del cooldown de reenvío.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const code = digits.join("");

  const setDigit = (i: number, val: string) => {
    const chars = val.replace(/\D/g, "");
    if (!chars) { setDigits((d) => { const n = [...d]; n[i] = ""; return n; }); return; }
    setDigits((d) => {
      const n = [...d];
      // Pegar varios dígitos: los reparte desde la posición actual.
      for (let k = 0; k < chars.length && i + k < LARGO; k++) n[i + k] = chars[k];
      return n;
    });
    const next = Math.min(i + chars.length, LARGO - 1);
    inputs.current[next]?.focus();
  };

  const onKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) inputs.current[i - 1]?.focus();
  };

  const verificar = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (code.length !== LARGO) return setError("Ingresa los 6 dígitos.");
    setError("");
    setVerificando(true);
    try {
      const { data } = await api.post("/auth/phone/verify", { phone_number: phone, code });
      const user = await establecerToken(data.access_token);
      navigate(user.empresa_id ? "/dashboard" : "/register/business", { replace: true });
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail || "Código inválido o expirado.");
      setDigits(Array(LARGO).fill(""));
      inputs.current[0]?.focus();
      setVerificando(false);
    }
  };

  const reenviar = async () => {
    if (cooldown > 0 || !phone) return;
    setError("");
    try {
      // Reusa el número normalizado: lo mandamos como country_code + resto vacío.
      const { data } = await api.post("/auth/phone/send-code", { country_code: phone, phone_number: "" });
      setDevCode(data.dev_code ?? null);
      setCooldown(60);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail || "No se pudo reenviar el código.");
    }
  };

  return (
    <AuthShell>
      <h1>Verifica tu teléfono</h1>
      <p className="a2-sub">
        Ingresa el código de 6 dígitos que enviamos por WhatsApp a<br />
        <strong style={{ color: "#e2e8f0" }}>{phone}</strong>
      </p>

      {devCode && (
        <div className="a2-devcode">
          <i className="fa-solid fa-flask" /> Modo desarrollo — tu código es <strong>{devCode}</strong>
        </div>
      )}

      {error && <div className="a2-err"><i className="fa-solid fa-circle-exclamation" /> {error}</div>}

      <form onSubmit={verificar}>
        <div className="a2-otp">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => { inputs.current[i] = el; }}
              type="text" inputMode="numeric" autoComplete="one-time-code"
              maxLength={i === 0 ? LARGO : 1} value={d}
              onChange={(e) => setDigit(i, e.target.value)}
              onKeyDown={(e) => onKeyDown(i, e)}
            />
          ))}
        </div>

        <button type="submit" className="a2-btn a2-btn-primary" disabled={verificando || code.length !== LARGO}>
          {verificando ? <><span className="a2-loader" /> Verificando…</> : <>Verificar</>}
        </button>
      </form>

      <div className="a2-foot">
        {cooldown > 0
          ? <span style={{ color: "#64748b" }}>Reenviar código en {cooldown}s</span>
          : <button type="button" className="a2-link" onClick={reenviar}>Reenviar código</button>}
      </div>
      <div className="a2-foot" style={{ marginTop: 8 }}>
        <Link to="/register">Cambiar número</Link>
      </div>
    </AuthShell>
  );
}
