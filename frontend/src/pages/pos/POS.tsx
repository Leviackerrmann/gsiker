import { useEffect, useMemo, useRef, useState } from "react";
import api from "../../lib/api";
import Modal from "../../components/Modal";
import SearchableSelect from "../../components/SearchableSelect";
import { useToast } from "../../components/Toast";
import { useAuth } from "../../contexts/AuthContext";
import { useChrome } from "../../contexts/ChromeContext";
import { formatMoney } from "../../lib/money";
import { uuidv4 } from "../../lib/uuid";
import type { SKU, Bodega, StockItem } from "../../types";

interface Cliente { id: number; codigo: string; nombre: string; }

// --- Contratos del backend POS (/api/pos) ---
interface CajaSesion {
  id: number; usuario_id: number | null; estado: string; monto_inicial: number;
  fecha_apertura: string; fecha_cierre: string | null;
  monto_esperado: number | null; monto_final_declarado: number | null; diferencia: number | null;
}
interface PagoResp { id: number; metodo: string; monto: number; monto_recibido: number | null; cambio: number | null; }
interface ItemResp { id: number; sku_id: number; cantidad: number; precio_unitario: number; precio_total: number; }
interface VentaResp {
  id: number; numero: string; caja_sesion_id: number; bodega_id: number; cliente_id: number | null;
  fecha: string; subtotal: number; impuesto_porcentaje: number; impuesto_total: number;
  descuento_porcentaje?: number; descuento_monto?: number; total: number;
  estado: string; items: ItemResp[]; pagos: PagoResp[];
}
interface ResumenDia { fecha: string; num_ventas: number; total: number; por_metodo: Record<string, number>; }

interface CartLine { sku_id: number; codigo: string; descripcion: string; cantidad: number; precio_unitario: number; }

const METODOS = [
  { value: "efectivo", label: "Efectivo", icon: "fa-money-bill-wave" },
  { value: "tarjeta", label: "Tarjeta", icon: "fa-credit-card" },
  { value: "transferencia", label: "Transferencia", icon: "fa-building-columns" },
];

// Icono por categoría (sin imágenes de producto en el sistema).
function catIcon(cat: string | null): string {
  const c = (cat || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (c.includes("bebid")) return "fa-mug-hot";
  if (c.includes("lacte")) return "fa-cheese";
  if (c.includes("pan")) return "fa-bread-slice";
  if (c.includes("snack") || c.includes("golos")) return "fa-cookie";
  if (c.includes("limp")) return "fa-soap";
  if (c.includes("bebe") || c.includes("higien")) return "fa-hand-sparkles";
  return "fa-box";
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export default function POSPage() {
  const toast = useToast();
  const { empresa } = useAuth();
  const { collapsed, setCollapsed } = useChrome();
  const moneda = empresa?.moneda || "GTQ";
  // IVA GT según régimen (igual que el backend): pequeño contribuyente 5%, general 12%.
  const ivaPct = empresa?.regimen_fiscal === "pequeno_contribuyente" ? 5 : 12;

  const [caja, setCaja] = useState<CajaSesion | null>(null);
  const [loadingCaja, setLoadingCaja] = useState(true);

  // Colapsar el sidebar SOLO con la caja abierta (terminal a pantalla completa).
  // Con la caja cerrada se mantiene visible para poder navegar a otros módulos.
  // El botón ☰ de la topbar permite expandirlo/contraerlo durante la venta.
  useEffect(() => { setCollapsed(!!caja); return () => setCollapsed(false); }, [caja, setCollapsed]);

  const [skus, setSkus] = useState<SKU[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [catActiva, setCatActiva] = useState<string>("all");
  const [bodegas, setBodegas] = useState<Bodega[]>([]);
  const [bodegaId, setBodegaId] = useState<number | null>(null);
  const [stockMap, setStockMap] = useState<Record<number, number>>({});

  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [editandoPrecio, setEditandoPrecio] = useState<number | null>(null);

  const [metodo, setMetodo] = useState("efectivo");
  const [montoRecibido, setMontoRecibido] = useState<string>("");
  const [descuento, setDescuento] = useState<string>("0");
  const [cobrando, setCobrando] = useState(false);
  // Panel derecho en 2 pasos: 1 = carrito, 2 = cobro (se deslizan).
  const [paso, setPaso] = useState<1 | 2>(1);

  // Venta al fiado (crédito)
  const [aCredito, setACredito] = useState(false);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteId, setClienteId] = useState("");

  // Clave de idempotencia: una por venta en curso; evita duplicados por doble-clic.
  const idemKey = useRef<string>(uuidv4());

  // Modales
  const [abrirOpen, setAbrirOpen] = useState(false);
  const [montoInicial, setMontoInicial] = useState("0");
  const [cerrarOpen, setCerrarOpen] = useState(false);
  const [montoDeclarado, setMontoDeclarado] = useState("");
  const [ticket, setTicket] = useState<VentaResp | null>(null);
  const [resumen, setResumen] = useState<ResumenDia | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);

  const cargarCaja = () => {
    setLoadingCaja(true);
    api.get("/pos/caja/actual")
      .then((r) => setCaja(r.data))
      .catch(() => setCaja(null))
      .finally(() => setLoadingCaja(false));
  };

  const cargarStock = () => {
    api.get("/inventario/stock").then((r) => {
      const items: StockItem[] = r.data;
      const map: Record<number, number> = {};
      for (const it of items) {
        if (bodegaId != null && it.bodega_id !== bodegaId) continue;
        map[it.sku_id] = (map[it.sku_id] || 0) + it.cantidad_disponible;
      }
      setStockMap(map);
    }).catch(() => setStockMap({}));
  };

  useEffect(() => { cargarCaja(); }, []);

  useEffect(() => {
    api.get("/skus").then((r) => setSkus(r.data)).catch(() => setSkus([]));
    api.get("/skus/categorias").then((r) => setCategorias(r.data)).catch(() => setCategorias([]));
    api.get("/inventario/bodegas").then((r) => {
      const bs: Bodega[] = (r.data as Bodega[]).filter((b) => b.activa);
      setBodegas(bs);
      if (bs.length) setBodegaId((prev) => prev ?? bs[0].id);
    }).catch(() => setBodegas([]));
    api.get("/ventas/clientes").then((r) => setClientes(r.data)).catch(() => setClientes([]));
  }, []);

  useEffect(() => { if (bodegaId != null) cargarStock(); /* eslint-disable-next-line */ }, [bodegaId]);

  // --- Carrito ---
  const bruto = useMemo(() => round2(cart.reduce((s, l) => s + l.cantidad * l.precio_unitario, 0)), [cart]);
  const descPct = Math.max(0, Math.min(parseFloat(descuento) || 0, 100));
  const descuentoMonto = round2(bruto * descPct / 100);
  const total = round2(bruto - descuentoMonto);
  // IVA incluido en el total (ya con descuento), solo informativo en el desglose.
  const impuesto = round2(total - total / (1 + ivaPct / 100));
  const numArticulos = useMemo(() => cart.reduce((s, l) => s + l.cantidad, 0), [cart]);
  const recibido = parseFloat(montoRecibido) || 0;
  // Contado: `recibido` es el efectivo entregado → cambio. Crédito: es el abono inicial → saldo al fiado.
  const cambio = !aCredito && metodo === "efectivo" ? round2(Math.max(0, recibido - total)) : 0;
  const saldoFiado = aCredito ? round2(Math.max(0, total - recibido)) : 0;

  const productos = useMemo(() => {
    const q = search.trim().toLowerCase();
    return skus.filter((s) =>
      (catActiva === "all" || s.categoria === catActiva) &&
      (!q || s.codigo_sku.toLowerCase().includes(q) || s.descripcion.toLowerCase().includes(q))
    );
  }, [skus, search, catActiva]);

  const cantEnCarrito = (skuId: number) => cart.find((l) => l.sku_id === skuId)?.cantidad ?? 0;
  const clienteSel = clientes.find((c) => String(c.id) === clienteId);

  const addToCart = (sku: SKU) => {
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.sku_id === sku.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], cantidad: copy[idx].cantidad + 1 };
        return copy;
      }
      return [...prev, {
        sku_id: sku.id, codigo: sku.codigo_sku, descripcion: sku.descripcion,
        cantidad: 1, precio_unitario: sku.precio_referencia || 0,
      }];
    });
  };

  const setLinea = (sku_id: number, patch: Partial<CartLine>) =>
    setCart((prev) => prev.map((l) => (l.sku_id === sku_id ? { ...l, ...patch } : l)));
  const cambiarCantidad = (sku_id: number, delta: number) =>
    setCart((prev) => prev.flatMap((l) => {
      if (l.sku_id !== sku_id) return [l];
      const c = l.cantidad + delta;
      return c <= 0 ? [] : [{ ...l, cantidad: c }];
    }));
  const quitarLinea = (sku_id: number) => setCart((prev) => prev.filter((l) => l.sku_id !== sku_id));
  const limpiar = () => { setCart([]); setMontoRecibido(""); setMetodo("efectivo"); setACredito(false); setClienteId(""); setDescuento("0"); setPaso(1); };

  // --- Acciones ---
  const abrirCaja = async () => {
    try {
      const { data } = await api.post("/pos/caja/abrir", { monto_inicial: parseFloat(montoInicial) || 0 });
      setCaja(data); setAbrirOpen(false); setMontoInicial("0");
      toast.success("Caja abierta");
    } catch (e: any) { toast.error(e.response?.data?.detail || "No se pudo abrir la caja"); }
  };

  const cobrar = async () => {
    if (!caja || cart.length === 0 || bodegaId == null) return;
    if (total <= 0) { toast.error("El total debe ser mayor a 0"); return; }
    if (aCredito && !clienteId) { toast.error("Debes seleccionar un cliente para fiar la venta"); return; }
    if (!aCredito && metodo === "efectivo" && recibido > 0 && recibido < total) {
      toast.error("El efectivo recibido no cubre el total"); return;
    }
    setCobrando(true);
    try {
      const items = cart.map((l) => ({ sku_id: l.sku_id, cantidad: l.cantidad, precio_unitario: l.precio_unitario }));
      let body: any;
      if (aCredito) {
        // El abono inicial (recibido) puede ser 0 o parcial; el resto queda al fiado.
        const pagos = recibido > 0 ? [{ metodo, monto: Math.min(recibido, total) }] : [];
        body = { caja_sesion_id: caja.id, bodega_id: bodegaId, cliente_id: Number(clienteId), items, pagos, a_credito: true };
      } else {
        const pago: any = { metodo, monto: total };
        if (metodo === "efectivo") pago.monto_recibido = recibido > 0 ? recibido : total;
        body = { caja_sesion_id: caja.id, bodega_id: bodegaId, items, pagos: [pago] };
        if (clienteId) body.cliente_id = Number(clienteId);
      }
      body.descuento_porcentaje = descPct;
      body.idempotency_key = idemKey.current;
      const { data } = await api.post("/pos/ventas", body);
      idemKey.current = uuidv4(); // nueva clave para la siguiente venta
      setTicket(data);
      limpiar();
      cargarStock();
      toast.success(aCredito ? `Venta ${data.numero} al fiado registrada` : `Venta ${data.numero} registrada`);
    } catch (e: any) {
      toast.error(e.response?.data?.detail || "No se pudo registrar la venta");
    } finally { setCobrando(false); }
  };

  const cerrarCaja = async () => {
    if (!caja) return;
    try {
      const { data } = await api.post(`/pos/caja/${caja.id}/cerrar`, {
        monto_final_declarado: parseFloat(montoDeclarado) || 0,
      });
      setCerrarOpen(false); setMontoDeclarado("");
      setCaja(null);
      toast.success(`Caja cerrada. Diferencia: ${formatMoney(data.diferencia, moneda)}`);
    } catch (e: any) { toast.error(e.response?.data?.detail || "No se pudo cerrar la caja"); }
  };

  const verResumen = async () => {
    try { const { data } = await api.get("/pos/resumen/hoy"); setResumen(data); }
    catch { toast.error("No se pudo cargar el resumen"); }
  };

  // --- Render ---
  if (loadingCaja) {
    return <div style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)" }}>Cargando caja...</div>;
  }

  // Sin caja abierta: pantalla de apertura.
  if (!caja) {
    return (
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", marginBottom: 20 }}>Punto de Venta</h2>
        <div style={{ ...card, maxWidth: 460, margin: "40px auto", textAlign: "center" }}>
          <div style={{ fontSize: 40, color: "var(--primary)", marginBottom: 12 }}>
            <i className="fas fa-cash-register" />
          </div>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>Caja cerrada</h3>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 20 }}>
            Abre una caja para empezar a vender. Ingresa el efectivo con el que inicias el turno.
          </p>
          <button onClick={() => setAbrirOpen(true)} style={{ ...btnPri, background: "var(--primary)", width: "100%" }}>
            <i className="fas fa-lock-open" style={{ marginRight: 8 }} />Abrir caja
          </button>
        </div>

        <Modal isOpen={abrirOpen} title="Abrir caja" onClose={() => setAbrirOpen(false)} maxWidth={380}>
          <label style={lbl}>Monto inicial en efectivo</label>
          <input type="number" value={montoInicial} onChange={(e) => setMontoInicial(e.target.value)}
            autoFocus min={0} step="0.01" style={inp} />
          <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
            <button onClick={() => setAbrirOpen(false)} style={btnGhost}>Cancelar</button>
            <button onClick={abrirCaja} style={{ ...btnPri, background: "var(--primary)" }}>Abrir</button>
          </div>
        </Modal>
      </div>
    );
  }

  // Caja abierta: terminal de venta.
  return (
    <div className="pos-root">
      <style>{POS_CSS}</style>

      <div className="pos-grid">
        {/* ---------------- CATÁLOGO ---------------- */}
        <section className="pos-catalog">
          <div className="pos-cat-topline">
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
              <button className="pos-menu-btn" onClick={() => setCollapsed(!collapsed)}
                title={collapsed ? "Mostrar menú lateral" : "Ocultar menú (pantalla completa)"}>
                <i className={`fas ${collapsed ? "fa-bars" : "fa-angles-left"}`} />
              </button>
              <h2 style={{ fontSize: 19, fontWeight: 800, color: "var(--text)", margin: 0, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                Punto de Venta
                <span className="pos-caja-badge"><span className="dot" />Caja abierta · {formatMoney(caja.monto_inicial, moneda)}</span>
              </h2>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {bodegas.length > 1 && (
                <select value={bodegaId ?? ""} onChange={(e) => setBodegaId(Number(e.target.value))} style={{ ...btnSm, paddingRight: 28 }}>
                  {bodegas.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
                </select>
              )}
              <button onClick={verResumen} style={btnSm}><i className="fas fa-chart-simple" style={{ marginRight: 6 }} />Resumen de hoy</button>
              <button onClick={() => setCerrarOpen(true)} style={{ ...btnSm, color: "var(--danger)" }}>
                <i className="fas fa-lock" style={{ marginRight: 6 }} />Cerrar caja
              </button>
            </div>
          </div>
          <div className="pos-catalog-head">
            <div className="pos-search">
              <i className="fas fa-magnifying-glass" />
              <input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && productos[0]) { addToCart(productos[0]); setSearch(""); } }}
                placeholder="Buscar por nombre o código…" autoFocus />
            </div>
            <div className="pos-cats">
              <button className={`pos-cat ${catActiva === "all" ? "active" : ""}`} onClick={() => setCatActiva("all")}>Todos</button>
              {categorias.map((c) => (
                <button key={c} className={`pos-cat ${catActiva === c ? "active" : ""}`} onClick={() => setCatActiva(c)}>{c}</button>
              ))}
            </div>
          </div>

          <div className="pos-products-scroll">
            {productos.length === 0 ? (
              <div className="pos-empty-cat"><i className="fas fa-box-open" /><p>No se encontraron productos</p></div>
            ) : (
              <div className="pos-products">
                {productos.map((s) => {
                  const enCarrito = cantEnCarrito(s.id);
                  const disp = stockMap[s.id] ?? 0;
                  return (
                    <div key={s.id} className="pos-product" onClick={() => addToCart(s)}>
                      {enCarrito > 0 && <div className="pos-product-badge">{enCarrito}</div>}
                      <div className="pos-product-img"><i className={`fas ${catIcon(s.categoria)}`} /></div>
                      <div className="pos-product-name">{s.descripcion}</div>
                      <div className="pos-product-code">{s.codigo_sku} · {disp} disp.</div>
                      <div className="pos-product-bottom">
                        <div className="pos-product-price">{formatMoney(s.precio_referencia, moneda)}</div>
                        <button className="pos-add" onClick={(e) => { e.stopPropagation(); addToCart(s); }}><i className="fas fa-plus" /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* ---------------- CHECKOUT (2 pasos deslizables) ---------------- */}
        <aside className="pos-checkout">
          {/* Barra de progreso */}
          <div className="pos-stepbar">
            <div className={`pos-stepdot ${paso === 1 ? "active" : "done"}`}>
              <span className="num">{paso === 2 ? <i className="fas fa-check" /> : "1"}</span>Carrito
            </div>
            <div className={`pos-stepline ${paso === 2 ? "done" : ""}`} />
            <div className={`pos-stepdot ${paso === 2 ? "active" : ""}`}>
              <span className="num">2</span>Cobro
            </div>
          </div>

          <div className="pos-panel">
            {/* ===== PASO 1: CARRITO ===== */}
            <div className="pos-step" style={{ transform: `translateX(${paso === 1 ? 0 : -100}%)` }}>
              <div className="s1-header">
                <div>
                  <h3>Venta actual</h3>
                  <div className="s1-ticket">#{idemKey.current.slice(0, 8).toUpperCase()} · {numArticulos} art.</div>
                </div>
                <div className="s1-actions">
                  <button className="pos-icon-btn" title="Suspender venta (próximamente)" disabled><i className="fas fa-pause" /></button>
                  <button className="pos-icon-btn danger" title="Vaciar" onClick={limpiar} disabled={cart.length === 0}><i className="fas fa-trash" /></button>
                </div>
              </div>

              <div className="pos-cart">
                {cart.length === 0 ? (
                  <div className="pos-empty-cart">
                    <div className="pos-empty-icon"><i className="fas fa-cart-shopping" /></div>
                    <h4>Carrito vacío</h4>
                    <p>Buscá un producto o tocá una tarjeta del catálogo para agregarlo.</p>
                  </div>
                ) : cart.map((l) => (
                  <div key={l.sku_id} className="pos-cart-item">
                    <div className="pos-cart-img"><i className="fas fa-box" /></div>
                    <div className="pos-cart-info">
                      <div className="pos-cart-name">{l.descripcion}</div>
                      {editandoPrecio === l.sku_id ? (
                        <input type="number" min={0} step="0.01" value={l.precio_unitario} autoFocus
                          onChange={(e) => setLinea(l.sku_id, { precio_unitario: parseFloat(e.target.value) || 0 })}
                          onBlur={() => setEditandoPrecio(null)}
                          onKeyDown={(e) => { if (e.key === "Enter") setEditandoPrecio(null); }}
                          className="pos-price-input" />
                      ) : (
                        <div className="pos-cart-price" title="Tocá para editar el precio" onClick={() => setEditandoPrecio(l.sku_id)}>
                          {formatMoney(l.precio_unitario, moneda)} c/u <i className="fas fa-pen" style={{ fontSize: 9, opacity: 0.5 }} />
                        </div>
                      )}
                    </div>
                    <div className="pos-qty">
                      <button onClick={() => cambiarCantidad(l.sku_id, -1)}><i className="fas fa-minus" /></button>
                      <span>{l.cantidad}</span>
                      <button onClick={() => cambiarCantidad(l.sku_id, 1)}><i className="fas fa-plus" /></button>
                    </div>
                    <div className="pos-cart-total">{formatMoney(l.cantidad * l.precio_unitario, moneda)}</div>
                    <button className="pos-remove" onClick={() => quitarLinea(l.sku_id)}><i className="fas fa-xmark" /></button>
                  </div>
                ))}
              </div>

              {cart.length > 0 && (
                <div className="s-foot">
                  <div className="tt"><span>Subtotal</span><span>{formatMoney(bruto, moneda)}</span></div>
                  <div className="tt disc"><span>Descuento{descPct > 0 ? ` (${descPct}%)` : ""}</span><span>- {formatMoney(descuentoMonto, moneda)}</span></div>
                  <div className="tt muted"><span>IVA incluido ({ivaPct}%)</span><span>{formatMoney(impuesto, moneda)}</span></div>
                  <div className="tt main"><span>Total</span><span>{formatMoney(total, moneda)}</span></div>
                </div>
              )}
              <div className="s-footer">
                <button className="pos-btn-continue" disabled={cart.length === 0} onClick={() => setPaso(2)}>
                  <span>Continuar</span><i className="fas fa-arrow-right" />
                </button>
              </div>
            </div>

            {/* ===== PASO 2: COBRO ===== */}
            <div className="pos-step" style={{ transform: `translateX(${paso === 2 ? 0 : 100}%)` }}>
              <div className="s2-header">
                <button className="s2-back" onClick={() => setPaso(1)}><i className="fas fa-arrow-left" /></button>
                <div><h3>Datos del pago</h3><div className="s2-sub">Configura el cobro de la venta</div></div>
              </div>

              <div className="s2-body">
                {/* Estado de la venta */}
                <div className="pos-status-toggle">
                  <button className={`pos-status-btn ${!aCredito ? "active" : ""}`} onClick={() => setACredito(false)}>
                    <i className="fas fa-circle-check" /><span>Pagada</span>
                  </button>
                  <button className={`pos-status-btn credit ${aCredito ? "active" : ""}`} onClick={() => setACredito(true)}>
                    <i className="fas fa-clock" /><span>A Crédito (Fiado)</span>
                  </button>
                </div>

                {/* Cliente (solo crédito) */}
                {aCredito && (
                  clienteSel ? (
                    <div className="pos-selected-client">
                      <div className="sc-avatar">{clienteSel.nombre.trim().slice(0, 2).toUpperCase()}</div>
                      <div className="sc-info">
                        <div className="sc-name">{clienteSel.nombre}</div>
                        <div className="sc-sub">{clienteSel.codigo} · crédito</div>
                      </div>
                      <button className="sc-change" onClick={() => setClienteId("")}>Cambiar</button>
                    </div>
                  ) : (
                    <SearchableSelect
                      options={clientes.map((c) => ({ value: String(c.id), label: c.nombre, sublabel: c.codigo }))}
                      value={clienteId} onChange={(v) => setClienteId(v)} placeholder="Buscar cliente para fiar…" />
                  )
                )}

                {/* Método de pago */}
                <div>
                  <div className="pos-s2-label">Método de pago</div>
                  <div className="pos-pay-methods">
                    {METODOS.map((m) => (
                      <button key={m.value} className={`pos-pay-method ${metodo === m.value ? "active" : ""}`} onClick={() => setMetodo(m.value)}>
                        <i className={`fas ${m.icon}`} /><span>{m.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Descuento (una sola línea) */}
                <div className="pos-disc-box">
                  <input type="number" min={0} max={100} step="1" value={descuento}
                    onChange={(e) => setDescuento(e.target.value)} className="pos-disc-input" />
                  <span className="pos-disc-label">% descuento aplicado</span>
                  <span className="pos-disc-result">- {formatMoney(descuentoMonto, moneda)}</span>
                </div>

                {/* Efectivo / abono */}
                {aCredito ? (
                  <div className="pos-abono-line">
                    <input className="pos-abono-input" type="number" min={0} step="0.01" value={montoRecibido}
                      onChange={(e) => setMontoRecibido(e.target.value)} placeholder="Abono Q0.00" title="Abono inicial (opcional)" />
                    <div className="pos-fiado"><span className="l">Queda al fiado</span><span className="v">{formatMoney(saldoFiado, moneda)}</span></div>
                  </div>
                ) : metodo === "efectivo" && (
                  <div className="pos-cash-section">
                    <div className="pos-cash-received">
                      <div className="lbl">Efectivo recibido</div>
                      <input className="amt" type="number" min={0} step="0.01" value={montoRecibido}
                        onChange={(e) => setMontoRecibido(e.target.value)} placeholder="0.00" />
                    </div>
                    <div className="pos-cash-quick">
                      {[50, 100, 200].map((q) => <button key={q} onClick={() => setMontoRecibido(String(q))}>Q{q}</button>)}
                      <button onClick={() => setMontoRecibido(total.toFixed(2))}>Exacto</button>
                    </div>
                    {recibido > 0 && cambio >= 0 && (
                      <div className="pos-change-box"><span className="l">Cambio</span><span className="v">{formatMoney(cambio, moneda)}</span></div>
                    )}
                  </div>
                )}

              </div>

              {/* Totales (caja oscura, región fija: nunca se recorta) */}
              <div className="pos-td">
                <div className="pos-td-row"><span>Subtotal</span><span className="v">{formatMoney(bruto, moneda)}</span></div>
                <div className="pos-td-row disc"><span>Descuento{descPct > 0 ? ` (${descPct}%)` : ""}</span><span className="v">- {formatMoney(descuentoMonto, moneda)}</span></div>
                <div className="pos-td-row"><span>IVA incluido ({ivaPct}%)</span><span className="v">{formatMoney(impuesto, moneda)}</span></div>
                <div className="pos-td-div" />
                <div className="pos-td-total"><span className="l">Total</span><span className="v">{formatMoney(total, moneda)}</span></div>
              </div>

              <div className="s-footer">
                <button className={`pos-btn-charge ${aCredito ? "credit" : ""}`} onClick={cobrar} disabled={cart.length === 0 || cobrando}>
                  <span>{cobrando ? "Procesando…" : aCredito ? "Registrar crédito" : "Cobrar"}</span>
                  <span className="amount">{formatMoney(total, moneda)}</span>
                </button>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Ticket */}
      <Modal isOpen={!!ticket} title={`Ticket ${ticket?.numero || ""}`} onClose={() => setTicket(null)} maxWidth={420}>
        {ticket && (
          <div>
            <div id="pos-ticket" style={{ fontSize: 13 }}>
              <div style={{ textAlign: "center", marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{empresa?.nombre_comercial || empresa?.nombre || "Venta"}</div>
                <div style={{ color: "var(--text-muted)", fontSize: 12 }}>{ticket.numero} · {new Date(ticket.fecha).toLocaleString()}</div>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
                <tbody>
                  {ticket.items.map((it) => (
                    <tr key={it.id} style={{ borderBottom: "1px dashed var(--border)" }}>
                      <td style={{ ...td, padding: "6px 4px" }}>{it.cantidad} ×</td>
                      <td style={{ ...td, padding: "6px 4px", textAlign: "right" }}>{formatMoney(it.precio_unitario, moneda)}</td>
                      <td style={{ ...td, padding: "6px 4px", textAlign: "right", fontWeight: 600 }}>{formatMoney(it.precio_total, moneda)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {ticket.descuento_monto && ticket.descuento_monto > 0 ? (
                <>
                  <Row label="Subtotal" value={formatMoney(ticket.total + ticket.descuento_monto, moneda)} />
                  <Row label={`Descuento (${ticket.descuento_porcentaje}%)`} value={`- ${formatMoney(ticket.descuento_monto, moneda)}`} />
                  <Row label={`IVA incluido (${ticket.impuesto_porcentaje}%)`} value={formatMoney(ticket.impuesto_total, moneda)} />
                  <Row label="Total" value={formatMoney(ticket.total, moneda)} big />
                </>
              ) : (
                <>
                  <Row label="Subtotal" value={formatMoney(ticket.subtotal, moneda)} />
                  <Row label={`IVA (${ticket.impuesto_porcentaje}%)`} value={formatMoney(ticket.impuesto_total, moneda)} />
                  <Row label="Total" value={formatMoney(ticket.total, moneda)} big />
                </>
              )}
              {ticket.pagos.map((p) => (
                <div key={p.id}>
                  <Row label={`Pago (${p.metodo})`} value={formatMoney(p.monto, moneda)} />
                  {p.cambio != null && p.cambio > 0 && <Row label="Cambio" value={formatMoney(p.cambio, moneda)} />}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
              <button onClick={() => window.print()} style={btnSm}><i className="fas fa-print" style={{ marginRight: 6 }} />Imprimir</button>
              <button onClick={() => setTicket(null)} style={{ ...btnPri, background: "var(--primary)" }}>Nueva venta</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Cierre de caja */}
      <Modal isOpen={cerrarOpen} title="Cerrar caja (arqueo)" onClose={() => setCerrarOpen(false)} maxWidth={380}>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
          Cuenta el efectivo físico en caja y decláralo. El sistema calcula la diferencia contra lo esperado.
        </p>
        <label style={lbl}>Efectivo declarado (contado)</label>
        <input type="number" min={0} step="0.01" value={montoDeclarado} autoFocus
          onChange={(e) => setMontoDeclarado(e.target.value)} style={inp} />
        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
          <button onClick={() => setCerrarOpen(false)} style={btnGhost}>Cancelar</button>
          <button onClick={cerrarCaja} style={{ ...btnPri, background: "var(--danger)" }}>Cerrar caja</button>
        </div>
      </Modal>

      {/* Resumen del día */}
      <Modal isOpen={!!resumen} title="Resumen de hoy" onClose={() => setResumen(null)} maxWidth={360}>
        {resumen && (
          <div style={{ fontSize: 14 }}>
            <Row label="Ventas" value={String(resumen.num_ventas)} />
            <Row label="Total vendido" value={formatMoney(resumen.total, moneda)} big />
            <div style={{ marginTop: 12, fontSize: 12, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 1 }}>Por método</div>
            {Object.keys(resumen.por_metodo).length === 0 ? (
              <div style={{ color: "var(--text-muted)", padding: "8px 0" }}>Sin ventas aún</div>
            ) : Object.entries(resumen.por_metodo).map(([m, v]) => (
              <Row key={m} label={m} value={formatMoney(v, moneda)} />
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}

function Row({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderTop: big ? "1px solid var(--border)" : undefined, marginTop: big ? 6 : 0, paddingTop: big ? 8 : 4 }}>
      <span style={{ color: "var(--text-secondary)", textTransform: "capitalize" }}>{label}</span>
      <span style={{ fontWeight: big ? 800 : 600, fontSize: big ? 18 : 14, color: big ? "var(--primary)" : "var(--text)" }}>{value}</span>
    </div>
  );
}

const card: React.CSSProperties = { background: "var(--surface)", padding: 20, borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow)" };
const btnPri: React.CSSProperties = { padding: "8px 16px", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 13, fontWeight: 600 };
const btnGhost: React.CSSProperties = { padding: "8px 16px", background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 13, fontWeight: 600 };
const btnSm: React.CSSProperties = { padding: "6px 12px", background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 13, fontWeight: 600 };
const td: React.CSSProperties = { padding: "8px 6px", fontSize: 14, color: "var(--text)" };
const lbl: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 };
const inp: React.CSSProperties = { width: "100%", padding: "10px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 14, background: "var(--surface)", color: "var(--text)", boxSizing: "border-box" };

const POS_CSS = `
.pos-grid{display:grid;grid-template-columns:1.7fr 400px;gap:14px;align-items:stretch}
.pos-cat-topline{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:14px 18px;border-bottom:1px solid var(--border);flex-shrink:0}

/* Catálogo */
.pos-catalog{background:var(--surface);border:1px solid var(--border);border-radius:16px;display:flex;flex-direction:column;overflow:hidden;height:100%}
.pos-catalog-head{padding:16px 18px 0;flex-shrink:0}
.pos-search{position:relative;margin-bottom:14px}
.pos-search i{position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--text-muted);font-size:14px}
.pos-search input{width:100%;background:var(--bg);border:1.5px solid var(--border);border-radius:10px;padding:11px 14px 11px 40px;font:inherit;font-size:13px;color:var(--text);outline:none;transition:all .2s;box-sizing:border-box}
.pos-search input:focus{border-color:var(--primary);box-shadow:0 0 0 4px var(--primary-light);background:var(--surface)}
.pos-cats{display:flex;gap:8px;flex-wrap:wrap;padding-bottom:14px}
.pos-cat{padding:6px 14px;border-radius:8px;background:var(--bg);border:1px solid var(--border);font:inherit;font-size:12px;font-weight:500;color:var(--text-muted);cursor:pointer;transition:all .2s;white-space:nowrap}
.pos-cat.active{background:var(--primary);color:#fff;border-color:var(--primary)}
.pos-products-scroll{flex:1;overflow-y:auto;padding:14px 18px 18px;border-top:1px solid var(--border-light);min-height:0}
.pos-products{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:14px}
.pos-product{background:var(--surface);border:1.5px solid var(--border);border-radius:14px;padding:14px;cursor:pointer;transition:all .2s;position:relative;display:flex;flex-direction:column}
.pos-product:hover{border-color:var(--primary);transform:translateY(-3px);box-shadow:0 8px 20px var(--primary-light)}
.pos-product-img{width:100%;height:84px;border-radius:10px;background:var(--bg);display:flex;align-items:center;justify-content:center;font-size:30px;color:var(--text-muted);margin-bottom:10px}
.pos-product-name{font-size:13px;font-weight:600;line-height:1.3;color:var(--text);margin-bottom:3px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.pos-product-code{font-size:10px;color:var(--text-muted);margin-bottom:10px;font-family:monospace}
.pos-product-bottom{display:flex;justify-content:space-between;align-items:center;margin-top:auto}
.pos-product-price{font-size:14px;font-weight:800;color:var(--text)}
.pos-add{width:28px;height:28px;border-radius:8px;background:var(--primary);color:#fff;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;transition:all .2s;flex-shrink:0}
.pos-add:hover{background:var(--primary-hover);transform:scale(1.1)}
.pos-product-badge{position:absolute;top:8px;right:8px;background:var(--success);color:#fff;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;z-index:1;animation:cardIn .2s ease}
.pos-empty-cat{text-align:center;padding:60px 20px;color:var(--text-muted)}
.pos-empty-cat i{font-size:44px;margin-bottom:12px;color:var(--border);display:block}

/* Checkout */
.pos-checkout{height:100%;background:var(--surface);border:1px solid var(--border);border-radius:16px;display:flex;flex-direction:column;overflow:hidden}
/* Barra de progreso de pasos */
.pos-stepbar{display:flex;align-items:center;justify-content:center;gap:10px;padding:9px 12px;border-bottom:1px solid var(--border);background:var(--bg);flex-shrink:0}
.pos-stepdot{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:600;color:var(--text-muted);transition:color .3s}
.pos-stepdot .num{width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;background:var(--border);color:var(--text-muted);transition:all .3s}
.pos-stepdot.active{color:var(--primary)}
.pos-stepdot.active .num{background:var(--primary);color:#fff}
.pos-stepdot.done{color:var(--success-text)}
.pos-stepdot.done .num{background:var(--success);color:#fff}
.pos-stepline{width:28px;height:2px;background:var(--border);border-radius:1px;transition:background .3s}
.pos-stepline.done{background:var(--success)}
/* Contenedor de pasos deslizables */
.pos-panel{flex:1;position:relative;overflow:hidden;min-height:0}
.pos-step{position:absolute;inset:0;display:flex;flex-direction:column;min-height:0;transition:transform .4s cubic-bezier(.32,.72,0,1)}
.s1-header,.s2-header{padding:12px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px;flex-shrink:0}
.s1-header{justify-content:space-between}
.s1-header h3,.s2-header h3{font-size:15px;font-weight:800;color:var(--text);margin:0}
.s1-ticket{font-size:11px;color:var(--text-muted);font-family:monospace;margin-top:2px}
.s2-sub{font-size:11px;color:var(--text-muted);margin-top:1px}
.s1-actions{display:flex;gap:6px}
.s2-back{width:36px;height:36px;border-radius:10px;background:var(--bg);border:1px solid var(--border);cursor:pointer;color:var(--text-muted);display:flex;align-items:center;justify-content:center;font-size:14px;transition:all .2s;flex-shrink:0}
.s2-back:hover{background:var(--primary-light);color:var(--primary);border-color:var(--primary)}
.s2-body{flex:1;display:flex;flex-direction:column;min-height:0;overflow-y:auto;padding:14px 18px;gap:12px}
.pos-sel-client{display:flex;align-items:center;gap:10px;padding:10px 12px;background:#f5f3ff;border:1.5px solid rgba(139,92,246,.3);border-radius:10px}
.pos-sel-client .sc-avatar{width:34px;height:34px;border-radius:50%;background:#8b5cf6;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;flex-shrink:0}
.pos-sel-client .sc-info{flex:1;min-width:0}
.pos-sel-client .sc-name{font-size:13px;font-weight:700;color:#7c3aed}
.pos-sel-client .sc-sub{font-size:11px;color:var(--text-muted)}
.pos-sel-client .sc-change{background:none;border:none;color:#7c3aed;font:inherit;font-size:12px;font-weight:600;cursor:pointer;text-decoration:underline;flex-shrink:0}
/* Totales fijos al pie de cada paso */
.s-foot{flex-shrink:0;padding:16px 20px;border-top:1px solid var(--border);background:var(--bg)}
.s-foot .tt{display:flex;justify-content:space-between;font-size:13px;color:var(--text-secondary);padding:3px 0}
.s-foot .tt.disc{color:var(--success-text)}
.s-foot .tt.muted{color:var(--text-muted)}
.s-foot .tt.main{margin-top:8px;padding-top:10px;border-top:1px dashed var(--border);font-size:15px;font-weight:700;color:var(--text);align-items:baseline}
.s-foot .tt.main span:last-child{font-size:26px;font-weight:800;letter-spacing:-.5px}
.s-footer{flex-shrink:0;padding:12px 18px 14px}
.pos-btn-continue{width:100%;background:var(--primary);color:#fff;border:none;border-radius:12px;padding:16px;font:inherit;font-weight:700;font-size:16px;cursor:pointer;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:10px;box-shadow:0 6px 20px var(--primary-light)}
.pos-btn-continue:hover:not(:disabled){background:var(--primary-hover);transform:translateY(-1px)}
.pos-btn-continue:disabled{background:var(--border);color:var(--text-muted);cursor:not-allowed;box-shadow:none}
.s-footer .pos-btn-charge{width:100%;padding:16px 20px;font-size:16px}
.pos-menu-btn{width:40px;height:40px;border-radius:10px;background:var(--surface);border:1px solid var(--border);cursor:pointer;color:var(--text);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;transition:all .2s}
.pos-menu-btn:hover{background:var(--primary-light);color:var(--primary);border-color:var(--primary)}
.pos-caja-badge{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:20px;background:var(--success-bg);color:var(--success-text);font-size:11px;font-weight:600}
.pos-caja-badge .dot{width:6px;height:6px;border-radius:50%;background:var(--success)}
.pos-ticket{background:var(--surface);border:1px solid var(--border);border-radius:16px;display:flex;flex-direction:column;overflow:hidden}
.pos-ticket-head{padding:16px 18px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-shrink:0}
.pos-ticket-head h3{font-size:15px;font-weight:800;color:var(--text);margin:0}
.pos-ticket-sub{font-size:11px;color:var(--text-muted);margin-top:2px}
.pos-icon-btn{width:32px;height:32px;border-radius:8px;background:var(--bg);border:1px solid var(--border);cursor:pointer;color:var(--text-muted);display:flex;align-items:center;justify-content:center;transition:all .2s}
.pos-icon-btn.danger:hover:not(:disabled){background:var(--danger-bg);color:var(--danger);border-color:transparent}
.pos-icon-btn:disabled{opacity:.4;cursor:not-allowed}
.pos-client{border-bottom:1px solid var(--border);flex-shrink:0}
.pos-client-row{padding:12px 18px;background:var(--bg);display:flex;align-items:center;justify-content:space-between;cursor:pointer;transition:all .2s}
.pos-client-row:hover{background:var(--border-light)}
.pos-client-info{display:flex;align-items:center;gap:10px}
.pos-client-icon{width:32px;height:32px;border-radius:50%;background:var(--primary-light);color:var(--primary);display:flex;align-items:center;justify-content:center;font-size:13px}
.pos-client-name{font-size:13px;font-weight:600;color:var(--text)}
.pos-client-type{font-size:11px;color:var(--text-muted)}
.pos-client-clear{margin-top:8px;background:none;border:none;color:var(--danger);font:inherit;font-size:11px;cursor:pointer;padding:0}

/* Carrito: min-height garantiza que el ítem NUNCA se esconda; scroll propio si hay muchos */
.pos-cart{flex:1;overflow-y:auto;padding:8px 10px;min-height:0}
.pos-cart-item{display:flex;align-items:center;gap:10px;padding:8px 8px;border-radius:10px;transition:background .15s;animation:fadeIn .2s ease}
.pos-cart-item:hover{background:var(--bg)}
.pos-cart-img{width:38px;height:38px;border-radius:8px;background:var(--bg);display:flex;align-items:center;justify-content:center;font-size:15px;color:var(--text-muted);flex-shrink:0}
.pos-cart-info{flex:1;min-width:0}
.pos-cart-name{font-size:13px;font-weight:600;color:var(--text);line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pos-cart-price{font-size:11px;color:var(--text-muted);margin-top:2px;cursor:pointer;display:inline-flex;align-items:center;gap:4px}
.pos-cart-price:hover{color:var(--primary)}
.pos-price-input{width:90px;margin-top:2px;padding:2px 6px;font:inherit;font-size:12px;border:1px solid var(--primary);border-radius:6px;background:var(--surface);color:var(--text);outline:none}
.pos-qty{display:flex;align-items:center;gap:6px;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:3px 6px;flex-shrink:0}
.pos-qty button{background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:11px;width:18px;height:18px;display:flex;align-items:center;justify-content:center}
.pos-qty button:hover{color:var(--primary)}
.pos-qty span{font-size:13px;font-weight:700;color:var(--text);min-width:18px;text-align:center}
.pos-cart-total{font-size:13px;font-weight:700;color:var(--text);min-width:58px;text-align:right}
.pos-remove{background:none;border:none;cursor:pointer;color:var(--text-muted);width:22px;height:22px;border-radius:6px;display:flex;align-items:center;justify-content:center;transition:all .2s;flex-shrink:0}
.pos-remove:hover{background:var(--danger-bg);color:var(--danger)}
.pos-empty-cart{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:36px 20px;text-align:center;color:var(--text-muted);height:100%}
.pos-empty-icon{width:72px;height:72px;border-radius:50%;background:var(--bg);display:flex;align-items:center;justify-content:center;font-size:28px;margin-bottom:14px}
.pos-empty-cart h4{font-size:15px;font-weight:700;color:var(--text-secondary);margin:0 0 4px}
.pos-empty-cart p{font-size:12px;max-width:210px;line-height:1.5;margin:0}
.pos-totals{padding:14px 18px;border-top:1px solid var(--border);background:var(--bg);flex-shrink:0}
.pos-total-row{display:flex;justify-content:space-between;padding:3px 0;font-size:13px;color:var(--text-secondary)}
.pos-total-main{display:flex;justify-content:space-between;align-items:baseline;padding-top:10px;margin-top:6px;border-top:1px dashed var(--border)}
.pos-total-main .lbl{font-size:14px;font-weight:700;color:var(--text)}
.pos-total-main .lbl small{font-size:11px;color:var(--text-muted);font-weight:500}
.pos-total-main .val{font-size:24px;font-weight:800;color:var(--text);letter-spacing:-0.5px}

/* Ticket footer + Pago compacto */
.pos-ticket-foot{padding:8px 18px;border-top:1px solid var(--border);background:var(--bg);font-size:11px;color:var(--text-muted);flex-shrink:0;text-align:center}
.pos-payment{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:14px 16px;flex-shrink:0}
.pos-s2-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--text-muted);margin-bottom:6px}
/* Estado de la venta (toggle) */
.pos-status-toggle{display:flex;gap:8px}
.pos-status-btn{flex:1;padding:12px;border:1.5px solid var(--border);border-radius:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px;font:inherit;font-size:12px;font-weight:600;color:var(--text-muted);background:var(--surface);transition:all .2s}
.pos-status-btn i{font-size:13px}
.pos-status-btn:hover{border-color:var(--primary)}
.pos-status-btn.active{border-color:var(--primary);background:var(--primary-light);color:var(--primary);box-shadow:0 0 0 3px var(--primary-light)}
.pos-status-btn.credit.active{border-color:#8b5cf6;background:#f5f3ff;color:#7c3aed;box-shadow:0 0 0 3px #f5f3ff}
/* Cliente seleccionado (crédito) */
.pos-selected-client{display:flex;align-items:center;gap:10px;padding:10px 12px;background:#f5f3ff;border:1.5px solid rgba(139,92,246,.3);border-radius:10px}
.pos-selected-client .sc-avatar{width:32px;height:32px;border-radius:50%;background:#8b5cf6;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;flex-shrink:0}
.pos-selected-client .sc-info{flex:1;min-width:0}
.pos-selected-client .sc-name{font-size:13px;font-weight:700;color:#7c3aed}
.pos-selected-client .sc-sub{font-size:11px;color:var(--text-muted)}
.pos-selected-client .sc-change{background:none;border:none;color:#7c3aed;font:inherit;font-size:12px;font-weight:600;cursor:pointer;text-decoration:underline;flex-shrink:0}
/* Métodos de pago (fila) */
.pos-pay-methods{display:flex;gap:8px}
.pos-pay-method{flex:1;padding:10px 4px;border:1.5px solid var(--border);border-radius:10px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:5px;transition:all .2s;background:var(--surface);font:inherit}
.pos-pay-method i{font-size:15px;color:var(--text-muted)}
.pos-pay-method span{font-size:10px;font-weight:600;color:var(--text-muted)}
.pos-pay-method:hover{border-color:var(--primary)}
.pos-pay-method.active{border-color:var(--primary);background:var(--primary-light);box-shadow:0 0 0 3px var(--primary-light)}
.pos-pay-method.active i,.pos-pay-method.active span{color:var(--primary)}
/* Descuento (una línea) */
.pos-disc-box{display:flex;align-items:center;gap:8px;background:var(--surface);border:1.5px solid var(--border);border-radius:10px;padding:8px 10px}
.pos-disc-input{width:48px;background:var(--bg);border:1px solid var(--border);border-radius:7px;padding:6px;font:inherit;font-size:14px;font-weight:700;text-align:center;color:var(--text);outline:none;box-sizing:border-box}
.pos-disc-input:focus{border-color:var(--primary)}
.pos-disc-label{font-size:12px;color:var(--text-muted);flex:1}
.pos-disc-result{font-size:12px;font-weight:700;color:var(--success-text)}
/* Efectivo: caja oscura + atajos */
.pos-cash-section{display:flex;flex-direction:column;gap:8px}
.pos-cash-received{background:#0f172a;border-radius:11px;padding:10px;text-align:center;color:#fff}
.pos-cash-received .lbl{font-size:9px;text-transform:uppercase;letter-spacing:.8px;color:#94a3b8;font-weight:600;margin-bottom:3px}
.pos-cash-received .amt{width:100%;background:transparent;border:none;outline:none;color:#fff;font:inherit;font-size:24px;font-weight:800;letter-spacing:-.5px;text-align:center}
.pos-cash-quick{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px}
.pos-cash-quick button{background:var(--bg);border:1.5px solid var(--border);border-radius:9px;padding:9px 4px;font:inherit;font-size:12px;font-weight:700;color:var(--text);cursor:pointer;transition:all .2s}
.pos-cash-quick button:hover{background:var(--primary-light);border-color:var(--primary);color:var(--primary)}
.pos-change-box{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-radius:9px;background:var(--success-bg)}
.pos-change-box .l{font-size:12px;font-weight:600;color:var(--success-text)}
.pos-change-box .v{font-size:16px;font-weight:800;color:var(--success-text)}
.pos-change-box.danger{background:var(--danger-bg)}
.pos-change-box.danger .l,.pos-change-box.danger .v{color:var(--danger)}
/* Abono + fiado en una sola fila (crédito) */
.pos-abono-line{display:flex;align-items:stretch;gap:10px}
.pos-abono-input{width:130px;flex-shrink:0;background:var(--bg);border:1.5px solid var(--border);border-radius:10px;padding:10px 12px;font:inherit;font-size:15px;font-weight:700;color:var(--text);outline:none;box-sizing:border-box}
.pos-abono-input:focus{border-color:var(--primary);box-shadow:0 0 0 3px var(--primary-light)}
.pos-fiado{flex:1;display:flex;justify-content:space-between;align-items:center;padding:0 14px;border-radius:10px;background:var(--danger-bg)}
.pos-fiado .l{font-size:12px;font-weight:600;color:var(--danger)}
.pos-fiado .v{font-size:16px;font-weight:800;color:var(--danger)}
/* Totales: caja oscura, región fija (fuera del área que puede desbordar) */
.pos-td{background:#0f172a;border-radius:12px;padding:13px 16px;color:#fff;flex-shrink:0;margin:0 18px}
.pos-td-row{display:flex;justify-content:space-between;align-items:center;padding:2px 0;font-size:11px;color:#94a3b8;font-weight:500}
.pos-td-row .v{font-weight:600;color:#e2e8f0}
.pos-td-row.disc{color:#34d399}
.pos-td-row.disc .v{color:#34d399}
.pos-td-div{height:1px;background:rgba(255,255,255,.1);margin:7px 0}
.pos-td-total{display:flex;justify-content:space-between;align-items:baseline}
.pos-td-total .l{font-size:12px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.8px}
.pos-td-total .v{font-size:27px;font-weight:800;letter-spacing:-.8px;color:#fff}
.pos-totals-c{margin-top:12px;padding-top:10px;border-top:1px dashed var(--border)}
.pos-totals-c .r{display:flex;justify-content:space-between;font-size:12px;color:var(--text-secondary);padding:2px 0}
.pos-totals-c .r.disc{color:var(--success-text)}
.pos-totals-c .r.muted{color:var(--text-muted)}
.pos-totals-c .r.main{margin-top:6px;padding-top:8px;border-top:1px solid var(--border);font-size:14px;font-weight:700;color:var(--text)}
.pos-totals-c .r.main span:last-child{font-size:19px;font-weight:800;letter-spacing:-.3px}

/* Acciones */
.pos-actions{display:flex;gap:10px;flex-shrink:0}
.pos-btn-cancel{background:var(--surface);border:1.5px solid var(--border);border-radius:12px;padding:14px 16px;font:inherit;font-weight:600;font-size:13px;color:var(--text-muted);cursor:pointer;transition:all .2s;display:flex;align-items:center;gap:8px;white-space:nowrap}
.pos-btn-cancel:hover{background:var(--warning-bg);color:var(--warning);border-color:var(--warning)}
.pos-btn-charge{flex:1;background:var(--success);border:none;color:#fff;border-radius:12px;padding:14px 20px;font:inherit;font-weight:700;font-size:15px;cursor:pointer;transition:all .2s;display:flex;align-items:center;justify-content:space-between;box-shadow:0 6px 20px var(--success-bg)}
.pos-btn-charge:hover:not(:disabled){filter:brightness(1.05);transform:translateY(-1px)}
.pos-btn-charge:disabled{opacity:.5;cursor:not-allowed;box-shadow:none}
.pos-btn-charge .amount{font-size:17px;font-weight:800}
.pos-btn-charge{background:linear-gradient(135deg,var(--success),var(--success-hover,#059669))}
.pos-btn-charge.credit{background:linear-gradient(135deg,#8b5cf6,#7c3aed);box-shadow:0 6px 20px rgba(139,92,246,.3)}

/* Escritorio: el POS rompe el padding del layout y usa TODA la altura del navegador (top→bottom). */
@media(min-width:901px){
  .pos-root{margin:-28px -32px;height:100dvh;box-sizing:border-box;padding:10px 12px;overflow:hidden;display:flex;flex-direction:column}
  .pos-grid{flex:1;min-height:0}
}
@media(max-width:1100px) and (min-width:901px){.pos-grid{grid-template-columns:1.6fr 380px}}
@media(max-width:900px){
  .pos-grid{grid-template-columns:1fr;height:auto}
  .pos-catalog{height:auto;max-height:none}
  .pos-checkout{height:78vh}
}
`;
