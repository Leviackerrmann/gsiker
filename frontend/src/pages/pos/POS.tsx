import { useEffect, useMemo, useRef, useState } from "react";
import api from "../../lib/api";
import Modal from "../../components/Modal";
import SearchableSelect from "../../components/SearchableSelect";
import { useToast } from "../../components/Toast";
import { useAuth } from "../../contexts/AuthContext";
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
  fecha: string; subtotal: number; impuesto_porcentaje: number; impuesto_total: number; total: number;
  estado: string; items: ItemResp[]; pagos: PagoResp[];
}
interface ResumenDia { fecha: string; num_ventas: number; total: number; por_metodo: Record<string, number>; }

interface CartLine { sku_id: number; codigo: string; descripcion: string; cantidad: number; precio_unitario: number; }

const METODOS = [
  { value: "efectivo", label: "Efectivo", icon: "fa-money-bill-wave" },
  { value: "tarjeta", label: "Tarjeta", icon: "fa-credit-card" },
  { value: "transferencia", label: "Transferencia", icon: "fa-building-columns" },
];

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export default function POSPage() {
  const toast = useToast();
  const { empresa } = useAuth();
  const moneda = empresa?.moneda || "GTQ";

  const [caja, setCaja] = useState<CajaSesion | null>(null);
  const [loadingCaja, setLoadingCaja] = useState(true);

  const [skus, setSkus] = useState<SKU[]>([]);
  const [bodegas, setBodegas] = useState<Bodega[]>([]);
  const [bodegaId, setBodegaId] = useState<number | null>(null);
  const [stockMap, setStockMap] = useState<Record<number, number>>({});

  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);

  const [metodo, setMetodo] = useState("efectivo");
  const [montoRecibido, setMontoRecibido] = useState<string>("");
  const [cobrando, setCobrando] = useState(false);

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
    api.get("/inventario/bodegas").then((r) => {
      const bs: Bodega[] = (r.data as Bodega[]).filter((b) => b.activa);
      setBodegas(bs);
      if (bs.length) setBodegaId((prev) => prev ?? bs[0].id);
    }).catch(() => setBodegas([]));
    api.get("/ventas/clientes").then((r) => setClientes(r.data)).catch(() => setClientes([]));
  }, []);

  useEffect(() => { if (bodegaId != null) cargarStock(); /* eslint-disable-next-line */ }, [bodegaId]);

  // --- Carrito ---
  const total = useMemo(() => round2(cart.reduce((s, l) => s + l.cantidad * l.precio_unitario, 0)), [cart]);
  const recibido = parseFloat(montoRecibido) || 0;
  // Contado: `recibido` es el efectivo entregado → cambio. Crédito: es el abono inicial → saldo al fiado.
  const cambio = !aCredito && metodo === "efectivo" ? round2(Math.max(0, recibido - total)) : 0;
  const saldoFiado = aCredito ? round2(Math.max(0, total - recibido)) : 0;

  const resultados = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [] as SKU[];
    return skus.filter((s) =>
      s.codigo_sku.toLowerCase().includes(q) || s.descripcion.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [search, skus]);

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
    setSearch("");
    searchRef.current?.focus();
  };

  const setLinea = (sku_id: number, patch: Partial<CartLine>) =>
    setCart((prev) => prev.map((l) => (l.sku_id === sku_id ? { ...l, ...patch } : l)));
  const quitarLinea = (sku_id: number) => setCart((prev) => prev.filter((l) => l.sku_id !== sku_id));
  const limpiar = () => { setCart([]); setMontoRecibido(""); setMetodo("efectivo"); setACredito(false); setClienteId(""); };

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
    if (aCredito && !clienteId) { toast.error("Elige el cliente para la venta al fiado"); return; }
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
      }
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
          <div style={{ fontSize: 40, color: "var(--accent, var(--primary))", marginBottom: 12 }}>
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
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", margin: 0 }}>Punto de Venta</h2>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            Caja abierta · inicial {formatMoney(caja.monto_inicial, moneda)}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={verResumen} style={btnSm}><i className="fas fa-chart-simple" style={{ marginRight: 6 }} />Resumen de hoy</button>
          <button onClick={() => setCerrarOpen(true)} style={{ ...btnSm, color: "var(--danger)" }}>
            <i className="fas fa-lock" style={{ marginRight: 6 }} />Cerrar caja
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 16, alignItems: "start" }}>
        {/* IZQUIERDA: búsqueda + carrito */}
        <div style={card}>
          {bodegas.length > 1 && (
            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>Bodega</label>
              <select value={bodegaId ?? ""} onChange={(e) => setBodegaId(Number(e.target.value))} style={inp}>
                {bodegas.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
              </select>
            </div>
          )}

          <label style={lbl}>Buscar producto (código o nombre)</label>
          <div style={{ position: "relative" }}>
            <input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && resultados[0]) addToCart(resultados[0]); }}
              placeholder="Escanea o escribe…" autoFocus style={inp} />
            {resultados.length > 0 && (
              <div style={{ position: "absolute", zIndex: 10, top: "100%", left: 0, right: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", boxShadow: "var(--shadow-lg)", marginTop: 4, overflow: "hidden" }}>
                {resultados.map((s) => {
                  const disp = stockMap[s.id] ?? 0;
                  return (
                    <div key={s.id} onClick={() => addToCart(s)}
                      style={{ padding: "10px 12px", cursor: "pointer", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", gap: 8 }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-soft, #f3f4f6)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{s.descripcion}</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{s.codigo_sku}</div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--primary)" }}>{formatMoney(s.precio_referencia, moneda)}</div>
                        <div style={{ fontSize: 11, color: disp > 0 ? "var(--text-muted)" : "var(--danger)" }}>{disp} disp.</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={th}>Producto</th>
                <th style={{ ...th, textAlign: "center", width: 90 }}>Cant.</th>
                <th style={{ ...th, textAlign: "right", width: 110 }}>Precio</th>
                <th style={{ ...th, textAlign: "right", width: 100 }}>Total</th>
                <th style={{ ...th, width: 30 }}></th>
              </tr>
            </thead>
            <tbody>
              {cart.length === 0 ? (
                <tr><td colSpan={5} style={{ ...td, textAlign: "center", color: "var(--text-muted)", padding: "28px 0" }}>Carrito vacío — busca un producto arriba</td></tr>
              ) : cart.map((l) => (
                <tr key={l.sku_id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={td}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{l.descripcion}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{l.codigo}</div>
                  </td>
                  <td style={{ ...td, textAlign: "center" }}>
                    <input type="number" min={0} step="1" value={l.cantidad}
                      onChange={(e) => setLinea(l.sku_id, { cantidad: parseFloat(e.target.value) || 0 })}
                      style={{ ...inpSm, textAlign: "center" }} />
                  </td>
                  <td style={{ ...td, textAlign: "right" }}>
                    <input type="number" min={0} step="0.01" value={l.precio_unitario}
                      onChange={(e) => setLinea(l.sku_id, { precio_unitario: parseFloat(e.target.value) || 0 })}
                      style={{ ...inpSm, textAlign: "right" }} />
                  </td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>{formatMoney(l.cantidad * l.precio_unitario, moneda)}</td>
                  <td style={{ ...td, textAlign: "center" }}>
                    <button onClick={() => quitarLinea(l.sku_id)} style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer" }}><i className="fas fa-xmark" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* DERECHA: cobro */}
        <div style={{ ...card, position: "sticky", top: 16 }}>
          <div style={{ textAlign: "center", padding: "8px 0 16px" }}>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 1 }}>Total a cobrar</div>
            <div style={{ fontSize: 36, fontWeight: 800, color: "var(--primary)", letterSpacing: "-1px" }}>{formatMoney(total, moneda)}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>IVA incluido</div>
          </div>

          {/* Fiado / crédito */}
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: aCredito ? 10 : 12, fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
            <input type="checkbox" checked={aCredito} onChange={(e) => setACredito(e.target.checked)} />
            <i className="fas fa-hand-holding-dollar" style={{ color: "var(--primary)" }} /> Venta al fiado (crédito)
          </label>
          {aCredito && (
            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>Cliente (obligatorio)</label>
              <SearchableSelect
                options={clientes.map((c) => ({ value: String(c.id), label: c.nombre, sublabel: c.codigo }))}
                value={clienteId} onChange={setClienteId} placeholder="Buscar cliente…" />
            </div>
          )}

          <label style={lbl}>{aCredito ? "Método del abono" : "Método de pago"}</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 12 }}>
            {METODOS.map((m) => (
              <button key={m.value} onClick={() => setMetodo(m.value)} style={{
                padding: "10px 4px", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 12, fontWeight: 600,
                border: `1px solid ${metodo === m.value ? "var(--primary)" : "var(--border)"}`,
                background: metodo === m.value ? "var(--accent-soft, #eff6ff)" : "transparent",
                color: metodo === m.value ? "var(--primary)" : "var(--text-secondary)",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
              }}>
                <i className={`fas ${m.icon}`} style={{ fontSize: 16 }} />{m.label}
              </button>
            ))}
          </div>

          {aCredito ? (
            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>Abono inicial (opcional)</label>
              <input type="number" min={0} step="0.01" value={montoRecibido}
                onChange={(e) => setMontoRecibido(e.target.value)} placeholder="0.00" style={inp} />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 14 }}>
                <span style={{ color: "var(--text-secondary)" }}>Queda al fiado</span>
                <span style={{ fontWeight: 700, color: "var(--danger)" }}>{formatMoney(saldoFiado, moneda)}</span>
              </div>
            </div>
          ) : metodo === "efectivo" && (
            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>Efectivo recibido</label>
              <input type="number" min={0} step="0.01" value={montoRecibido}
                onChange={(e) => setMontoRecibido(e.target.value)} placeholder={String(total)} style={inp} />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 14 }}>
                <span style={{ color: "var(--text-secondary)" }}>Cambio</span>
                <span style={{ fontWeight: 700, color: cambio > 0 ? "var(--success)" : "var(--text)" }}>{formatMoney(cambio, moneda)}</span>
              </div>
            </div>
          )}

          <button onClick={cobrar} disabled={cart.length === 0 || cobrando} style={{
            ...btnPri, width: "100%", background: cart.length === 0 ? "var(--border)" : "var(--success, #16a34a)",
            cursor: cart.length === 0 || cobrando ? "not-allowed" : "pointer", fontSize: 16, padding: "14px",
          }}>
            <i className={`fas ${aCredito ? "fa-hand-holding-dollar" : "fa-check"}`} style={{ marginRight: 8 }} />
            {cobrando ? "Procesando…" : aCredito ? "Fiar" : "Cobrar"}
          </button>
          {cart.length > 0 && (
            <button onClick={limpiar} style={{ ...btnGhost, width: "100%", marginTop: 8 }}>Vaciar carrito</button>
          )}
        </div>
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
              <Row label="Subtotal" value={formatMoney(ticket.subtotal, moneda)} />
              <Row label={`IVA (${ticket.impuesto_porcentaje}%)`} value={formatMoney(ticket.impuesto_total, moneda)} />
              <Row label="Total" value={formatMoney(ticket.total, moneda)} big />
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
const th: React.CSSProperties = { padding: "8px 6px", textAlign: "left", fontSize: 11, color: "var(--text-secondary)", textTransform: "uppercase", fontWeight: 600 };
const td: React.CSSProperties = { padding: "8px 6px", fontSize: 14, color: "var(--text)" };
const lbl: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 };
const inp: React.CSSProperties = { width: "100%", padding: "10px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 14, background: "var(--surface)", color: "var(--text)", boxSizing: "border-box" };
const inpSm: React.CSSProperties = { width: "100%", padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 13, background: "var(--surface)", color: "var(--text)", boxSizing: "border-box" };
