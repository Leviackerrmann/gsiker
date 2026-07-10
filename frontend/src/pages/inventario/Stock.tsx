import { useEffect, useState } from "react";
import api from "../../lib/api";
import Modal from "../../components/Modal";
import type { Bodega, StockItem } from "../../types";

export default function StockPage() {
  const [stock, setStock] = useState<StockItem[]>([]);
  const [bodegas, setBodegas] = useState<Bodega[]>([]);
  const [bodegaFilter, setBodegaFilter] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [minmaxModal, setMinmaxModal] = useState<{ item: StockItem; min: string; max: string } | null>(null);

  const load = () => {
    const params = new URLSearchParams();
    if (bodegaFilter) params.set("bodega_id", bodegaFilter);
    params.set("limit", "500");
    api.get(`/inventario/stock?${params}`).then((res) => {
      setStock(res.data);
      setLoading(false);
    });
  };

  useEffect(() => {
    api.get("/inventario/bodegas").then((res) => setBodegas(res.data));
  }, []);

  useEffect(() => { setLoading(true); load(); }, [bodegaFilter]);

  const filtered = search
    ? stock.filter((s) =>
        s.sku_codigo.toLowerCase().includes(search.toLowerCase()) ||
        s.sku_descripcion.toLowerCase().includes(search.toLowerCase())
      )
    : stock;

  const openMinMax = (s: StockItem) => {
    setMinmaxModal({
      item: s,
      min: s.cantidad_minima?.toString() ?? "",
      max: s.cantidad_maxima?.toString() ?? "",
    });
  };

  const saveMinMax = async () => {
    if (!minmaxModal) return;
    const params = new URLSearchParams();
    if (minmaxModal.min !== "") params.set("cantidad_minima", minmaxModal.min);
    if (minmaxModal.max !== "") params.set("cantidad_maxima", minmaxModal.max);
    if (minmaxModal.min === "" && minmaxModal.max === "") {
      params.set("cantidad_minima", "");
      params.set("cantidad_maxima", "");
    }
    await api.put(`/inventario/stock/${minmaxModal.item.id}?${params}`);
    setMinmaxModal(null);
    load();
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text)" }}>Stock</h2>
        <div style={{ display: "flex", gap: 10 }}>
          <input placeholder="Buscar SKU..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 14, width: 220 }} />
          <select value={bodegaFilter} onChange={(e) => setBodegaFilter(e.target.value)} style={{ padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 14 }}>
            <option value="">Todas las bodegas</option>
            {bodegas.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
          </select>
        </div>
      </div>

      <div style={card}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
              <th style={th}>Código</th>
              <th style={th}>Descripción</th>
              <th style={th}>Lote</th>
              <th style={th}>Bodega</th>
              <th style={{ ...th, textAlign: "right" }}>Stock</th>
              <th style={{ ...th, textAlign: "right" }}>Reservado</th>
              <th style={{ ...th, textAlign: "right" }}>Disponible</th>
              <th style={{ ...th, textAlign: "right" }}>Mínimo</th>
              <th style={{ ...th, textAlign: "right" }}>Máximo</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} style={{ ...td, textAlign: "center", color: "var(--text-muted)" }}>Cargando...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={10} style={{ ...td, textAlign: "center", color: "var(--text-muted)" }}>No hay stock</td></tr>
            ) : (
              filtered.map((s) => (
                <tr key={s.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ ...td, fontWeight: 600, color: "var(--primary)" }}>{s.sku_codigo}</td>
                  <td style={td}>{s.sku_descripcion}</td>
                  <td style={td}>{s.lote_numero || "-"}</td>
                  <td style={td}>{s.bodega_nombre}</td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>
                    <span style={{ color: s.cantidad_disponible <= 0 ? "#dc2626" : s.cantidad_disponible < (s.cantidad_minima ?? 10) ? "#f59e0b" : "#16a34a" }}>
                      {s.cantidad.toLocaleString()}
                    </span>
                  </td>
                  <td style={{ ...td, textAlign: "right" }}>
                    {s.cantidad_reservada > 0 ? <span style={{ color: "var(--warning)", fontWeight: 600 }}>{s.cantidad_reservada.toLocaleString()}</span> : "-"}
                  </td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>
                    <span style={{ color: s.cantidad_disponible <= 0 ? "#dc2626" : s.cantidad_disponible < s.cantidad ? "#f59e0b" : "#16a34a" }}>
                      {s.cantidad_disponible.toLocaleString()}
                    </span>
                  </td>
                  <td style={{ ...td, textAlign: "right" }}>{s.cantidad_minima?.toLocaleString() ?? "-"}</td>
                  <td style={{ ...td, textAlign: "right" }}>{s.cantidad_maxima?.toLocaleString() ?? "-"}</td>
                  <td style={td}>
                    <button onClick={() => openMinMax(s)} style={btnSm}>Min/Max</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal isOpen={!!minmaxModal} title="Configurar Límites" onClose={() => setMinmaxModal(null)}>
        {minmaxModal && (
          <div>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
              {minmaxModal.item.sku_codigo} - {minmaxModal.item.bodega_nombre} (Stock: {minmaxModal.item.cantidad.toLocaleString()})
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div>
                <label style={lbl}>Cantidad Mínima</label>
                <input type="number" min="0" value={minmaxModal.min} onChange={(e) => setMinmaxModal({ ...minmaxModal, min: e.target.value })} style={inp} />
              </div>
              <div>
                <label style={lbl}>Cantidad Máxima</label>
                <input type="number" min="0" value={minmaxModal.max} onChange={(e) => setMinmaxModal({ ...minmaxModal, max: e.target.value })} style={inp} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setMinmaxModal(null)} style={btnSec}>Cancelar</button>
              <button onClick={saveMinMax} style={btnPri}>Guardar</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

const card: React.CSSProperties = { background: "var(--surface)", padding: 20, borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow)", overflowX: "auto" };
const btnPri: React.CSSProperties = { padding: "8px 16px", background: "var(--primary)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 13, fontWeight: 600 };
const btnSec: React.CSSProperties = { padding: "8px 16px", background: "#e5e7eb", color: "var(--text)", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 13, fontWeight: 600 };
const btnSm: React.CSSProperties = { padding: "4px 10px", background: "#f3f4f6", border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer", fontSize: 11 };
const inp: React.CSSProperties = { width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 14, boxSizing: "border-box" };
const lbl: React.CSSProperties = { display: "block", marginBottom: 4, fontSize: 13, color: "var(--text)" };
const th: React.CSSProperties = { padding: "8px 8px", textAlign: "left", fontSize: 11, color: "var(--text-secondary)", textTransform: "uppercase", fontWeight: 600, whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "8px", fontSize: 13, whiteSpace: "nowrap" };
