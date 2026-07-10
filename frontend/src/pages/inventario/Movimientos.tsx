import { useEffect, useState } from "react";
import api from "../../lib/api";
import type { Bodega, Movimiento, SKU } from "../../types";

const motivosOptions = [
  { value: "", label: "Sin motivo" },
  { value: "compra", label: "Compra" },
  { value: "devolucion_proveedor", label: "Devolución proveedor" },
  { value: "venta", label: "Venta" },
  { value: "devolucion_cliente", label: "Devolución cliente" },
  { value: "consumo_interno", label: "Consumo interno" },
  { value: "merma", label: "Merma" },
  { value: "ajuste", label: "Ajuste" },
  { value: "stock_inicial", label: "Stock inicial" },
];

export default function MovimientosPage() {
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [bodegas, setBodegas] = useState<Bodega[]>([]);
  const [skus, setSkus] = useState<SKU[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [tipo, setTipo] = useState("entrada");
  const [motivo, setMotivo] = useState("");
  const [bodegaId, setBodegaId] = useState("");
  const [skuId, setSkuId] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [costoUnitario, setCostoUnitario] = useState("");
  const [referencia, setReferencia] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    const { data } = await api.get("/inventario/movimientos?limit=200");
    setMovimientos(data);
    setLoading(false);
  };

  useEffect(() => {
    Promise.all([
      api.get("/inventario/bodegas"),
      api.get("/skus?limit=200"),
    ]).then(([bRes, sRes]) => {
      setBodegas(bRes.data);
      setSkus(sRes.data);
    });
    load();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await api.post("/inventario/movimientos", {
        tipo,
        motivo: motivo || undefined,
        bodega_id: Number(bodegaId),
        sku_id: Number(skuId),
        cantidad: Number(cantidad),
        costo_unitario: costoUnitario ? Number(costoUnitario) : 0,
        referencia: referencia || undefined,
      });
      setShowForm(false);
      setTipo("entrada");
      setMotivo("");
      setBodegaId("");
      setSkuId("");
      setCantidad("");
      setCostoUnitario("");
      setReferencia("");
      load();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Error al registrar movimiento");
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text)" }}>Movimientos</h2>
        <button onClick={() => setShowForm(!showForm)} style={btnPrimary}>
          + Nuevo Movimiento
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={{ ...card, marginBottom: 20 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Registrar Movimiento</h3>
          {error && <div style={{ background: "var(--danger-bg)", color: "var(--danger)", padding: "8px 12px", borderRadius: "var(--radius-sm)", marginBottom: 12, fontSize: 13 }}>{error}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={inputStyle} required>
              <option value="entrada">Entrada</option>
              <option value="salida">Salida</option>
            </select>
            <select value={motivo} onChange={(e) => setMotivo(e.target.value)} style={inputStyle}>
              {motivosOptions.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <select value={bodegaId} onChange={(e) => setBodegaId(e.target.value)} style={inputStyle} required>
              <option value="">Bodega</option>
              {bodegas.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
            </select>
            <select value={skuId} onChange={(e) => setSkuId(e.target.value)} style={inputStyle} required>
              <option value="">SKU</option>
              {skus.map((s) => <option key={s.id} value={s.id}>{s.codigo_sku} - {s.descripcion}</option>)}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <input type="number" step="0.01" min="0.01" placeholder="Cantidad" value={cantidad} onChange={(e) => setCantidad(e.target.value)} style={inputStyle} required />
            <input type="number" step="0.01" min="0" placeholder="Costo unitario (0 = usar actual)" value={costoUnitario} onChange={(e) => setCostoUnitario(e.target.value)} style={inputStyle} />
          </div>
          <input placeholder="Referencia (opcional)" value={referencia} onChange={(e) => setReferencia(e.target.value)} style={{ ...inputStyle, width: "50%", marginBottom: 12 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" style={btnPrimary}>Registrar</button>
            <button type="button" onClick={() => setShowForm(false)} style={btnSecondary}>Cancelar</button>
          </div>
        </form>
      )}

      <div style={card}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
              <th style={thStyle}>Fecha</th>
              <th style={thStyle}>Tipo</th>
              <th style={thStyle}>Motivo</th>
              <th style={thStyle}>SKU</th>
              <th style={thStyle}>Bodega</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Cantidad</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Costo Unit.</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Costo Total</th>
              <th style={thStyle}>Ref.</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ ...tdStyle, textAlign: "center", color: "var(--text-muted)" }}>Cargando...</td></tr>
            ) : movimientos.length === 0 ? (
              <tr><td colSpan={9} style={{ ...tdStyle, textAlign: "center", color: "var(--text-muted)" }}>Sin movimientos</td></tr>
            ) : (
              movimientos.map((m) => (
                <tr key={m.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={tdStyle}>{new Date(m.fecha).toLocaleString()}</td>
                  <td style={tdStyle}>
                    <span style={{ color: m.tipo === "entrada" ? "#16a34a" : "#dc2626", fontWeight: 600 }}>
                      {m.tipo === "entrada" ? "+ Entrada" : "- Salida"}
                    </span>
                  </td>
                  <td style={tdStyle}>{m.motivo ? m.motivo.replace(/_/g, " ") : "-"}</td>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{m.sku_codigo}</td>
                  <td style={tdStyle}>{m.bodega_nombre}</td>
                  <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>{m.cantidad.toLocaleString()}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>${m.costo_unitario.toFixed(2)}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>${m.costo_total.toFixed(2)}</td>
                  <td style={tdStyle}>{m.referencia || "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const card: React.CSSProperties = { background: "var(--surface)", padding: 20, borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow)", overflowX: "auto" };
const btnPrimary: React.CSSProperties = { padding: "8px 16px", background: "var(--primary)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 13, fontWeight: 600 };
const btnSecondary: React.CSSProperties = { padding: "8px 16px", background: "#e5e7eb", color: "var(--text)", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 13, fontWeight: 600 };
const inputStyle: React.CSSProperties = { padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 14, boxSizing: "border-box" };
const thStyle: React.CSSProperties = { padding: "8px 8px", textAlign: "left", fontSize: 11, color: "var(--text-secondary)", textTransform: "uppercase", fontWeight: 600, whiteSpace: "nowrap" };
const tdStyle: React.CSSProperties = { padding: "8px", fontSize: 13, whiteSpace: "nowrap" };
