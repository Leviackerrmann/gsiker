import { useEffect, useState } from "react";
import api from "../../lib/api";
import type { SKU } from "../../types";

interface LineaKardex {
  fecha: string;
  tipo: string;
  motivo: string | null;
  referencia: string | null;
  entrada_cantidad: number;
  entrada_costo: number;
  salida_cantidad: number;
  salida_costo: number;
  saldo_cantidad: number;
  saldo_costo: number;
  costo_unitario: number;
}

export default function KardexPage() {
  const [skus, setSkus] = useState<SKU[]>([]);
  const [skuId, setSkuId] = useState("");
  const [lineas, setLineas] = useState<LineaKardex[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    api.get("/skus?limit=200").then((res) => setSkus(res.data));
  }, []);

  const buscar = async () => {
    if (!skuId) return;
    setLoading(true);
    const { data } = await api.get(`/inventario/kardex/${skuId}`);
    setLineas(data);
    setSearched(true);
    setLoading(false);
  };

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", marginBottom: 20 }}>Kardex</h2>

      <div style={{ ...card, marginBottom: 20, display: "flex", gap: 12, alignItems: "flex-end" }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "var(--text)" }}>SKU</label>
          <select value={skuId} onChange={(e) => setSkuId(e.target.value)} style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 14 }}>
            <option value="">Seleccionar producto...</option>
            {skus.map((s) => <option key={s.id} value={s.id}>{s.codigo_sku} - {s.descripcion}</option>)}
          </select>
        </div>
        <button onClick={buscar} disabled={!skuId || loading} style={btn}>{loading ? "Cargando..." : "Buscar"}</button>
      </div>

      {searched && (
        <div style={card}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                <th style={th}>Fecha</th>
                <th style={th}>Tipo</th>
                <th style={th}>Motivo</th>
                <th style={{ ...th, textAlign: "right" }}>Entrada</th>
                <th style={{ ...th, textAlign: "right" }}>Salida</th>
                <th style={{ ...th, textAlign: "right" }}>Saldo</th>
                <th style={{ ...th, textAlign: "right" }}>Costo Unit.</th>
                <th style={{ ...th, textAlign: "right" }}>Costo Total</th>
              </tr>
            </thead>
            <tbody>
              {lineas.length === 0 ? (
                <tr><td colSpan={8} style={{ ...td, textAlign: "center", color: "var(--text-muted)" }}>Sin movimientos</td></tr>
              ) : (
                lineas.map((l, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={td}>{new Date(l.fecha).toLocaleString()}</td>
                    <td style={td}><span style={{ color: l.tipo === "entrada" ? "#16a34a" : "#dc2626", fontWeight: 600 }}>{l.tipo}</span></td>
                    <td style={td}>{l.motivo || "-"}</td>
                    <td style={{ ...td, textAlign: "right" }}>{l.entrada_cantidad > 0 ? l.entrada_cantidad.toLocaleString() : "-"}</td>
                    <td style={{ ...td, textAlign: "right" }}>{l.salida_cantidad > 0 ? l.salida_cantidad.toLocaleString() : "-"}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>{l.saldo_cantidad.toLocaleString()}</td>
                    <td style={{ ...td, textAlign: "right" }}>${l.costo_unitario.toFixed(2)}</td>
                    <td style={{ ...td, textAlign: "right" }}>${l.saldo_costo.toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const card: React.CSSProperties = { background: "var(--surface)", padding: 20, borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow)" };
const btn: React.CSSProperties = { padding: "8px 16px", background: "var(--primary)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 13, fontWeight: 600 };
const th: React.CSSProperties = { padding: "10px 8px", textAlign: "left", fontSize: 11, color: "var(--text-secondary)", textTransform: "uppercase", fontWeight: 600 };
const td: React.CSSProperties = { padding: "8px", fontSize: 13 };
