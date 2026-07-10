import { useEffect, useState } from "react";
import api from "../../lib/api";

interface Alerta {
  id: number;
  sku_codigo: string;
  sku_descripcion: string;
  bodega_nombre: string;
  cantidad: number;
  cantidad_minima: number | null;
  cantidad_maxima: number | null;
  tipo_alerta: string;
}

export default function AlertasStockPage() {
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/inventario/alertas-stock").then((res) => {
      setAlertas(res.data);
      setLoading(false);
    });
  }, []);

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", marginBottom: 20 }}>Alertas de Stock</h2>

      <div style={card}>
        {loading ? (
          <p style={{ color: "var(--text-secondary)", textAlign: "center" }}>Cargando...</p>
        ) : alertas.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--success)" }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
            <p style={{ fontSize: 15, fontWeight: 600 }}>No hay alertas</p>
            <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>Todo el stock está dentro de los límites configurados</p>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                <th style={th}>SKU</th>
                <th style={th}>Descripción</th>
                <th style={th}>Bodega</th>
                <th style={{ ...th, textAlign: "right" }}>Actual</th>
                <th style={{ ...th, textAlign: "right" }}>Mínimo</th>
                <th style={{ ...th, textAlign: "right" }}>Máximo</th>
                <th style={th}>Alerta</th>
              </tr>
            </thead>
            <tbody>
              {alertas.map((a) => (
                <tr key={a.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ ...td, fontWeight: 600, color: "var(--primary)" }}>{a.sku_codigo}</td>
                  <td style={td}>{a.sku_descripcion}</td>
                  <td style={td}>{a.bodega_nombre}</td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 600, color: a.tipo_alerta === "bajo_minimo" ? "#dc2626" : "#f59e0b" }}>{a.cantidad.toLocaleString()}</td>
                  <td style={{ ...td, textAlign: "right" }}>{a.cantidad_minima?.toLocaleString() ?? "-"}</td>
                  <td style={{ ...td, textAlign: "right" }}>{a.cantidad_maxima?.toLocaleString() ?? "-"}</td>
                  <td style={td}>
                    <span style={{
                      padding: "3px 10px",
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 600,
                      background: a.tipo_alerta === "bajo_minimo" ? "#fee2e2" : "#fef3c7",
                      color: a.tipo_alerta === "bajo_minimo" ? "#dc2626" : "#92400e",
                    }}>
                      {a.tipo_alerta === "bajo_minimo" ? "Bajo mínimo" : "Sobre máximo"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const card: React.CSSProperties = { background: "var(--surface)", padding: 20, borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow)" };
const th: React.CSSProperties = { padding: "10px 12px", textAlign: "left", fontSize: 12, color: "var(--text-secondary)", textTransform: "uppercase", fontWeight: 600 };
const td: React.CSSProperties = { padding: "10px 12px", fontSize: 14 };
