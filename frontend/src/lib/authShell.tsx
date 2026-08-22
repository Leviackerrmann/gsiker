import { useRef } from "react";
import { useNodeNetwork } from "./authUi";

/** Países soportados en el selector (prioridad LatAm). dial en formato +NNN. */
export interface Pais {
  code: string;
  nombre: string;
  dial: string;
  flag: string;
}

export const PAISES: Pais[] = [
  { code: "MX", nombre: "México", dial: "+52", flag: "🇲🇽" },
  { code: "CO", nombre: "Colombia", dial: "+57", flag: "🇨🇴" },
  { code: "AR", nombre: "Argentina", dial: "+54", flag: "🇦🇷" },
  { code: "CL", nombre: "Chile", dial: "+56", flag: "🇨🇱" },
  { code: "PE", nombre: "Perú", dial: "+51", flag: "🇵🇪" },
  { code: "EC", nombre: "Ecuador", dial: "+593", flag: "🇪🇨" },
  { code: "GT", nombre: "Guatemala", dial: "+502", flag: "🇬🇹" },
  { code: "SV", nombre: "El Salvador", dial: "+503", flag: "🇸🇻" },
  { code: "HN", nombre: "Honduras", dial: "+504", flag: "🇭🇳" },
  { code: "NI", nombre: "Nicaragua", dial: "+505", flag: "🇳🇮" },
  { code: "CR", nombre: "Costa Rica", dial: "+506", flag: "🇨🇷" },
  { code: "PA", nombre: "Panamá", dial: "+507", flag: "🇵🇦" },
  { code: "BO", nombre: "Bolivia", dial: "+591", flag: "🇧🇴" },
  { code: "PY", nombre: "Paraguay", dial: "+595", flag: "🇵🇾" },
  { code: "UY", nombre: "Uruguay", dial: "+598", flag: "🇺🇾" },
  { code: "DO", nombre: "Rep. Dominicana", dial: "+1", flag: "🇩🇴" },
  { code: "US", nombre: "Estados Unidos", dial: "+1", flag: "🇺🇸" },
  { code: "ES", nombre: "España", dial: "+34", flag: "🇪🇸" },
];

/** Categorías/rubros de negocio para el onboarding (icono Font Awesome + etiqueta). */
export interface Categoria { label: string; icon: string }

export const CATEGORIAS_NEGOCIO: Categoria[] = [
  { label: "Tienda de barrio", icon: "fa-store" },
  { label: "Minimercado o abarrotes", icon: "fa-basket-shopping" },
  { label: "Supermercado", icon: "fa-cart-shopping" },
  { label: "Ropa y calzado", icon: "fa-shirt" },
  { label: "Restaurante o comida rápida", icon: "fa-utensils" },
  { label: "Cafetería o panadería", icon: "fa-mug-hot" },
  { label: "Artículos de belleza", icon: "fa-wand-magic-sparkles" },
  { label: "Barbería, peluquería o salón", icon: "fa-scissors" },
  { label: "Electrónica e informática", icon: "fa-laptop" },
  { label: "Celulares y accesorios", icon: "fa-mobile-screen" },
  { label: "Farmacia y droguería", icon: "fa-prescription-bottle-medical" },
  { label: "Ferretería y construcción", icon: "fa-screwdriver-wrench" },
  { label: "Papelería y libros", icon: "fa-book" },
  { label: "Licorería y bebidas", icon: "fa-wine-bottle" },
  { label: "Tienda de mascotas o veterinaria", icon: "fa-paw" },
  { label: "Juguetería", icon: "fa-shapes" },
  { label: "Joyería y relojería", icon: "fa-gem" },
  { label: "Muebles y hogar", icon: "fa-couch" },
  { label: "Floristería", icon: "fa-spa" },
  { label: "Deportes y gimnasio", icon: "fa-dumbbell" },
  { label: "Repuestos y autopartes", icon: "fa-car" },
  { label: "Taller mecánico", icon: "fa-gears" },
  { label: "Agropecuaria o agrícola", icon: "fa-tractor" },
  { label: "Industria o manufactura", icon: "fa-industry" },
  { label: "Salud o consultorio", icon: "fa-stethoscope" },
  { label: "Educación o academia", icon: "fa-graduation-cap" },
  { label: "Servicios profesionales", icon: "fa-briefcase" },
  { label: "Turismo y hotelería", icon: "fa-hotel" },
  { label: "Distribuidora o mayorista", icon: "fa-boxes-stacked" },
  { label: "Otro", icon: "fa-ellipsis" },
];

/** Estilos del onboarding nuevo (una columna, centrado, mobile-first). */
export const AUTH2_CSS = `
.a2{--a2-accent:#14b8a6;--a2-accent-l:#2dd4bf;--a2-accent-h:#0d9488;--a2-glow:rgba(20,184,166,.35);
  min-height:100vh;min-height:100dvh;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;
  background:#0b1220;color:#e5e7eb;font-family:'DM Sans',system-ui,sans-serif;padding:24px}
.a2 *{box-sizing:border-box}
.a2 #a2Canvas{position:absolute;inset:0;width:100%;height:100%;z-index:0;opacity:.7}
.a2 .a2-orb{position:absolute;border-radius:50%;filter:blur(90px);z-index:0;pointer-events:none}
.a2 .a2-orb1{width:420px;height:420px;background:radial-gradient(circle,rgba(20,184,166,.28),transparent 70%);top:-120px;left:-100px}
.a2 .a2-orb2{width:360px;height:360px;background:radial-gradient(circle,rgba(45,212,191,.2),transparent 70%);bottom:-100px;right:-90px}
.a2 .a2-card{position:relative;z-index:2;width:100%;max-width:420px;background:rgba(17,24,39,.72);
  border:1px solid rgba(255,255,255,.08);border-radius:20px;padding:32px 28px;backdrop-filter:blur(14px);
  box-shadow:0 24px 60px rgba(0,0,0,.45);animation:a2Up .5s ease forwards}
@keyframes a2Up{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
.a2 .a2-brand{display:flex;align-items:center;gap:10px;justify-content:center;margin-bottom:22px}
.a2 .a2-logo{width:40px;height:40px;border-radius:11px;background:linear-gradient(135deg,var(--a2-accent),var(--a2-accent-l));
  display:flex;align-items:center;justify-content:center;color:#04211c;font-weight:800;font-size:20px;
  font-family:'Space Grotesk',sans-serif;box-shadow:0 8px 20px var(--a2-glow)}
.a2 .a2-brandtext{font-size:19px;font-weight:700;letter-spacing:-.4px;font-family:'Space Grotesk',sans-serif;color:#fff}
.a2 h1{font-size:23px;font-weight:800;letter-spacing:-.6px;color:#fff;text-align:center;margin:0 0 6px;font-family:'Space Grotesk',sans-serif}
.a2 .a2-sub{font-size:14px;color:#94a3b8;text-align:center;line-height:1.5;margin:0 0 24px}
.a2 label{display:block;font-size:12.5px;font-weight:600;color:#cbd5e1;margin-bottom:7px}
.a2 .a2-input,.a2 .a2-select{width:100%;height:48px;background:rgba(2,6,15,.5);border:1.5px solid rgba(255,255,255,.1);
  border-radius:12px;padding:0 15px;color:#f1f5f9;font-family:inherit;font-size:15px;outline:none;transition:border-color .18s,box-shadow .18s}
.a2 .a2-input::placeholder{color:#64748b}
.a2 .a2-input:focus,.a2 .a2-select:focus{border-color:var(--a2-accent);box-shadow:0 0 0 4px rgba(20,184,166,.14)}
.a2 .a2-field{margin-bottom:16px}
.a2 .a2-phone{display:flex;gap:8px}
.a2 .a2-phone .a2-select{width:130px;flex:0 0 auto}
.a2 .a2-phone .a2-input{flex:1;min-width:0}
.a2 .a2-btn{width:100%;height:48px;border:none;border-radius:12px;font-family:inherit;font-weight:700;font-size:15px;
  cursor:pointer;display:flex;align-items:center;justify-content:center;gap:9px;transition:transform .15s,box-shadow .2s,background .2s}
.a2 .a2-btn-primary{background:var(--a2-accent);color:#04211c;box-shadow:0 4px 14px var(--a2-glow)}
.a2 .a2-btn-primary:hover:not(:disabled){background:var(--a2-accent-h);transform:translateY(-1px);box-shadow:0 8px 22px var(--a2-glow)}
.a2 .a2-btn-primary:disabled{opacity:.6;cursor:not-allowed}
.a2 .a2-btn-google{background:#fff;color:#1f2937;border:1px solid #e5e7eb}
.a2 .a2-btn-google:hover:not(:disabled){background:#f8fafc;transform:translateY(-1px)}
.a2 .a2-btn-ghost{background:transparent;color:#94a3b8;height:auto;padding:6px}
.a2 .a2-sep{display:flex;align-items:center;gap:12px;color:#64748b;font-size:12px;margin:18px 0}
.a2 .a2-sep::before,.a2 .a2-sep::after{content:"";flex:1;height:1px;background:rgba(255,255,255,.1)}
.a2 .a2-err{display:flex;align-items:center;gap:8px;font-size:13px;color:#fca5a5;background:rgba(239,68,68,.1);
  border:1px solid rgba(239,68,68,.25);border-radius:10px;padding:10px 13px;margin-bottom:16px}
.a2 .a2-foot{text-align:center;font-size:13px;color:#94a3b8;margin-top:20px}
.a2 .a2-foot a,.a2 .a2-link{color:var(--a2-accent-l);font-weight:700;text-decoration:none;background:none;border:none;cursor:pointer;font-family:inherit;font-size:inherit}
.a2 .a2-foot a:hover,.a2 .a2-link:hover{text-decoration:underline}
.a2 .a2-otp{display:flex;gap:10px;justify-content:center;margin:6px 0 20px}
.a2 .a2-otp input{width:48px;height:56px;text-align:center;font-size:24px;font-weight:700;color:#fff;
  background:rgba(2,6,15,.5);border:1.5px solid rgba(255,255,255,.12);border-radius:12px;outline:none;transition:border-color .15s,box-shadow .15s}
.a2 .a2-otp input:focus{border-color:var(--a2-accent);box-shadow:0 0 0 4px rgba(20,184,166,.14)}
.a2 .a2-loader{width:17px;height:17px;border:2px solid rgba(4,33,28,.35);border-top-color:#04211c;border-radius:50%;animation:a2spin .7s linear infinite}
.a2 .a2-loader.light{border-color:rgba(255,255,255,.3);border-top-color:#fff}
@keyframes a2spin{to{transform:rotate(360deg)}}
.a2 .a2-hint{font-size:12px;color:#64748b;text-align:center;margin-top:4px}
.a2 .a2-picker{width:100%;min-height:48px;display:flex;align-items:center;gap:11px;padding:8px 14px;background:rgba(2,6,15,.5);border:1.5px solid rgba(255,255,255,.1);border-radius:12px;color:#f1f5f9;cursor:pointer;font-family:inherit;font-size:15px;text-align:left;transition:border-color .18s}
.a2 .a2-picker:hover{border-color:var(--a2-accent)}
.a2 .a2-picker .ph{color:#64748b}
.a2 .a2-picker .chev{margin-left:auto;color:#64748b;font-size:12px}
.a2 .a2-devcode{font-size:12.5px;color:#fcd34d;background:rgba(251,191,36,.08);border:1px dashed rgba(251,191,36,.35);
  border-radius:9px;padding:8px 12px;text-align:center;margin-bottom:16px}
@media (max-width:480px){.a2{padding:0}.a2 .a2-card{max-width:none;min-height:100vh;min-height:100dvh;border:none;border-radius:0;display:flex;flex-direction:column;justify-content:center;box-shadow:none;background:rgba(11,18,32,.9)}}
`;

/** Contenedor visual compartido de las pantallas de onboarding. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useNodeNetwork(canvasRef);
  return (
    <div className="a2">
      <style>{AUTH2_CSS}</style>
      <canvas ref={canvasRef} id="a2Canvas" />
      <div className="a2-orb a2-orb1" />
      <div className="a2-orb a2-orb2" />
      <div className="a2-card">
        <div className="a2-brand">
          <div className="a2-logo">g</div>
          <div className="a2-brandtext">gsiker</div>
        </div>
        {children}
      </div>
    </div>
  );
}
