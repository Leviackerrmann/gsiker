import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import Modal from "../components/Modal";
import Badge from "../components/Badge";
import { useToast } from "../components/Toast";
import { useAuth } from "../contexts/AuthContext";
import { formatMoney } from "../lib/money";

import type { Bodega, SKU, StockItem } from "../types";

// Movimiento del kardex (historial de un SKU). Coincide con KardexItemResponse del backend.
interface KardexRow {
  fecha: string;
  tipo: string;
  motivo: string | null;
  referencia: string | null;
  entrada_cantidad: number;
  salida_cantidad: number;
  saldo_cantidad: number;
}

// Icono según la categoría del producto (solo estético; con fallback genérico).
function catIcon(cat?: string | null): string {
  const c = (cat || "").toLowerCase();
  if (/(abarrote|grano|arroz|azucar|azúcar|harina)/.test(c)) return "fa-wheat-awn";
  if (/(lacteo|lácteo|leche|queso|yogur)/.test(c)) return "fa-cheese";
  if (/(bebida|agua|jugo|refresco|gaseosa)/.test(c)) return "fa-bottle-water";
  if (/(limpieza|deterg|jabon|jabón|cloro)/.test(c)) return "fa-spray-can-sparkles";
  if (/(carne|pollo|res|embutido)/.test(c)) return "fa-drumstick-bite";
  if (/(pan|reposter|galleta)/.test(c)) return "fa-bread-slice";
  if (/(fruta|verdura|vegetal)/.test(c)) return "fa-apple-whole";
  if (/(mp|materia)/.test(c)) return "fa-flask";
  if (/(pt|termin)/.test(c)) return "fa-box-open";
  return "fa-box";
}

function fmtFecha(s: string): string {
  return new Date(s).toLocaleDateString("es-GT", { year: "numeric", month: "short", day: "numeric" });
}
function fmtFechaHora(s: string): string {
  return new Date(s).toLocaleString("es-GT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
// Formatea cantidades sin decimales innecesarios (12.00 -> 12, 12.50 -> 12.5).
function fmtCant(n: number): string {
  return Number(n).toLocaleString("es-GT", { maximumFractionDigits: 2 });
}

// Etiqueta legible del tipo de movimiento del kardex.
function movMeta(tipo: string): { label: string; icon: string; cls: string } {
  const t = tipo.toLowerCase();
  if (t.includes("entrada")) return { label: "Entrada", icon: "fa-arrow-down", cls: "in" };
  if (t.includes("salida")) return { label: "Salida", icon: "fa-arrow-up", cls: "out" };
  if (t.includes("ajuste")) return { label: "Ajuste", icon: "fa-sliders", cls: "adj" };
  if (t.includes("transfer")) return { label: "Transferencia", icon: "fa-right-left", cls: "adj" };
  return { label: tipo, icon: "fa-arrows-rotate", cls: "adj" };
}

export default function SKUsPage() {
  const [skus, setSkus] = useState<SKU[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [bodegas, setBodegas] = useState<Bodega[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoriaFilter, setCategoriaFilter] = useState("");

  // Modal de creación/edición (lógica original intacta).
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<SKU | null>(null);
  const [form, setForm] = useState({
    codigo_sku: "", descripcion: "", unidad_medida: "UNIDAD",
    costo_unitario: "0", precio_referencia: "0", categoria: "", subcategoria: "",
  });
  const [stockIni, setStockIni] = useState({ cantidad: "", bodega_id: "" });
  const [error, setError] = useState("");

  // Drawer de detalle (nuevo).
  const [detail, setDetail] = useState<SKU | null>(null);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [stockLoading, setStockLoading] = useState(false);
  const [movs, setMovs] = useState<KardexRow[]>([]);
  const [movsLoading, setMovsLoading] = useState(false);

  const toast = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const esAdmin = user?.rol === "admin";

  // Cierra el drawer y navega al módulo Bodegas enfocando la bodega elegida.
  const irABodega = (bodegaId: number) => {
    cerrarDetalle();
    navigate(`/inventario/bodegas?focus=${bodegaId}`);
  };
  // Cierra el drawer y abre el Kardex completo de este SKU.
  const irAKardex = (skuId: number) => {
    cerrarDetalle();
    navigate(`/inventario/kardex?sku=${skuId}`);
  };
  // Cierra el drawer y filtra el catálogo por la categoría elegida.
  const filtrarCategoria = (cat: string) => {
    cerrarDetalle();
    setCategoriaFilter(cat);
  };

  const load = () => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (categoriaFilter) params.set("categoria", categoriaFilter);
    params.set("limit", "500");
    api.get(`/skus?${params}`).then((res) => { setSkus(res.data); setLoading(false); });
  };

  useEffect(() => {
    api.get("/skus/categorias").then((r) => setCategorias(r.data));
    api.get("/inventario/bodegas").then((r) => setBodegas(r.data));
    load();
  }, []);
  useEffect(() => { setLoading(true); load(); }, [search, categoriaFilter]);

  // Escape + bloqueo de scroll mientras hay drawer o modal abiertos.
  useEffect(() => {
    if (!detail) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") cerrarDetalle(); };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", onKey); };
  }, [detail]);

  const openCreate = () => {
    setForm({ codigo_sku: "", descripcion: "", unidad_medida: "UNIDAD", costo_unitario: "0", precio_referencia: "0", categoria: "", subcategoria: "" });
    setStockIni({ cantidad: "", bodega_id: "" });
    setEditing(null); setError(""); setShowModal(true);
  };

  const openEdit = (sku: SKU) => {
    setForm({
      codigo_sku: sku.codigo_sku, descripcion: sku.descripcion, unidad_medida: sku.unidad_medida,
      costo_unitario: (sku.costo_unitario ?? 0).toString(), precio_referencia: sku.precio_referencia.toString(),
      categoria: sku.categoria || "", subcategoria: sku.subcategoria || "",
    });
    setEditing(sku); setError(""); setShowModal(true);
  };

  // Abre el drawer y trae stock por bodega + últimos movimientos del SKU.
  const openDetail = (sku: SKU) => {
    setDetail(sku);
    setStock([]); setMovs([]);
    setStockLoading(true); setMovsLoading(true);
    api.get(`/inventario/stock?sku_id=${sku.id}&limit=500`)
      .then((r) => setStock(r.data))
      .catch(() => setStock([]))
      .finally(() => setStockLoading(false));
    api.get(`/inventario/kardex/${sku.id}`)
      .then((r) => setMovs(r.data.slice(-8).reverse()))
      .catch(() => setMovs([]))
      .finally(() => setMovsLoading(false));
  };
  const cerrarDetalle = () => setDetail(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    const body = {
      descripcion: form.descripcion, unidad_medida: form.unidad_medida,
      costo_unitario: Number(form.costo_unitario) || 0, precio_referencia: Number(form.precio_referencia) || 0,
      categoria: form.categoria || null, subcategoria: form.subcategoria || null,
    };
    try {
      if (editing) {
        await api.put(`/skus/${editing.id}`, body);
        toast.success(`SKU ${editing.codigo_sku} actualizado`);
      } else {
        const { data: nuevoSku } = await api.post("/skus", { ...body, codigo_sku: form.codigo_sku });
        const cant = Number(stockIni.cantidad);
        if (cant > 0 && stockIni.bodega_id) {
          await api.post("/inventario/movimientos", {
            tipo: "entrada", motivo: "stock_inicial",
            sku_id: nuevoSku.id, bodega_id: Number(stockIni.bodega_id),
            cantidad: cant, costo_unitario: Number(form.costo_unitario) || 0,
          });
          toast.success(`SKU ${nuevoSku.codigo_sku} creado con ${cant} de stock inicial`);
        } else {
          toast.success(`SKU ${nuevoSku.codigo_sku} creado`);
        }
      }
      setShowModal(false); load();
    } catch (err: any) { setError(err.response?.data?.detail || "Error al guardar"); }
  };

  const categories = categorias.filter((c) => c);
  const umOptions = ["UNIDAD", "KG", "MTS", "LITRO", "M2", "ROLLO", "PAR", "SERVICIO"];

  const stats = useMemo(() => {
    const precios = skus.map((s) => s.precio_referencia || 0).filter((p) => p > 0);
    const precioProm = precios.length ? precios.reduce((a, b) => a + b, 0) / precios.length : 0;
    return {
      total: skus.length,
      categorias: new Set(skus.map((s) => s.categoria).filter(Boolean)).size,
      precioProm,
      conLotes: skus.filter((s) => s.maneja_lotes).length,
    };
  }, [skus]);

  const margenPct = (s: SKU): number | null => {
    if (s.costo_unitario == null || !s.precio_referencia) return null;
    return ((s.precio_referencia - s.costo_unitario) / s.precio_referencia) * 100;
  };

  // Totales del drawer (stock por bodega).
  const totalCantidad = stock.reduce((a, s) => a + s.cantidad, 0);
  const totalDisponible = stock.reduce((a, s) => a + s.cantidad_disponible, 0);
  const totalReservado = stock.reduce((a, s) => a + s.cantidad_reservada, 0);

  return (
    <div className="sk-root">
      <style>{SK_CSS}</style>

      {/* Header */}
      <div className="sk-header">
        <div>
          <h1 className="sk-title">Catálogo de SKUs</h1>
          <p className="sk-sub">Gestión de productos y materiales del inventario</p>
        </div>
        <button className="sk-btn-primary" onClick={openCreate}><i className="fas fa-plus" /> Nuevo SKU</button>
      </div>

      {/* Stats */}
      <div className="sk-stats">
        <Stat label="Total SKUs" value={String(stats.total)} icon="fa-box-archive" tint="var(--primary)" />
        <Stat label="Categorías" value={String(stats.categorias)} icon="fa-folder-tree" tint="#8b5cf6" />
        <Stat label="Precio prom." value={formatMoney(stats.precioProm, "GTQ")} icon="fa-tag" tint="var(--success)" />
        <Stat label="Con lotes" value={String(stats.conLotes)} icon="fa-layer-group" tint="var(--warning)" />
      </div>

      {/* Toolbar */}
      <div className="sk-toolbar">
        <div className="sk-search">
          <i className="fas fa-magnifying-glass" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por código o descripción…" />
        </div>
        <div className="sk-chips">
          <button className={`sk-chip ${categoriaFilter === "" ? "active" : ""}`} onClick={() => setCategoriaFilter("")}>Todas</button>
          {categories.map((c) => (
            <button key={c} className={`sk-chip ${categoriaFilter === c ? "active" : ""}`} onClick={() => setCategoriaFilter(c)}>{c}</button>
          ))}
        </div>
      </div>

      {/* Tabla */}
      <div className="sk-card">
        <div className="sk-card-head">
          <h3>Listado de Productos</h3>
          <span className="sk-meta">{loading ? "…" : `${skus.length} SKUs`}</span>
        </div>
        <div className="sk-table-wrap">
          <table className="sk-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Descripción</th>
                <th>U. Medida</th>
                <th>Categoría</th>
                {esAdmin && <th style={{ textAlign: "right" }}>Costo</th>}
                <th style={{ textAlign: "right" }}>Precio Ref.</th>
                {esAdmin && <th style={{ textAlign: "right" }}>Margen</th>}
                <th style={{ width: 44 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="sk-empty">Cargando…</td></tr>
              ) : skus.length === 0 ? (
                <tr><td colSpan={8} className="sk-empty">
                  <div style={{ fontSize: 30, marginBottom: 8, opacity: 0.3 }}><i className="fas fa-box-open" /></div>
                  {search || categoriaFilter ? "No se encontraron SKUs con los filtros aplicados" : "No hay SKUs registrados"}
                </td></tr>
              ) : (
                skus.map((s) => {
                  const m = margenPct(s);
                  return (
                    <tr key={s.id} onClick={() => openDetail(s)} className="sk-row">
                      <td>
                        <div className="sk-code-cell">
                          <div className="sk-code-icon"><i className={`fas ${catIcon(s.categoria)}`} /></div>
                          <span className="sk-code">{s.codigo_sku}</span>
                        </div>
                      </td>
                      <td><span className="sk-desc">{s.descripcion}</span></td>
                      <td className="sk-muted">{s.unidad_medida}</td>
                      <td>{s.categoria ? <Badge category={s.categoria}>{s.categoria}</Badge> : <span className="sk-muted">—</span>}</td>
                      {esAdmin && <td className="sk-num sk-muted">{s.costo_unitario == null ? "—" : formatMoney(s.costo_unitario, "GTQ")}</td>}
                      <td className="sk-num sk-strong">{formatMoney(s.precio_referencia, "GTQ")}</td>
                      {esAdmin && (
                        <td className="sk-num">
                          {m == null ? <span className="sk-muted">—</span> : (
                            <span className={`sk-margin ${m < 0 ? "neg" : m < 15 ? "low" : "ok"}`}>{m.toFixed(0)}%</span>
                          )}
                        </td>
                      )}
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="sk-row-actions">
                          <button className="sk-abtn edit" title="Editar" onClick={() => openEdit(s)}><i className="fas fa-pen" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Drawer de detalle */}
      {detail && createPortal(
        <>
          <div className="sk-overlay" onClick={cerrarDetalle} />
          <aside className="sk-drawer" role="dialog" aria-modal="true">
            <div className="sk-drawer-head">
              <div>
                <div className="sk-drawer-title">Detalle del SKU</div>
                <div className="sk-drawer-sub">{detail.codigo_sku}</div>
              </div>
              <button className="sk-close" onClick={cerrarDetalle} aria-label="Cerrar"><i className="fas fa-xmark" /></button>
            </div>

            <div className="sk-drawer-body">
              {/* Hero */}
              <div className="sk-hero">
                <div className="sk-hero-icon"><i className={`fas ${catIcon(detail.categoria)}`} /></div>
                <div style={{ minWidth: 0 }}>
                  <div className="sk-hero-name">{detail.descripcion}</div>
                  <div className="sk-hero-code">{detail.codigo_sku}</div>
                  <div className="sk-hero-badges">
                    {detail.categoria && (
                      <span onClick={() => filtrarCategoria(detail.categoria!)} style={{ cursor: "pointer" }} title="Filtrar el catálogo por esta categoría">
                        <Badge category={detail.categoria}>{detail.categoria}</Badge>
                      </span>
                    )}
                    {detail.subcategoria && <span className="sk-tag">{detail.subcategoria}</span>}
                    {detail.maneja_lotes && <span className="sk-tag"><i className="fas fa-layer-group" style={{ marginRight: 5 }} />Lotes</span>}
                  </div>
                </div>
              </div>

              {/* Precios */}
              <div className="sk-section">
                <div className="sk-section-title">Precios</div>
                <div className="sk-price-grid">
                  {esAdmin && (
                    <div className="sk-price-box">
                      <div className="sk-price-label">Costo unitario</div>
                      <div className="sk-price-val">{detail.costo_unitario == null ? "—" : formatMoney(detail.costo_unitario, "GTQ")}</div>
                    </div>
                  )}
                  <div className="sk-price-box">
                    <div className="sk-price-label">Precio referencia</div>
                    <div className="sk-price-val" style={{ color: "var(--success)" }}>{formatMoney(detail.precio_referencia, "GTQ")}</div>
                  </div>
                  {esAdmin && (() => {
                    const m = margenPct(detail);
                    return (
                      <div className="sk-price-box">
                        <div className="sk-price-label">Margen</div>
                        <div className="sk-price-val">{m == null ? "—" : `${m.toFixed(0)}%`}</div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Disponibilidad por bodega */}
              <div className="sk-section">
                <div className="sk-section-title">Disponibilidad por bodega</div>

                <div className="sk-stock-summary">
                  <div><div className="sk-ss-val">{fmtCant(totalDisponible)}</div><div className="sk-ss-lbl">Disponible</div></div>
                  <div><div className="sk-ss-val" style={{ color: "var(--text-muted)" }}>{fmtCant(totalReservado)}</div><div className="sk-ss-lbl">Reservado</div></div>
                  <div><div className="sk-ss-val" style={{ color: "var(--text-muted)" }}>{fmtCant(totalCantidad)}</div><div className="sk-ss-lbl">Total físico</div></div>
                </div>

                {stockLoading ? (
                  <div className="sk-stock-empty">Cargando existencias…</div>
                ) : stock.length === 0 ? (
                  <div className="sk-stock-empty"><i className="fas fa-box-open" style={{ marginRight: 8, opacity: 0.5 }} />Este SKU no tiene stock registrado en ninguna bodega.</div>
                ) : (
                  <div className="sk-bodegas">
                    {stock.map((row) => {
                      const bajo = row.cantidad_minima != null && row.cantidad_minima > 0 && row.cantidad_disponible <= row.cantidad_minima;
                      return (
                        <div
                          key={row.id}
                          className="sk-bodega-row clickable"
                          onClick={() => irABodega(row.bodega_id)}
                          title={`Ver ${row.bodega_nombre} en el módulo Bodegas`}
                          role="button"
                        >
                          <div className="sk-bodega-info">
                            <div className={`sk-bodega-icon ${bajo ? "warn" : ""}`}><i className="fas fa-warehouse" /></div>
                            <div>
                              <div className="sk-bodega-name">
                                {row.bodega_nombre}
                                {row.lote_numero && <span className="sk-lote">Lote {row.lote_numero}</span>}
                              </div>
                              <div className="sk-bodega-meta">
                                {row.cantidad_reservada > 0 && <span>{fmtCant(row.cantidad_reservada)} reservado</span>}
                                {row.cantidad_minima != null && row.cantidad_minima > 0 && <span>mín. {fmtCant(row.cantidad_minima)}</span>}
                                {bajo && <span className="sk-lowtag"><i className="fas fa-triangle-exclamation" style={{ marginRight: 4 }} />Bajo</span>}
                              </div>
                            </div>
                          </div>
                          <div className="sk-bodega-qty">
                            <div className={`sk-qty-val ${bajo ? "warn" : ""}`}>{fmtCant(row.cantidad_disponible)}</div>
                            <div className="sk-qty-um">{detail.unidad_medida.toLowerCase()}</div>
                          </div>
                          <i className="fas fa-chevron-right sk-bodega-arrow" />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Últimos movimientos */}
              <div className="sk-section">
                <div className="sk-section-head">
                  <div className="sk-section-title" style={{ margin: 0 }}>Últimos movimientos</div>
                  {movs.length > 0 && (
                    <button className="sk-link" onClick={() => irAKardex(detail.id)}>
                      Ver todo <i className="fas fa-arrow-right" style={{ fontSize: 10 }} />
                    </button>
                  )}
                </div>
                {movsLoading ? (
                  <div className="sk-stock-empty">Cargando movimientos…</div>
                ) : movs.length === 0 ? (
                  <div className="sk-stock-empty">Sin movimientos registrados.</div>
                ) : (
                  <div className="sk-movs">
                    {movs.map((mv, i) => {
                      const meta = movMeta(mv.tipo);
                      const cant = mv.entrada_cantidad || mv.salida_cantidad;
                      const signo = mv.entrada_cantidad ? "+" : mv.salida_cantidad ? "−" : "";
                      return (
                        <div key={i} className="sk-mov">
                          <div className={`sk-mov-icon ${meta.cls}`}><i className={`fas ${meta.icon}`} /></div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="sk-mov-top">
                              <span className="sk-mov-label">{meta.label}</span>
                              <span className={`sk-mov-cant ${meta.cls}`}>{signo}{fmtCant(cant)}</span>
                            </div>
                            <div className="sk-mov-sub">
                              {fmtFechaHora(mv.fecha)}
                              {mv.motivo && <> · {mv.motivo}</>}
                              <span className="sk-mov-saldo">saldo {fmtCant(mv.saldo_cantidad)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Ficha técnica */}
              <div className="sk-section">
                <div className="sk-section-title">Ficha técnica</div>
                <div className="sk-facts">
                  <Fact label="Unidad de medida" value={detail.unidad_medida} />
                  <Fact label="Categoría" value={detail.categoria || "—"} />
                  <Fact label="Subcategoría" value={detail.subcategoria || "—"} />
                  <Fact label="Valorización" value={(detail.metodo_valorizacion || "—").toUpperCase()} />
                  <Fact label="Maneja lotes" value={detail.maneja_lotes ? "Sí" : "No"} />
                  <Fact label="Creado" value={fmtFecha(detail.fecha_creacion)} />
                </div>
              </div>
            </div>

            <div className="sk-drawer-foot">
              <button className="sk-btn-secondary" onClick={cerrarDetalle}>Cerrar</button>
              <button className="sk-btn-primary" onClick={() => { const s = detail; cerrarDetalle(); openEdit(s); }}>
                <i className="fas fa-pen" /> Editar SKU
              </button>
            </div>
          </aside>
        </>,
        document.body
      )}

      {/* Modal crear/editar (lógica original) */}
      <Modal isOpen={showModal} title={editing ? `Editar SKU: ${editing.codigo_sku}` : "Nuevo SKU"} icon="fa-barcode" subtitle={editing ? `Modificando datos de ${editing.codigo_sku}` : "Completa los datos para registrar un nuevo producto"} onClose={() => setShowModal(false)} maxWidth={560}>
        <form onSubmit={handleSubmit}>
          {error && <div style={{ background: "var(--danger-bg)", color: "var(--danger)", padding: "8px 12px", borderRadius: "var(--radius-sm)", marginBottom: 14, fontSize: 13 }}>{error}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div>
              <label style={lbl}><i className="fas fa-hashtag" style={{ fontSize: 10, marginRight: 4 }} />Código</label>
              <div style={fiWrap}>
                <input value={form.codigo_sku} onChange={(e) => setForm({ ...form, codigo_sku: e.target.value.toUpperCase() })} style={fiInp} required disabled={!!editing} placeholder="Ej: MP-00016" />
                <i className="fas fa-barcode fi-icon" />
              </div>
            </div>
            <div>
              <label style={lbl}><i className="fas fa-ruler" style={{ fontSize: 10, marginRight: 4 }} />Unidad de Medida</label>
              <div style={fiWrap}>
                <select value={form.unidad_medida} onChange={(e) => setForm({ ...form, unidad_medida: e.target.value })} style={fiSel}>
                  {umOptions.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
                <i className="fas fa-ruler fi-icon" />
              </div>
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}><i className="fas fa-align-left" style={{ fontSize: 10, marginRight: 4 }} />Descripción</label>
            <div style={fiWrap}>
              <input value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} style={fiInp} required placeholder="Descripción del producto" />
              <i className="fas fa-align-left fi-icon" />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div>
              <label style={lbl}><i className="fas fa-folder" style={{ fontSize: 10, marginRight: 4 }} />Categoría</label>
              <div style={fiWrap}>
                <input value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value.toUpperCase() })} style={fiInp} list="cat-datalist" placeholder="MP, PT, INS..." />
                <i className="fas fa-folder fi-icon" />
                <datalist id="cat-datalist">{categories.map((c) => <option key={c} value={c} />)}</datalist>
              </div>
            </div>
            <div>
              <label style={lbl}><i className="fas fa-tag" style={{ fontSize: 10, marginRight: 4 }} />Subcategoría</label>
              <div style={fiWrap}>
                <input value={form.subcategoria} onChange={(e) => setForm({ ...form, subcategoria: e.target.value })} style={fiInp} placeholder="Opcional" />
                <i className="fas fa-tag fi-icon" />
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 24 }}>
            <div>
              <label style={lbl}><i className="fas fa-dollar-sign" style={{ fontSize: 10, marginRight: 4 }} />Costo (Q)</label>
              <div style={fiWrap}>
                <input type="number" step="0.01" min="0" value={form.costo_unitario} onChange={(e) => setForm({ ...form, costo_unitario: e.target.value })} style={fiInp} />
                <i className="fas fa-dollar-sign fi-icon" />
              </div>
            </div>
            <div>
              <label style={lbl}><i className="fas fa-tag" style={{ fontSize: 10, marginRight: 4 }} />Precio Referencia (Q)</label>
              <div style={fiWrap}>
                <input type="number" step="0.01" min="0" value={form.precio_referencia} onChange={(e) => setForm({ ...form, precio_referencia: e.target.value })} style={fiInp} />
                <i className="fas fa-tag fi-icon" />
              </div>
            </div>
          </div>
          {!editing && (
            <div style={{ background: "var(--accent-soft)", borderRadius: 12, padding: "14px 16px", marginBottom: 20, border: "1px dashed var(--m-input-border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <i className="fas fa-boxes-stacked" style={{ fontSize: 12, color: "var(--accent)" }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>Stock inicial <span style={{ color: "var(--text-muted)", fontWeight: 500, textTransform: "none", letterSpacing: 0 }}>(opcional)</span></span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <label style={lbl}><i className="fas fa-cubes" style={{ fontSize: 10, marginRight: 4 }} />Cantidad</label>
                  <div style={fiWrap}>
                    <input type="number" min="0" step="0.01" value={stockIni.cantidad} onChange={(e) => setStockIni({ ...stockIni, cantidad: e.target.value })} style={fiInp} placeholder="0" />
                    <i className="fas fa-cubes fi-icon" />
                  </div>
                </div>
                <div>
                  <label style={lbl}><i className="fas fa-warehouse" style={{ fontSize: 10, marginRight: 4 }} />Bodega</label>
                  <div style={fiWrap}>
                    <select value={stockIni.bodega_id} onChange={(e) => setStockIni({ ...stockIni, bodega_id: e.target.value })} style={fiSel}>
                      <option value="">Sin stock inicial</option>
                      {bodegas.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
                    </select>
                    <i className="fas fa-warehouse fi-icon" />
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 10, display: "flex", alignItems: "center", gap: 5 }}>
                <i className="fas fa-circle-info" style={{ fontSize: 10, color: "var(--accent)" }} /> Genera un movimiento de entrada con el costo indicado arriba.
              </div>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 16, borderTop: "1px solid var(--m-divider)" }}>
            <button type="button" onClick={() => setShowModal(false)} style={btnGhost}>Cancelar</button>
            <button type="submit" style={btnPri}><i className="fas fa-check" style={{ fontSize: 11 }} /> {editing ? "Guardar cambios" : "Crear SKU"}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function Stat({ label, value, icon, tint }: { label: string; value: string; icon: string; tint: string }) {
  return (
    <div className="sk-stat">
      <div className="sk-stat-top">
        <span className="sk-stat-label">{label}</span>
        <i className={`fas ${icon}`} style={{ color: tint, opacity: 0.55 }} />
      </div>
      <div className="sk-stat-value" style={{ color: tint }}>{value}</div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="sk-fact">
      <span className="sk-fact-label">{label}</span>
      <span className="sk-fact-value">{value}</span>
    </div>
  );
}

const btnPri: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none", color: "#fff", fontFamily: "inherit", background: "linear-gradient(135deg, var(--accent-grad-start), var(--accent-grad-end))", boxShadow: "0 4px 16px var(--accent-glow)", transition: "all .25s ease" };
const btnGhost: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", fontFamily: "inherit", transition: "all .3s ease" };
const fiInp: React.CSSProperties = { width: "100%", padding: "11px 14px 11px 40px", borderRadius: 10, border: "1.5px solid var(--m-input-border)", background: "var(--m-input-bg)", color: "var(--text-primary)", fontSize: 13.5, fontFamily: "inherit", outline: "none", boxSizing: "border-box", transition: "all .25s ease" };
const fiSel: React.CSSProperties = { width: "100%", padding: "11px 36px 11px 40px", borderRadius: 10, border: "1.5px solid var(--m-input-border)", background: "var(--m-input-bg)", color: "var(--text-primary)", fontSize: 13.5, fontFamily: "inherit", outline: "none", cursor: "pointer", appearance: "none", WebkitAppearance: "none", boxSizing: "border-box", transition: "all .25s ease" };
const fiWrap: React.CSSProperties = { position: "relative" };
const lbl: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".8px", color: "var(--text-muted)", marginBottom: 8, transition: "color .35s" };

const SK_CSS = `
.sk-root{max-width:1200px}
.sk-header{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;flex-wrap:wrap;margin-bottom:24px}
.sk-title{font-family:'Space Grotesk',sans-serif;font-size:26px;font-weight:700;letter-spacing:-0.5px;color:var(--text);margin:0}
.sk-sub{color:var(--text-secondary);font-size:13px;margin-top:4px}
.sk-btn-primary{background:var(--primary);color:#fff;border:none;border-radius:10px;padding:10px 16px;font:inherit;font-weight:600;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;gap:8px;transition:all .2s}
.sk-btn-primary:hover{background:var(--primary-hover)}
.sk-btn-secondary{background:var(--bg);border:1.5px solid var(--border);border-radius:10px;padding:10px 18px;font:inherit;font-weight:600;font-size:13px;color:var(--text);cursor:pointer;transition:all .2s}
.sk-btn-secondary:hover{background:var(--border-light)}

.sk-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:22px}
.sk-stat{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:18px 20px}
.sk-stat-top{display:flex;justify-content:space-between;align-items:center}
.sk-stat-label{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);font-weight:600}
.sk-stat-value{font-size:23px;font-weight:800;letter-spacing:-0.5px;margin-top:8px}

.sk-toolbar{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:14px 18px;margin-bottom:16px;display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.sk-search{position:relative;flex:1;min-width:220px;max-width:380px}
.sk-search i{position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--text-muted);font-size:13px}
.sk-search input{width:100%;background:var(--bg);border:1.5px solid var(--border);border-radius:10px;padding:10px 14px 10px 38px;font:inherit;font-size:13px;outline:none;color:var(--text);transition:all .2s}
.sk-search input:focus{border-color:var(--primary);box-shadow:0 0 0 4px var(--primary-light);background:var(--surface)}
.sk-chips{display:flex;gap:8px;flex-wrap:wrap}
.sk-chip{padding:8px 14px;border-radius:8px;background:var(--bg);border:1px solid var(--border);font:inherit;font-size:12px;font-weight:500;color:var(--text-muted);cursor:pointer;transition:all .2s}
.sk-chip:hover{color:var(--text)}
.sk-chip.active{background:var(--primary-light);color:var(--primary);border-color:var(--primary)}

.sk-card{background:var(--surface);border:1px solid var(--border);border-radius:16px;overflow:hidden}
.sk-card-head{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--border)}
.sk-card-head h3{font-size:15px;font-weight:700;color:var(--text);margin:0}
.sk-meta{font-size:12px;color:var(--text-muted)}
.sk-table-wrap{overflow-x:auto}
.sk-table{width:100%;border-collapse:collapse}
.sk-table thead{background:var(--bg-table-head)}
.sk-table th{text-align:left;padding:12px 20px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);border-bottom:1px solid var(--border);white-space:nowrap}
.sk-table td{padding:12px 20px;border-bottom:1px solid var(--border-light);font-size:13px;color:var(--text);vertical-align:middle}
.sk-table tbody tr:last-child td{border-bottom:none}
.sk-row{cursor:pointer;transition:background .15s}
.sk-row:hover{background:var(--bg-table-row-hover)}
.sk-empty{text-align:center;padding:44px;color:var(--text-muted)}
.sk-muted{color:var(--text-secondary)}
.sk-num{text-align:right;font-family:'Space Grotesk',sans-serif;white-space:nowrap}
.sk-strong{font-weight:700;color:var(--text)}
.sk-code-cell{display:flex;align-items:center;gap:10px}
.sk-code-icon{width:34px;height:34px;border-radius:9px;background:var(--primary-light);color:var(--primary);display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0}
.sk-code{font-family:'Space Grotesk',sans-serif;font-weight:700;color:var(--primary);font-size:13px}
.sk-desc{color:var(--text);font-weight:500;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block}
.sk-margin{font-weight:700}
.sk-margin.ok{color:var(--success)}
.sk-margin.low{color:var(--warning)}
.sk-margin.neg{color:var(--danger)}
.sk-row-actions{display:flex;gap:6px;justify-content:flex-end}
.sk-abtn{width:32px;height:32px;border-radius:8px;background:transparent;border:1px solid transparent;cursor:pointer;color:var(--text-muted);display:flex;align-items:center;justify-content:center;transition:all .2s}
.sk-abtn.edit:hover{background:var(--primary-light);color:var(--primary)}

.sk-overlay{position:fixed;inset:0;background:rgba(15,23,42,0.45);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);z-index:900;animation:fadeIn .25s ease}
.sk-drawer{position:fixed;top:0;right:0;bottom:0;width:520px;max-width:100vw;background:var(--surface);z-index:901;display:flex;flex-direction:column;box-shadow:-10px 0 40px rgba(0,0,0,0.2);animation:skSlide .35s cubic-bezier(0.32,0.72,0,1)}
@keyframes skSlide{from{transform:translateX(100%)}to{transform:translateX(0)}}
.sk-drawer-head{padding:22px 28px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-shrink:0}
.sk-drawer-title{font-size:18px;font-weight:800;letter-spacing:-0.3px;color:var(--text)}
.sk-drawer-sub{font-size:12px;color:var(--text-muted);margin-top:2px;font-family:'Space Grotesk',sans-serif}
.sk-close{width:36px;height:36px;border-radius:10px;background:var(--bg);border:1px solid var(--border);cursor:pointer;color:var(--text-muted);display:flex;align-items:center;justify-content:center;transition:all .2s}
.sk-close:hover{background:var(--danger-bg);color:var(--danger);border-color:transparent}
.sk-drawer-body{flex:1;overflow-y:auto;padding:22px 28px}
.sk-drawer-foot{padding:16px 28px;border-top:1px solid var(--border);display:flex;justify-content:space-between;gap:12px;flex-shrink:0}

.sk-hero{display:flex;align-items:center;gap:16px;padding:18px;background:var(--primary-light);border:1px solid var(--border);border-radius:14px;margin-bottom:24px}
.sk-hero-icon{width:60px;height:60px;border-radius:16px;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;box-shadow:0 8px 20px rgba(0,0,0,0.12)}
.sk-hero-name{font-weight:700;font-size:16px;color:var(--text);line-height:1.25}
.sk-hero-code{font-size:12px;color:var(--text-muted);margin-top:2px;font-family:'Space Grotesk',sans-serif}
.sk-hero-badges{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.sk-tag{display:inline-flex;align-items:center;padding:3px 9px;border-radius:20px;font-size:11px;font-weight:600;background:var(--surface);border:1px solid var(--border);color:var(--text-secondary)}

.sk-section{margin-bottom:26px}
.sk-section-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:14px;display:flex;align-items:center;gap:8px}
.sk-section-title::before{content:'';width:3px;height:14px;background:var(--primary);border-radius:2px}
.sk-section-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}
.sk-link{background:none;border:none;font:inherit;font-size:12px;font-weight:600;color:var(--primary);cursor:pointer;display:inline-flex;align-items:center;gap:5px;padding:2px 4px;border-radius:6px;transition:all .18s}
.sk-link:hover{gap:8px;text-decoration:underline}

.sk-price-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px}
.sk-price-box{background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:14px}
.sk-price-label{font-size:11px;color:var(--text-muted);font-weight:600}
.sk-price-val{font-family:'Space Grotesk',sans-serif;font-size:18px;font-weight:800;color:var(--text);margin-top:6px}

.sk-stock-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px}
.sk-stock-summary>div{background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:12px;text-align:center}
.sk-ss-val{font-family:'Space Grotesk',sans-serif;font-size:20px;font-weight:800;color:var(--success)}
.sk-ss-lbl{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);font-weight:600;margin-top:2px}
.sk-stock-empty{background:var(--bg);border:1px dashed var(--border);border-radius:12px;padding:16px;font-size:12px;color:var(--text-muted);text-align:center}
.sk-bodegas{display:flex;flex-direction:column;gap:8px}
.sk-bodega-row{display:flex;align-items:center;gap:12px;background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:12px 14px;transition:all .18s}
.sk-bodega-row.clickable{cursor:pointer}
.sk-bodega-row.clickable:hover{border-color:var(--primary);background:var(--primary-light);transform:translateX(2px)}
.sk-bodega-arrow{color:var(--text-muted);font-size:12px;flex-shrink:0;transition:all .18s;opacity:.5}
.sk-bodega-row.clickable:hover .sk-bodega-arrow{color:var(--primary);opacity:1;transform:translateX(2px)}
.sk-bodega-info{display:flex;align-items:center;gap:12px;min-width:0;flex:1}
.sk-bodega-icon{width:38px;height:38px;border-radius:10px;background:var(--primary-light);color:var(--primary);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0}
.sk-bodega-icon.warn{background:var(--warning-bg);color:var(--warning)}
.sk-bodega-name{font-weight:600;font-size:13px;color:var(--text);display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.sk-lote{font-size:10px;font-weight:600;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:1px 6px;color:var(--text-muted)}
.sk-bodega-meta{font-size:11px;color:var(--text-muted);margin-top:3px;display:flex;gap:10px;flex-wrap:wrap}
.sk-lowtag{color:var(--warning);font-weight:700}
.sk-bodega-qty{text-align:right;flex-shrink:0}
.sk-qty-val{font-family:'Space Grotesk',sans-serif;font-size:19px;font-weight:800;color:var(--text)}
.sk-qty-val.warn{color:var(--warning)}
.sk-qty-um{font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px}

.sk-movs{display:flex;flex-direction:column;gap:6px}
.sk-mov{display:flex;align-items:center;gap:12px;padding:10px 12px;background:var(--bg);border:1px solid var(--border);border-radius:10px}
.sk-mov-icon{width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0}
.sk-mov-icon.in{background:var(--success-bg);color:var(--success-text)}
.sk-mov-icon.out{background:var(--danger-bg);color:var(--danger-text)}
.sk-mov-icon.adj{background:var(--warning-bg);color:var(--warning)}
.sk-mov-top{display:flex;justify-content:space-between;align-items:center;gap:10px}
.sk-mov-label{font-size:12px;font-weight:600;color:var(--text)}
.sk-mov-cant{font-family:'Space Grotesk',sans-serif;font-weight:800;font-size:13px}
.sk-mov-cant.in{color:var(--success)}
.sk-mov-cant.out{color:var(--danger)}
.sk-mov-cant.adj{color:var(--warning)}
.sk-mov-sub{font-size:10.5px;color:var(--text-muted);margin-top:2px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.sk-mov-saldo{margin-left:auto;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:0 6px;font-weight:600}

.sk-facts{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--border);border:1px solid var(--border);border-radius:12px;overflow:hidden}
.sk-fact{background:var(--surface);padding:12px 14px;display:flex;flex-direction:column;gap:3px}
.sk-fact-label{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);font-weight:600}
.sk-fact-value{font-size:13px;font-weight:600;color:var(--text)}

@media(max-width:1024px){.sk-stats{grid-template-columns:repeat(2,1fr)}}
@media(max-width:640px){.sk-stats{grid-template-columns:1fr}.sk-search{max-width:none}.sk-drawer{width:100vw}.sk-facts{grid-template-columns:1fr}}
`;
