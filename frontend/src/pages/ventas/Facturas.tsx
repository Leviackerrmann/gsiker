import { useEffect, useState } from "react";
import api from "../../lib/api";
import Modal from "../../components/Modal";
import { useToast } from "../../components/Toast";

interface Factura {
  id: number; numero: string; pedido_id: number; pedido_numero: string;
  cliente_nombre: string; fecha_emision: string; fecha_vencimiento: string | null;
  subtotal: number; impuesto_porcentaje: number; impuesto_total: number; total: number;
  estado: string; notas: string | null;
}

interface FacturaDetalle extends Factura {
  items: { sku_codigo: string; sku_descripcion: string; cantidad: number; precio_unitario: number; precio_total: number }[];
}

export default function FacturasPage() {
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<FacturaDetalle | null>(null);
  const toast = useToast();

  const load = () => {
    api.get("/ventas/facturas").then((r) => { setFacturas(r.data); setLoading(false); });
  };
  useEffect(() => { load(); }, []);

  const openDetail = async (id: number) => {
    try {
      const { data } = await api.get(`/ventas/facturas/${id}`);
      setDetail(data);
    } catch { setDetail(null); }
  };

  const handlePagar = async (id: number) => {
    await api.post(`/ventas/facturas/${id}/pagar`);
    toast.success("Factura marcada como pagada"); load();
  };

  const handleAnular = async (id: number) => {
    await api.post(`/ventas/facturas/${id}/anular`);
    toast.success("Factura anulada"); load();
  };

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", marginBottom: 20 }}>Facturas de Venta</h2>

      <div style={card}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
              <th style={th}>Factura</th>
              <th style={th}>Pedido</th>
              <th style={th}>Cliente</th>
              <th style={th}>Fecha</th>
              <th style={{ ...th, textAlign: "right" }}>Subtotal</th>
              <th style={{ ...th, textAlign: "right" }}>IVA</th>
              <th style={{ ...th, textAlign: "right" }}>Total</th>
              <th style={th}>Estado</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ ...td, textAlign: "center", color: "var(--text-muted)" }}>Cargando...</td></tr>
            ) : facturas.length === 0 ? (
              <tr><td colSpan={9} style={{ ...td, textAlign: "center", color: "var(--text-muted)" }}>Sin facturas registradas</td></tr>
            ) : (
              facturas.map((f) => (
                <tr key={f.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ ...td, fontWeight: 600, color: "var(--primary)", cursor: "pointer" }} onClick={() => openDetail(f.id)}>{f.numero}</td>
                  <td style={td}>{f.pedido_numero}</td>
                  <td style={td}>{f.cliente_nombre}</td>
                  <td style={td}>{new Date(f.fecha_emision).toLocaleDateString()}</td>
                  <td style={{ ...td, textAlign: "right" }}>${f.subtotal.toFixed(2)}</td>
                  <td style={{ ...td, textAlign: "right" }}>${f.impuesto_total.toFixed(2)}</td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>${f.total.toFixed(2)}</td>
                  <td style={td}>
                    <span style={{
                      fontWeight: 600, fontSize: 12, padding: "3px 10px", borderRadius: 999,
                      background: f.estado === "pendiente" ? "#fef3c7" : f.estado === "pagada" ? "#dcfce7" : "#fee2e2",
                      color: f.estado === "pendiente" ? "#92400e" : f.estado === "pagada" ? "#166534" : "#dc2626",
                    }}>{f.estado.toUpperCase()}</span>
                  </td>
                  <td style={td}>
                    {f.estado === "pendiente" && (
                      <>
                        <button onClick={() => handlePagar(f.id)} style={{ ...btnSm, color: "var(--success)", marginRight: 4 }}>Pagar</button>
                        <button onClick={() => handleAnular(f.id)} style={{ ...btnSm, color: "var(--danger)" }}>Anular</button>
                      </>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal isOpen={!!detail} title={`Factura ${detail?.numero || ""}`} onClose={() => setDetail(null)} maxWidth={700}>
        {detail && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16, fontSize: 13 }}>
              <div><strong>Cliente:</strong> {detail.cliente_nombre}</div>
              <div><strong>Pedido:</strong> {detail.pedido_numero}</div>
              <div><strong>Fecha:</strong> {new Date(detail.fecha_emision).toLocaleDateString()}</div>
              <div><strong>Estado:</strong> <span style={{ color: detail.estado === "pagada" ? "#16a34a" : detail.estado === "anulada" ? "#dc2626" : "#f59e0b", fontWeight: 600 }}>{detail.estado.toUpperCase()}</span></div>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                  <th style={th}>SKU</th>
                  <th style={th}>Descripción</th>
                  <th style={{ ...th, textAlign: "right" }}>Cant.</th>
                  <th style={{ ...th, textAlign: "right" }}>Precio U.</th>
                  <th style={{ ...th, textAlign: "right" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {detail.items.map((it: any, i: number) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={td}>{it.sku_codigo}</td>
                    <td style={td}>{it.sku_descripcion}</td>
                    <td style={{ ...td, textAlign: "right" }}>{it.cantidad.toLocaleString()}</td>
                    <td style={{ ...td, textAlign: "right" }}>${it.precio_unitario.toFixed(2)}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>${it.precio_total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ borderTop: "2px solid #e5e7eb", paddingTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4, fontSize: 13 }}>
                <span style={{ color: "var(--text-secondary)", marginRight: 40 }}>Subtotal:</span>
                <span style={{ fontWeight: 600 }}>${detail.subtotal.toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4, fontSize: 13 }}>
                <span style={{ color: "var(--text-secondary)", marginRight: 40 }}>IVA ({detail.impuesto_porcentaje}%):</span>
                <span style={{ fontWeight: 600 }}>${detail.impuesto_total.toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", fontSize: 16 }}>
                <span style={{ color: "var(--text-secondary)", marginRight: 40 }}>Total:</span>
                <span style={{ fontWeight: 700, color: "var(--primary)" }}>${detail.total.toFixed(2)}</span>
              </div>
            </div>

            {detail.estado === "pendiente" && (
              <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
                <button onClick={() => { handlePagar(detail.id); setDetail(null); }} style={{ ...btnPri, background: "#16a34a" }}>Marcar como Pagada</button>
                <button onClick={() => { handleAnular(detail.id); setDetail(null); }} style={{ ...btnPri, background: "#dc2626" }}>Anular</button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

const card: React.CSSProperties = { background: "var(--surface)", padding: 20, borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow)", overflowX: "auto" };
const btnPri: React.CSSProperties = { padding: "8px 16px", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 13, fontWeight: 600 };
const btnSm: React.CSSProperties = { padding: "4px 10px", background: "#f3f4f6", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer", fontSize: 12 };
const th: React.CSSProperties = { padding: "10px 12px", textAlign: "left", fontSize: 12, color: "var(--text-secondary)", textTransform: "uppercase", fontWeight: 600 };
const td: React.CSSProperties = { padding: "10px 12px", fontSize: 14 };
