import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import api from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../components/Toast";

interface Usuario {
  id: number; username: string; email: string | null; nombre_completo: string; rol: string;
  activo: boolean; fecha_creacion: string; permisos: string[] | null; totp_enabled?: boolean;
}

// Metadatos de cada módulo (deben coincidir con las claves del backend).
const MODULOS: Record<string, { label: string; icon: string; desc: string }> = {
  pos: { label: "Punto de Venta", icon: "fa-cash-register", desc: "Vender en caja" },
  inventario: { label: "Inventario", icon: "fa-boxes-stacked", desc: "Bodegas, stock y kardex" },
  compras: { label: "Compras", icon: "fa-cart-shopping", desc: "Proveedores y órdenes" },
  ventas: { label: "Ventas", icon: "fa-receipt", desc: "Clientes, pedidos y facturas" },
  cobranza: { label: "Cobranza", icon: "fa-hand-holding-dollar", desc: "Cuentas por cobrar / fiado" },
  ia: { label: "Asistente IA", icon: "fa-wand-magic-sparkles", desc: "Asistente inteligente" },
};

// Paleta de gradientes para avatares (determinista por username).
const AVATARES: [string, string][] = [
  ["#3b82f6", "#2563eb"], ["#8b5cf6", "#7c3aed"], ["#10b981", "#059669"],
  ["#f59e0b", "#d97706"], ["#ec4899", "#db2777"], ["#06b6d4", "#0891b2"],
];
function avatarGrad(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  const [a, b] = AVATARES[h % AVATARES.length];
  return `linear-gradient(135deg, ${a}, ${b})`;
}
function iniciales(nombre: string): string {
  const p = nombre.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || "") + (p[1]?.[0] || "")).toUpperCase() || "?";
}
function fmtFecha(s: string): string {
  return new Date(s).toLocaleDateString("es-GT", { year: "numeric", month: "short", day: "numeric" });
}

// Extrae un mensaje legible del error de la API: `detail` puede ser un string
// (errores de negocio) o una lista (validación 422 de FastAPI).
function mensajeError(err: any): string {
  const d = err?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((e: any) => e?.msg || String(e)).join("; ");
  return err?.message || "No se pudo completar la operación.";
}

// Fuerza de contraseña (0-4). El backend exige ≥8 con letra y número; esto solo guía al admin.
function fuerzaPwd(p: string): number {
  if (!p) return 0;
  let s = 0;
  if (p.length >= 8) s++;
  if (/[a-zA-Z]/.test(p) && /\d/.test(p)) s++;
  if (/[^a-zA-Z0-9]/.test(p)) s++;
  if (p.length >= 12) s++;
  return Math.min(s, 4);
}

type Filtro = "todos" | "activos" | "inactivos";
type FormState = { username: string; password: string; email: string; nombre_completo: string; rol: string; permisos: string[] };
const FORM_VACIO: FormState = { username: "", password: "", email: "", nombre_completo: "", rol: "operador", permisos: [] };

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");

  const [drawer, setDrawer] = useState<null | "new" | "edit">(null);
  const [editing, setEditing] = useState<Usuario | null>(null);
  const [form, setForm] = useState<FormState>(FORM_VACIO);
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const { user } = useAuth();
  const toast = useToast();
  // Módulos que la empresa tiene: son los únicos que se pueden asignar a un operador.
  const modulosEmpresa = user?.modulos_empresa ?? [];

  const load = async () => { const { data } = await api.get("/usuarios"); setUsuarios(data); setLoading(false); };
  useEffect(() => { load(); }, []);

  // Bloquear el scroll del body mientras el drawer está abierto + cerrar con Escape.
  useEffect(() => {
    if (!drawer) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") cerrarDrawer(); };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", onKey); };
  }, [drawer]);

  const abrirNuevo = () => { setForm(FORM_VACIO); setEditing(null); setError(""); setShowPwd(false); setDrawer("new"); };
  const abrirEditar = (u: Usuario) => {
    setForm({ username: u.username, password: "", email: u.email || "", nombre_completo: u.nombre_completo, rol: u.rol, permisos: u.permisos ?? [] });
    setEditing(u); setError(""); setShowPwd(false); setDrawer("edit");
  };
  const cerrarDrawer = () => { setDrawer(null); setEditing(null); setError(""); };

  const togglePermiso = (m: string) =>
    setForm((f) => ({ ...f, permisos: f.permisos.includes(m) ? f.permisos.filter((x) => x !== m) : [...f.permisos, m] }));

  const guardar = async () => {
    setError("");
    // Admin ve todo: no se mandan permisos. Operador: solo los módulos marcados.
    const permisos = form.rol === "operador" ? form.permisos : null;
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/usuarios/${editing.id}`, { nombre_completo: form.nombre_completo, email: form.email || null, rol: form.rol, permisos });
        toast.success("Usuario actualizado");
      } else {
        await api.post("/usuarios", { username: form.username, password: form.password, nombre_completo: form.nombre_completo, rol: form.rol, email: form.email.trim() || null, permisos });
        toast.success("Usuario creado");
      }
      cerrarDrawer(); load();
    } catch (err: any) { setError(mensajeError(err)); }
    finally { setSaving(false); }
  };

  const toggleActivo = async (u: Usuario) => {
    try { await api.put(`/usuarios/${u.id}`, { activo: !u.activo }); toast.success(u.activo ? "Usuario desactivado" : "Usuario activado"); load(); }
    catch (err: any) { toast.error(mensajeError(err)); }
  };
  const eliminar = async (u: Usuario) => {
    if (!window.confirm(`¿Eliminar a ${u.nombre_completo}? Esta acción no se puede deshacer.`)) return;
    try { await api.delete(`/usuarios/${u.id}`); toast.success("Usuario eliminado"); load(); }
    catch (err: any) { toast.error(mensajeError(err)); }
  };

  const stats = useMemo(() => ({
    total: usuarios.length,
    activos: usuarios.filter((u) => u.activo).length,
    admins: usuarios.filter((u) => u.rol === "admin").length,
    operadores: usuarios.filter((u) => u.rol === "operador").length,
  }), [usuarios]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return usuarios.filter((u) => {
      if (filtro === "activos" && !u.activo) return false;
      if (filtro === "inactivos" && u.activo) return false;
      if (!q) return true;
      return u.nombre_completo.toLowerCase().includes(q) || u.username.toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q);
    });
  }, [usuarios, busqueda, filtro]);

  const esAdmin = form.rol === "admin";
  const fuerza = fuerzaPwd(form.password);

  return (
    <div className="um-root">
      <style>{UM_CSS}</style>

      {/* Header */}
      <div className="um-header">
        <div>
          <h1 className="um-title">Gestión de Usuarios</h1>
          <p className="um-sub">Administra quiénes tienen acceso al sistema y sus permisos</p>
        </div>
        <div className="um-actions">
          <div className="um-search">
            <i className="fas fa-magnifying-glass" />
            <input placeholder="Buscar usuario o email…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          </div>
          <button className="um-btn-primary" onClick={abrirNuevo}><i className="fas fa-plus" /> Nuevo Usuario</button>
        </div>
      </div>

      {/* Stats */}
      <div className="um-stats">
        <Stat label="Total Usuarios" value={stats.total} icon="fa-users" tint="var(--text)" />
        <Stat label="Activos" value={stats.activos} icon="fa-circle-check" tint="var(--success)" />
        <Stat label="Administradores" value={stats.admins} icon="fa-crown" tint="#8b5cf6" />
        <Stat label="Operadores" value={stats.operadores} icon="fa-user-gear" tint="var(--primary)" />
      </div>

      {/* Tabla */}
      <div className="um-card">
        <div className="um-card-head">
          <h3>Usuarios del Sistema</h3>
          <div className="um-chips">
            {(["todos", "activos", "inactivos"] as Filtro[]).map((f) => (
              <button key={f} className={`um-chip ${filtro === f ? "active" : ""}`} onClick={() => setFiltro(f)}>
                {f === "todos" ? `Todos (${stats.total})` : f === "activos" ? `Activos (${stats.activos})` : `Inactivos (${stats.total - stats.activos})`}
              </button>
            ))}
          </div>
        </div>
        <div className="um-table-wrap">
          <table className="um-table">
            <thead>
              <tr><th>Usuario</th><th>Rol</th><th>Email</th><th>Estado</th><th>Creado</th><th style={{ textAlign: "right" }}>Acciones</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="um-empty">Cargando…</td></tr>
              ) : filtrados.length === 0 ? (
                <tr><td colSpan={6} className="um-empty">No se encontraron usuarios</td></tr>
              ) : filtrados.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="um-user-cell">
                      <div className="um-avatar" style={{ background: avatarGrad(u.username) }}>{iniciales(u.nombre_completo)}</div>
                      <div>
                        <div className="um-user-name">{u.nombre_completo}</div>
                        <div className="um-user-sub">@{u.username}</div>
                      </div>
                    </div>
                  </td>
                  <td><span className={`um-badge ${u.rol === "admin" ? "rol-admin" : "rol-op"}`}><span className="um-dot" />{u.rol === "admin" ? "Administrador" : "Operador"}</span></td>
                  <td className="um-muted">{u.email || "—"}</td>
                  <td><span className={`um-badge ${u.activo ? "st-active" : "st-inactive"}`}><span className="um-dot" />{u.activo ? "Activo" : "Inactivo"}</span></td>
                  <td className="um-muted">{fmtFecha(u.fecha_creacion)}</td>
                  <td>
                    <div className="um-row-actions">
                      <button className="um-abtn edit" title="Editar" onClick={() => abrirEditar(u)}><i className="fas fa-pen" /></button>
                      <button className="um-abtn toggle" title={u.activo ? "Desactivar" : "Activar"} onClick={() => toggleActivo(u)}><i className="fas fa-power-off" /></button>
                      <button className="um-abtn delete" title="Eliminar" onClick={() => eliminar(u)}><i className="fas fa-trash" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Drawer */}
      {drawer && createPortal(
        <>
          <div className="um-overlay" onClick={cerrarDrawer} />
          <aside className="um-drawer" role="dialog" aria-modal="true">
            <div className="um-drawer-head">
              <div>
                <div className="um-drawer-title">{drawer === "new" ? "Nuevo Usuario" : "Editar Usuario"}</div>
                <div className="um-drawer-sub">{drawer === "new" ? "Completá los datos para crear un acceso" : `Modificando a ${editing?.nombre_completo}`}</div>
              </div>
              <button className="um-close" onClick={cerrarDrawer} aria-label="Cerrar"><i className="fas fa-xmark" /></button>
            </div>

            <div className="um-drawer-body">
              {error && <div className="um-error">{error}</div>}

              {/* Avatar preview */}
              <div className="um-avatar-preview">
                <div className="um-avatar-lg" style={{ background: avatarGrad(form.username || form.nombre_completo || "?") }}>{iniciales(form.nombre_completo || "?")}</div>
                <div>
                  <div className="um-ap-name">{form.nombre_completo || "Nuevo Usuario"}</div>
                  <div className="um-ap-mail">{form.email || "sin email"}</div>
                </div>
              </div>

              {/* Información básica */}
              <div className="um-section">
                <div className="um-section-title">Información básica</div>
                <div className="um-group">
                  <label>Nombre completo <span className="um-req">*</span></label>
                  <input className="um-input" value={form.nombre_completo} onChange={(e) => setForm({ ...form, nombre_completo: e.target.value })} placeholder="Ej: María García" />
                </div>
                <div className="um-two-col">
                  <div className="um-group">
                    <label>Usuario <span className="um-req">*</span></label>
                    <input className="um-input" value={form.username} disabled={drawer === "edit"} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="mgarcia" />
                  </div>
                  <div className="um-group">
                    <label>Email</label>
                    <input className="um-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="usuario@empresa.com" />
                  </div>
                </div>
              </div>

              {/* Seguridad */}
              <div className="um-section">
                <div className="um-section-title">Seguridad y acceso</div>
                {drawer === "new" ? (
                  <div className="um-group">
                    <label>Contraseña <span className="um-req">*</span></label>
                    <div className="um-input-wrap">
                      <input className="um-input" style={{ paddingRight: 92 }} type={showPwd ? "text" : "password"} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" />
                      <button type="button" className="um-input-btn" onClick={() => setShowPwd((v) => !v)}>
                        <i className={`fas ${showPwd ? "fa-eye-slash" : "fa-eye"}`} /> {showPwd ? "Ocultar" : "Mostrar"}
                      </button>
                    </div>
                    <div className="um-pwd">
                      {[0, 1, 2, 3].map((i) => (
                        <div key={i} className={`um-pwd-bar ${i < fuerza ? (fuerza <= 1 ? "weak" : fuerza <= 2 ? "medium" : "strong") : ""}`} />
                      ))}
                    </div>
                    <div className="um-hint">Mínimo 8 caracteres, con al menos una letra y un número.</div>
                  </div>
                ) : (
                  <div className="um-hint" style={{ marginBottom: 4 }}><i className="fas fa-lock" style={{ marginRight: 6 }} />La contraseña la cambia el propio usuario desde su perfil.</div>
                )}

                <div className="um-toggle-row">
                  <div><div className="um-tr-label">Estado del usuario</div><div className="um-tr-desc">Los usuarios inactivos no pueden iniciar sesión</div></div>
                  {drawer === "edit" ? (
                    <div className={`um-switch ${editing?.activo ? "on" : ""}`} onClick={() => editing && toggleActivo(editing)} title="Cambiar estado" />
                  ) : (
                    <div className="um-switch on" style={{ opacity: 0.5, cursor: "default" }} title="Los usuarios nuevos nacen activos" />
                  )}
                </div>

                <div className="um-toggle-row">
                  <div><div className="um-tr-label">Verificación en 2 pasos</div><div className="um-tr-desc">La activa cada usuario desde su perfil</div></div>
                  <span className={`um-badge ${editing?.totp_enabled ? "st-active" : "st-inactive"}`} style={{ cursor: "default" }}>
                    <span className="um-dot" />{editing?.totp_enabled ? "Activa" : "Inactiva"}
                  </span>
                </div>
              </div>

              {/* Rol */}
              <div className="um-section">
                <div className="um-section-title">Rol del sistema</div>
                <div className="um-role-grid">
                  <RoleCard active={esAdmin} onClick={() => setForm({ ...form, rol: "admin" })} icon="fa-crown" tint="#8b5cf6" tintBg="#f5f3ff" name="Administrador" desc="Acceso total al sistema" />
                  <RoleCard active={!esAdmin} onClick={() => setForm({ ...form, rol: "operador" })} icon="fa-user-gear" tint="var(--success)" tintBg="var(--success-bg)" name="Operador" desc="Solo los módulos asignados" />
                </div>
              </div>

              {/* Permisos */}
              <div className="um-section">
                <div className="um-perm-head">
                  <div className="um-section-title" style={{ margin: 0 }}>Permisos de módulos</div>
                  {!esAdmin && <div className="um-perm-count">{form.permisos.filter((p) => modulosEmpresa.includes(p)).length} / {modulosEmpresa.length} módulos</div>}
                </div>
                {esAdmin ? (
                  <div className="um-admin-note"><i className="fas fa-circle-info" style={{ marginRight: 8 }} />El administrador tiene acceso a todos los módulos de la empresa.</div>
                ) : modulosEmpresa.length === 0 ? (
                  <div className="um-hint">Tu plan no tiene módulos asignables.</div>
                ) : (
                  <div className="um-perm-grid">
                    {modulosEmpresa.map((m) => {
                      const meta = MODULOS[m] || { label: m, icon: "fa-cube", desc: "" };
                      const on = form.permisos.includes(m);
                      return (
                        <div key={m} className={`um-perm-card ${on ? "on" : ""}`} onClick={() => togglePermiso(m)}>
                          <div className="um-perm-top">
                            <div className="um-perm-icon"><i className={`fas ${meta.icon}`} /></div>
                            <div className={`um-switch sm ${on ? "on" : ""}`} />
                          </div>
                          <div className="um-perm-name">{meta.label}</div>
                          <div className="um-perm-desc">{meta.desc}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="um-drawer-foot">
              <button className="um-btn-secondary" onClick={cerrarDrawer}>Cancelar</button>
              <button className="um-btn-primary" onClick={guardar} disabled={saving}>
                {saving ? <><i className="fas fa-spinner um-spin" /> Guardando…</> : <><i className="fas fa-check" /> {drawer === "new" ? "Crear usuario" : "Guardar cambios"}</>}
              </button>
            </div>
          </aside>
        </>,
        document.body
      )}
    </div>
  );
}

function Stat({ label, value, icon, tint }: { label: string; value: number; icon: string; tint: string }) {
  return (
    <div className="um-stat">
      <div className="um-stat-top">
        <span className="um-stat-label">{label}</span>
        <i className={`fas ${icon}`} style={{ color: tint, opacity: 0.5 }} />
      </div>
      <div className="um-stat-value" style={{ color: tint }}>{value}</div>
    </div>
  );
}

function RoleCard({ active, onClick, icon, tint, tintBg, name, desc }: { active: boolean; onClick: () => void; icon: string; tint: string; tintBg: string; name: string; desc: string }) {
  return (
    <div className={`um-role-card ${active ? "active" : ""}`} onClick={onClick}>
      <div className="um-role-icon" style={{ background: tintBg, color: tint }}><i className={`fas ${icon}`} /></div>
      <div><div className="um-role-name">{name}</div><div className="um-role-desc">{desc}</div></div>
    </div>
  );
}

const UM_CSS = `
.um-root{max-width:1200px}
.um-header{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;flex-wrap:wrap;margin-bottom:24px}
.um-title{font-size:24px;font-weight:800;letter-spacing:-0.5px;color:var(--text);margin:0}
.um-sub{color:var(--text-secondary);font-size:13px;margin-top:4px}
.um-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.um-search{position:relative}
.um-search i{position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--text-muted);font-size:13px}
.um-search input{background:var(--surface);border:1.5px solid var(--border);border-radius:10px;padding:10px 14px 10px 38px;font:inherit;font-size:13px;width:250px;outline:none;color:var(--text);transition:all .2s}
.um-search input:focus{border-color:var(--primary);box-shadow:0 0 0 4px var(--primary-light)}
.um-btn-primary{background:var(--primary);color:#fff;border:none;border-radius:10px;padding:10px 16px;font:inherit;font-weight:600;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;gap:8px;transition:all .2s}
.um-btn-primary:hover{background:var(--primary-hover)}
.um-btn-primary:disabled{opacity:.7;cursor:not-allowed}
.um-btn-secondary{background:var(--bg);border:1.5px solid var(--border);border-radius:10px;padding:10px 18px;font:inherit;font-weight:600;font-size:13px;color:var(--text);cursor:pointer;transition:all .2s}
.um-btn-secondary:hover{background:var(--border-light)}

.um-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px}
.um-stat{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:18px 20px}
.um-stat-top{display:flex;justify-content:space-between;align-items:center}
.um-stat-label{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);font-weight:600}
.um-stat-value{font-size:26px;font-weight:800;letter-spacing:-0.5px;margin-top:8px}

.um-card{background:var(--surface);border:1px solid var(--border);border-radius:16px;overflow:hidden}
.um-card-head{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--border);flex-wrap:wrap;gap:10px}
.um-card-head h3{font-size:15px;font-weight:700;color:var(--text);margin:0}
.um-chips{display:flex;gap:8px}
.um-chip{padding:6px 12px;border-radius:8px;background:var(--bg);border:1px solid var(--border);font:inherit;font-size:12px;font-weight:500;color:var(--text-muted);cursor:pointer;transition:all .2s}
.um-chip.active{background:var(--primary-light);color:var(--primary);border-color:var(--primary)}
.um-table-wrap{overflow-x:auto}
.um-table{width:100%;border-collapse:collapse}
.um-table thead{background:var(--bg-table-head)}
.um-table th{text-align:left;padding:12px 20px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);border-bottom:1px solid var(--border);white-space:nowrap}
.um-table td{padding:14px 20px;border-bottom:1px solid var(--border-light);font-size:13px;color:var(--text)}
.um-table tbody tr:last-child td{border-bottom:none}
.um-table tbody tr{transition:background .15s}
.um-table tbody tr:hover{background:var(--bg-table-row-hover)}
.um-empty{text-align:center;padding:40px;color:var(--text-muted)}
.um-muted{color:var(--text-secondary)}
.um-user-cell{display:flex;align-items:center;gap:12px}
.um-avatar{width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:13px;flex-shrink:0}
.um-user-name{font-weight:600;color:var(--text)}
.um-user-sub{font-size:11px;color:var(--text-muted);margin-top:1px}
.um-badge{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600}
.um-dot{width:6px;height:6px;border-radius:50%;background:currentColor}
.rol-admin{background:#f5f3ff;color:#8b5cf6}
.rol-op{background:var(--success-bg);color:var(--success-text)}
.st-active{background:var(--success-bg);color:var(--success-text)}
.st-inactive{background:var(--border-light);color:var(--text-muted)}
.um-row-actions{display:flex;gap:6px;justify-content:flex-end}
.um-abtn{width:32px;height:32px;border-radius:8px;background:transparent;border:1px solid transparent;cursor:pointer;color:var(--text-muted);display:flex;align-items:center;justify-content:center;transition:all .2s}
.um-abtn:hover{background:var(--bg)}
.um-abtn.edit:hover{background:var(--primary-light);color:var(--primary)}
.um-abtn.toggle:hover{background:var(--warning-bg);color:var(--warning)}
.um-abtn.delete:hover{background:var(--danger-bg);color:var(--danger)}

.um-overlay{position:fixed;inset:0;background:rgba(15,23,42,0.45);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);z-index:900;animation:fadeIn .25s ease}
.um-drawer{position:fixed;top:0;right:0;bottom:0;width:520px;max-width:100vw;background:var(--surface);z-index:901;display:flex;flex-direction:column;box-shadow:-10px 0 40px rgba(0,0,0,0.2);animation:umSlide .35s cubic-bezier(0.32,0.72,0,1)}
@keyframes umSlide{from{transform:translateX(100%)}to{transform:translateX(0)}}
.um-drawer-head{padding:22px 28px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-shrink:0}
.um-drawer-title{font-size:18px;font-weight:800;letter-spacing:-0.3px;color:var(--text)}
.um-drawer-sub{font-size:12px;color:var(--text-muted);margin-top:2px}
.um-close{width:36px;height:36px;border-radius:10px;background:var(--bg);border:1px solid var(--border);cursor:pointer;color:var(--text-muted);display:flex;align-items:center;justify-content:center;transition:all .2s}
.um-close:hover{background:var(--danger-bg);color:var(--danger);border-color:transparent}
.um-drawer-body{flex:1;overflow-y:auto;padding:22px 28px}
.um-drawer-foot{padding:16px 28px;border-top:1px solid var(--border);display:flex;justify-content:space-between;gap:12px;flex-shrink:0}
.um-error{background:var(--danger-bg);color:var(--danger-text);padding:10px 14px;border-radius:8px;margin-bottom:16px;font-size:13px}

.um-avatar-preview{display:flex;align-items:center;gap:16px;padding:16px;background:var(--primary-light);border:1px solid var(--border);border-radius:14px;margin-bottom:24px}
.um-avatar-lg{width:60px;height:60px;border-radius:16px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:22px;box-shadow:0 8px 20px rgba(0,0,0,0.12)}
.um-ap-name{font-weight:700;font-size:15px;color:var(--text)}
.um-ap-mail{font-size:12px;color:var(--text-muted);margin-top:2px}

.um-section{margin-bottom:26px}
.um-section-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:14px;display:flex;align-items:center;gap:8px}
.um-section-title::before{content:'';width:3px;height:14px;background:var(--primary);border-radius:2px}
.um-group{margin-bottom:14px}
.um-group label{display:block;font-size:12px;font-weight:600;color:var(--text);margin-bottom:6px}
.um-req{color:var(--danger)}
.um-input{width:100%;background:var(--surface);border:1.5px solid var(--border);border-radius:10px;padding:11px 14px;font:inherit;font-size:13px;color:var(--text);outline:none;transition:all .2s;box-sizing:border-box}
.um-input:focus{border-color:var(--primary);box-shadow:0 0 0 4px var(--primary-light)}
.um-input:disabled{opacity:.6;cursor:not-allowed}
.um-input-wrap{position:relative}
.um-input-btn{position:absolute;right:6px;top:50%;transform:translateY(-50%);background:var(--primary-light);color:var(--primary);border:none;border-radius:8px;padding:6px 10px;font:inherit;font-size:11px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:4px}
.um-input-btn:hover{background:var(--primary);color:#fff}
.um-two-col{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.um-hint{font-size:11px;color:var(--text-muted);margin-top:6px}
.um-pwd{display:flex;gap:4px;margin-top:8px}
.um-pwd-bar{flex:1;height:4px;border-radius:2px;background:var(--border);transition:all .3s}
.um-pwd-bar.weak{background:var(--danger)}
.um-pwd-bar.medium{background:var(--warning)}
.um-pwd-bar.strong{background:var(--success)}

.um-toggle-row{display:flex;justify-content:space-between;align-items:center;padding:12px 0;gap:12px}
.um-tr-label{font-size:13px;font-weight:600;color:var(--text)}
.um-tr-desc{font-size:11px;color:var(--text-muted);margin-top:2px}
.um-switch{width:42px;height:24px;border-radius:13px;background:var(--border);position:relative;cursor:pointer;transition:background .25s;flex-shrink:0}
.um-switch::after{content:'';position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;transition:all .25s cubic-bezier(0.34,1.56,0.64,1);box-shadow:0 1px 3px rgba(0,0,0,0.2)}
.um-switch.on{background:var(--success)}
.um-switch.on::after{left:21px}
.um-switch.sm{width:36px;height:20px}
.um-switch.sm::after{width:14px;height:14px}
.um-switch.sm.on::after{left:19px}

.um-role-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.um-role-card{padding:14px;border:1.5px solid var(--border);border-radius:10px;cursor:pointer;transition:all .2s;display:flex;align-items:center;gap:12px}
.um-role-card:hover{border-color:var(--primary)}
.um-role-card.active{border-color:var(--primary);background:var(--primary-light);box-shadow:0 0 0 3px var(--primary-light)}
.um-role-icon{width:36px;height:36px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0}
.um-role-name{font-size:13px;font-weight:700;color:var(--text)}
.um-role-desc{font-size:11px;color:var(--text-muted);margin-top:1px}

.um-perm-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}
.um-perm-count{font-size:11px;font-weight:600;background:var(--primary-light);color:var(--primary);padding:3px 10px;border-radius:20px}
.um-admin-note{font-size:12px;color:var(--text-secondary);background:var(--bg);border:1px dashed var(--border);border-radius:10px;padding:12px 14px}
.um-perm-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.um-perm-card{padding:14px;background:var(--bg);border:1.5px solid var(--border);border-radius:12px;cursor:pointer;transition:all .2s}
.um-perm-card:hover{border-color:var(--primary)}
.um-perm-card.on{border-color:var(--primary);background:var(--primary-light)}
.um-perm-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px}
.um-perm-icon{width:32px;height:32px;border-radius:8px;background:var(--surface);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;color:var(--primary);font-size:13px}
.um-perm-name{font-size:13px;font-weight:600;color:var(--text)}
.um-perm-desc{font-size:10px;color:var(--text-muted);margin-top:2px;line-height:1.3}
.um-spin{animation:spin .7s linear infinite}

@media(max-width:1024px){.um-stats{grid-template-columns:repeat(2,1fr)}}
@media(max-width:640px){.um-stats{grid-template-columns:1fr}.um-search input{width:100%}.um-drawer{width:100vw}.um-two-col,.um-role-grid,.um-perm-grid{grid-template-columns:1fr}}
`;
