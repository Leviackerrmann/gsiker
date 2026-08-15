import { useEffect, type RefObject } from "react";

/**
 * Red de nodos animada del panel visual (login/registro).
 * Compatible con contexto no seguro (http://): no usa APIs de secure-context.
 */
export function useNodeNetwork(canvasRef: RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0, h = 0, raf = 0;
    let mouseX = -1000, mouseY = -1000;
    const MAX_DIST = 160;
    const nodes: { x: number; y: number; vx: number; vy: number; r: number }[] = [];

    const resize = () => { w = canvas.width = canvas.offsetWidth; h = canvas.height = canvas.offsetHeight; };
    resize();

    const count = Math.max(20, Math.floor((w * h) / 15000));
    for (let i = 0; i < count; i++) {
      nodes.push({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4, r: Math.random() * 2 + 1 });
    }

    const onMove = (e: MouseEvent) => { const r = canvas.getBoundingClientRect(); mouseX = e.clientX - r.left; mouseY = e.clientY - r.top; };
    const onLeave = () => { mouseX = -1000; mouseY = -1000; };
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", onLeave);
    window.addEventListener("resize", resize);

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
          const dist = Math.hypot(dx, dy);
          if (dist < MAX_DIST) {
            ctx.strokeStyle = `rgba(45,212,191,${(1 - dist / MAX_DIST) * 0.25})`;
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(nodes[i].x, nodes[i].y); ctx.lineTo(nodes[j].x, nodes[j].y); ctx.stroke();
          }
        }
      }
      for (const n of nodes) {
        const dxM = n.x - mouseX, dyM = n.y - mouseY, distM = Math.hypot(dxM, dyM);
        if (distM < 120) { const f = (120 - distM) / 120; n.x += dxM / distM * f * 1.5; n.y += dyM / distM * f * 1.5; }
        const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 5);
        g.addColorStop(0, "rgba(45,212,191,0.8)"); g.addColorStop(1, "rgba(45,212,191,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(n.x, n.y, n.r * 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill();
        n.x += n.vx; n.y += n.vy;
        if (n.x < 0 || n.x > w) n.vx *= -1;
        if (n.y < 0 || n.y > h) n.vy *= -1;
      }
      raf = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("resize", resize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** Estilos compartidos de las pantallas de autenticación (login / registro). */
export const AUTH_CSS = `
.nlogin{--nl-bg:#f8fafc;--nl-dark:#0b1220;--nl-card:#fff;--nl-fg:#0f172a;--nl-muted:#64748b;--nl-muted2:#94a3b8;--nl-border:#e2e8f0;--nl-border-d:rgba(255,255,255,.1);--nl-accent:#14b8a6;--nl-accent-h:#0d9488;--nl-accent-l:#2dd4bf;--nl-glow:rgba(20,184,166,.4);font-family:'DM Sans',sans-serif}
.nlogin *{box-sizing:border-box}
.nlogin .container{display:flex;min-height:100vh}
.nlogin .visual-panel{width:50%;background:var(--nl-dark);position:relative;overflow:hidden;display:flex;flex-direction:column;justify-content:space-between;padding:48px;color:#fff}
.nlogin #nlCanvas{position:absolute;inset:0;width:100%;height:100%;z-index:1}
.nlogin .orb{position:absolute;border-radius:50%;filter:blur(80px);z-index:0;pointer-events:none}
.nlogin .orb-1{width:400px;height:400px;background:radial-gradient(circle,rgba(20,184,166,.3),transparent 70%);top:-100px;left:-100px;animation:nlFloat 12s ease-in-out infinite}
.nlogin .orb-2{width:350px;height:350px;background:radial-gradient(circle,rgba(45,212,191,.2),transparent 70%);bottom:-80px;right:-80px;animation:nlFloat 15s ease-in-out infinite reverse}
@keyframes nlFloat{0%,100%{transform:translate(0,0)}50%{transform:translate(40px,40px)}}
.nlogin .grid-bg{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.03) 1px,transparent 1px);background-size:40px 40px;z-index:0;-webkit-mask-image:radial-gradient(circle at center,#000 40%,transparent 100%);mask-image:radial-gradient(circle at center,#000 40%,transparent 100%)}
.nlogin .visual-content{position:relative;z-index:2;display:flex;flex-direction:column;justify-content:space-between;height:100%}
.nlogin .brand-logo{display:flex;align-items:center;gap:12px}
.nlogin .logo-icon{width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,var(--nl-accent),var(--nl-accent-l));display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:20px;box-shadow:0 8px 20px var(--nl-glow);font-family:'Space Grotesk',sans-serif}
.nlogin .logo-text{font-size:20px;font-weight:700;letter-spacing:-.5px;font-family:'Space Grotesk',sans-serif}
.nlogin .hero-text{max-width:480px}
.nlogin .hero-text .badge{display:inline-flex;align-items:center;gap:8px;padding:6px 14px;background:rgba(20,184,166,.15);border:1px solid rgba(20,184,166,.3);border-radius:20px;font-size:12px;font-weight:600;color:var(--nl-accent-l);margin-bottom:24px;backdrop-filter:blur(10px)}
.nlogin .hero-text h1{font-size:42px;font-weight:800;line-height:1.1;letter-spacing:-1.5px;margin-bottom:16px;font-family:'Space Grotesk',sans-serif}
.nlogin .hero-text h1 span{background:linear-gradient(90deg,var(--nl-accent-l),#5eead4);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.nlogin .hero-text p{font-size:16px;line-height:1.6;color:var(--nl-muted2)}
.nlogin .features-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;max-width:500px}
.nlogin .feature-item{display:flex;flex-direction:column;gap:8px}
.nlogin .feature-icon{width:36px;height:36px;border-radius:10px;background:rgba(255,255,255,.05);border:1px solid var(--nl-border-d);display:flex;align-items:center;justify-content:center;color:var(--nl-accent-l);font-size:14px;margin-bottom:4px}
.nlogin .feature-item h4{font-size:14px;font-weight:700;color:#fff}
.nlogin .feature-item p{font-size:12px;color:var(--nl-muted2);line-height:1.4}
.nlogin .form-panel{width:50%;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:48px;position:relative;background:var(--nl-bg);overflow-y:auto}
.nlogin .form-container{width:100%;max-width:400px}
.nlogin .form-header{margin-bottom:36px}
.nlogin .form-header h2{font-size:30px;font-weight:800;color:var(--nl-fg);letter-spacing:-.8px;margin-bottom:8px;font-family:'Space Grotesk',sans-serif}
.nlogin .form-header p{color:var(--nl-muted);font-size:15px;line-height:1.5}
.nlogin .section-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--nl-muted2);margin:4px 0 16px}
.nlogin .section-label.mt{margin-top:26px}
.nlogin .form-row{display:flex;gap:12px}
.nlogin .form-row .input-group{flex:1}
.nlogin .input-group{margin-bottom:20px}
.nlogin .input-group label{display:block;font-size:13px;font-weight:600;color:var(--nl-fg);margin-bottom:8px}
.nlogin .input-wrap{position:relative}
.nlogin .input-wrap input,.nlogin .input-wrap select{width:100%;background:var(--nl-card);border:1.5px solid var(--nl-border);border-radius:12px;padding:15px 16px 15px 46px;color:var(--nl-fg);font-family:inherit;font-size:14px;outline:none;transition:all .2s}
.nlogin .input-wrap select{padding-left:16px;cursor:pointer;-webkit-appearance:none;appearance:none;padding-right:38px}
.nlogin .input-wrap input::placeholder{color:var(--nl-muted2)}
.nlogin .input-wrap input:focus,.nlogin .input-wrap select:focus{border-color:var(--nl-accent);box-shadow:0 0 0 4px rgba(20,184,166,.12)}
.nlogin .input-icon{position:absolute;left:16px;top:50%;transform:translateY(-50%);color:var(--nl-muted2);font-size:15px;transition:color .2s;pointer-events:none}
.nlogin .input-wrap input:focus ~ .input-icon{color:var(--nl-accent)}
.nlogin .select-chev{position:absolute;right:16px;top:50%;transform:translateY(-50%);color:var(--nl-muted2);pointer-events:none;font-size:12px}
.nlogin .pwd-toggle{position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--nl-muted2);padding:8px;transition:color .2s}
.nlogin .pwd-toggle:hover{color:var(--nl-fg)}
.nlogin .options-row{display:flex;justify-content:space-between;align-items:center;margin:4px 0 28px}
.nlogin .remember-me{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--nl-muted);cursor:pointer;user-select:none}
.nlogin .remember-me input{display:none}
.nlogin .checkmark{width:18px;height:18px;border-radius:5px;border:1.5px solid var(--nl-border);background:var(--nl-card);display:flex;align-items:center;justify-content:center;transition:all .2s}
.nlogin .remember-me input:checked + .checkmark{background:var(--nl-accent);border-color:var(--nl-accent)}
.nlogin .checkmark i{font-size:9px;color:#fff;opacity:0;transition:opacity .1s}
.nlogin .remember-me input:checked + .checkmark i{opacity:1}
.nlogin .forgot-link{font-size:13px;color:var(--nl-accent);font-weight:600;text-decoration:none;transition:color .2s;background:none;border:none;cursor:pointer;font-family:inherit;padding:0}
.nlogin .forgot-link:hover{color:var(--nl-accent-h)}
.nlogin .err-box{display:flex;align-items:center;gap:8px;font-size:13px;color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:11px 14px;margin-bottom:18px}
.nlogin .btn-submit{width:100%;background:var(--nl-accent);color:#fff;border:none;border-radius:12px;padding:16px;font-family:inherit;font-weight:700;font-size:15px;cursor:pointer;transition:all .2s;box-shadow:0 4px 14px var(--nl-glow);display:flex;align-items:center;justify-content:center;gap:8px}
.nlogin .btn-submit:hover:not(:disabled){background:var(--nl-accent-h);transform:translateY(-2px);box-shadow:0 8px 20px var(--nl-glow)}
.nlogin .btn-submit:active{transform:translateY(0)}
.nlogin .btn-submit:disabled{opacity:.8;cursor:not-allowed}
.nlogin .signup-row{text-align:center;margin-top:24px;font-size:14px;color:var(--nl-muted)}
.nlogin .signup-row a{color:var(--nl-accent);font-weight:700;text-decoration:none}
.nlogin .signup-row a:hover{color:var(--nl-accent-h)}
.nlogin .form-footer{margin-top:36px;text-align:center;font-size:12px;color:var(--nl-muted2)}
.nlogin .nl-loader{width:16px;height:16px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:nlSpin .7s linear infinite}
@keyframes nlSpin{to{transform:rotate(360deg)}}
.nlogin .fade-up{opacity:0;transform:translateY(15px);animation:nlFadeUp .6s ease forwards}
@keyframes nlFadeUp{to{opacity:1;transform:translateY(0)}}
.nlogin .d-1{animation-delay:.1s}.nlogin .d-2{animation-delay:.2s}.nlogin .d-3{animation-delay:.3s}.nlogin .d-4{animation-delay:.4s}.nlogin .d-5{animation-delay:.5s}
@media (max-width:900px){.nlogin .visual-panel{display:none}.nlogin .form-panel{width:100%;padding:32px;min-height:100vh}}
`;
