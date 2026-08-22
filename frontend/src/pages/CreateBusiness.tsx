import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import api from "../lib/api";
import { AuthShell, CATEGORIAS_NEGOCIO, type Categoria } from "../lib/authShell";

const CAT_MODAL_CSS = `
.cbm-ov{position:fixed;inset:0;z-index:1000;background:rgba(2,6,15,.72);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:16px;animation:cbmFade .2s ease}
@keyframes cbmFade{from{opacity:0}to{opacity:1}}
.cbm{width:100%;max-width:460px;max-height:84vh;display:flex;flex-direction:column;background:#0e1626;border:1px solid rgba(255,255,255,.1);border-radius:18px;overflow:hidden;box-shadow:0 30px 70px rgba(0,0,0,.55);font-family:'DM Sans',system-ui,sans-serif;animation:cbmUp .25s ease}
@keyframes cbmUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
.cbm-head{display:flex;align-items:center;justify-content:space-between;padding:20px 22px;border-bottom:1px solid rgba(255,255,255,.07)}
.cbm-head h3{font-size:18px;font-weight:800;color:#fff;font-family:'Space Grotesk',sans-serif;margin:0}
.cbm-x{width:30px;height:30px;border-radius:50%;border:none;background:rgba(255,255,255,.08);color:#cbd5e1;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px}
.cbm-x:hover{background:rgba(255,255,255,.15)}
.cbm-list{overflow-y:auto;padding:8px;flex:1;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.16) transparent}
.cbm-list::-webkit-scrollbar{width:8px}
.cbm-list::-webkit-scrollbar-track{background:transparent}
.cbm-list::-webkit-scrollbar-thumb{background:rgba(255,255,255,.14);border-radius:20px;border:2px solid transparent;background-clip:padding-box}
.cbm-list::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,.26);background-clip:padding-box}
.cbm-cat{display:flex;align-items:center;gap:14px;width:100%;padding:12px 14px;border:none;background:none;color:#e5e7eb;cursor:pointer;border-radius:12px;text-align:left;font-family:inherit;font-size:14.5px;transition:background .15s}
.cbm-cat:hover{background:rgba(255,255,255,.05)}
.cbm-cat.sel{background:rgba(20,184,166,.12)}
.cbm-ic{width:36px;height:36px;flex:0 0 auto;border-radius:10px;background:rgba(20,184,166,.12);color:#2dd4bf;display:flex;align-items:center;justify-content:center;font-size:15px}
.cbm-lbl{flex:1}
.cbm-radio{width:20px;height:20px;flex:0 0 auto;border-radius:50%;border:2px solid rgba(255,255,255,.25);display:flex;align-items:center;justify-content:center}
.cbm-cat.sel .cbm-radio{border-color:#14b8a6}
.cbm-cat.sel .cbm-radio::after{content:"";width:10px;height:10px;border-radius:50%;background:#14b8a6}
.cbm-foot{padding:16px 22px;border-top:1px solid rgba(255,255,255,.07)}
.cbm-confirm{width:100%;height:46px;border:none;border-radius:12px;background:#14b8a6;color:#04211c;font-weight:700;font-size:15px;cursor:pointer;font-family:inherit;transition:background .2s}
.cbm-confirm:hover:not(:disabled){background:#0d9488}
.cbm-confirm:disabled{opacity:.45;cursor:not-allowed}
`;

function CategoriaModal({ actual, onSelect, onClose }: { actual: Categoria | null; onSelect: (c: Categoria) => void; onClose: () => void }) {
  const [sel, setSel] = useState<Categoria | null>(actual);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);

  return createPortal(
    <div className="cbm-ov" onClick={onClose}>
      <style>{CAT_MODAL_CSS}</style>
      <div className="cbm" onClick={(e) => e.stopPropagation()}>
        <div className="cbm-head">
          <h3>Selecciona una categoría</h3>
          <button className="cbm-x" onClick={onClose} aria-label="Cerrar"><i className="fa-solid fa-xmark" /></button>
        </div>
        <div className="cbm-list">
          {CATEGORIAS_NEGOCIO.map((c) => (
            <button key={c.label} type="button" className={`cbm-cat ${sel?.label === c.label ? "sel" : ""}`} onClick={() => setSel(c)}>
              <span className="cbm-ic"><i className={`fa-solid ${c.icon}`} /></span>
              <span className="cbm-lbl">{c.label}</span>
              <span className="cbm-radio" />
            </button>
          ))}
        </div>
        <div className="cbm-foot">
          <button className="cbm-confirm" disabled={!sel} onClick={() => sel && onSelect(sel)}>Confirmar</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function CreateBusiness() {
  const navigate = useNavigate();
  const { refrescarSesion, logout } = useAuth();
  const [nombreUsuario, setNombreUsuario] = useState("");
  const [negocio, setNegocio] = useState("");
  const [categoria, setCategoria] = useState<Categoria | null>(null);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [error, setError] = useState("");
  const [creando, setCreando] = useState(false);

  const puedeCrear = nombreUsuario.trim() && negocio.trim() && categoria && !creando;

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!nombreUsuario.trim()) return setError("Ingresa tu nombre.");
    if (!negocio.trim()) return setError("Ingresa el nombre de tu negocio.");
    if (!categoria) return setError("Elige la categoría de tu negocio.");
    setCreando(true);
    try {
      await api.post("/businesses", {
        nombre: negocio.trim(),
        nombre_usuario: nombreUsuario.trim(),
        categoria: categoria.label,
      });
      await refrescarSesion();
      navigate("/dashboard", { replace: true });
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail || "No se pudo crear el negocio. Intenta de nuevo.");
      setCreando(false);
    }
  };

  return (
    <AuthShell>
      <h1>Cuéntanos de tu negocio</h1>
      <p className="a2-sub">Un último paso y entras. Los datos fiscales los completas después.</p>

      {error && <div className="a2-err"><i className="fa-solid fa-circle-exclamation" /> {error}</div>}

      <form onSubmit={crear} noValidate>
        <div className="a2-field">
          <label htmlFor="nombre">¿Cuál es tu nombre?</label>
          <input id="nombre" className="a2-input" type="text" autoFocus
            placeholder="Ej: Juan Pérez" value={nombreUsuario} onChange={(e) => setNombreUsuario(e.target.value)} />
        </div>

        <div className="a2-field">
          <label htmlFor="negocio">¿Cuál es el nombre de tu negocio?</label>
          <input id="negocio" className="a2-input" type="text"
            placeholder="Ej: Mi Tienda" value={negocio} onChange={(e) => setNegocio(e.target.value)} />
        </div>

        <div className="a2-field">
          <label>¿A qué categoría pertenece tu negocio?</label>
          <button type="button" className="a2-picker" onClick={() => setModalAbierto(true)}>
            {categoria ? (
              <>
                <span style={{ width: 26, height: 26, borderRadius: 8, background: "rgba(20,184,166,.14)", color: "#2dd4bf", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>
                  <i className={`fa-solid ${categoria.icon}`} />
                </span>
                <span>{categoria.label}</span>
              </>
            ) : (
              <span className="ph">Selecciona una categoría</span>
            )}
            <i className="fa-solid fa-chevron-down chev" />
          </button>
        </div>

        <button type="submit" className="a2-btn a2-btn-primary" disabled={!puedeCrear}>
          {creando ? <><span className="a2-loader" /> Creando…</> : <><i className="fa-solid fa-store" /> Crear mi negocio</>}
        </button>
      </form>

      <div className="a2-foot">
        <button type="button" className="a2-link" onClick={() => { logout(); navigate("/register", { replace: true }); }}>
          Cerrar sesión
        </button>
      </div>

      {modalAbierto && (
        <CategoriaModal
          actual={categoria}
          onClose={() => setModalAbierto(false)}
          onSelect={(c) => { setCategoria(c); setModalAbierto(false); }}
        />
      )}
    </AuthShell>
  );
}
