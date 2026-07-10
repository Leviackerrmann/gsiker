import { useEffect, useRef, useState } from "react";
import api from "../../lib/api";
import Modal from "../../components/Modal";
import type { Bodega, Conteo } from "../../types";

export default function ConteosPage() {
  const [conteos, setConteos] = useState<Conteo[]>([]);
  const [bodegas, setBodegas] = useState<Bodega[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [bodegaId, setBodegaId] = useState("");
  const [error, setError] = useState("");
  const [selectedConteo, setSelectedConteo] = useState<Conteo | null>(null);
  const [localCounts, setLocalCounts] = useState<Record<number, string>>({});
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ title: string; msg: string; action: () => void } | null>(null);

  const load = async () => {
    const { data } = await api.get("/inventario/conteos");
    setConteos(data);
    setLoading(false);
  };

  useEffect(() => {
    api.get("/inventario/bodegas").then((res) => setBodegas(res.data));
    load();
  }, []);

  const crearConteo = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await api.post("/inventario/conteos", { bodega_id: Number(bodegaId) });
      setShowForm(false);
      setBodegaId("");
      load();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Error al crear conteo");
    }
  };

  const handleAjustar = (conteoId: number) => {
    setConfirmModal({
      title: "Aplicar Ajustes",
      msg: "¿Aplicar ajustes de inventario según las diferencias encontradas?",
      action: async () => {
        await api.post(`/inventario/conteos/${conteoId}/ajustar`);
        setSelectedConteo(null);
        setConfirmModal(null);
        load();
      },
    });
  };

  const handleCountChange = (conteoId: number, itemId: number, cantidadEsperada: number, value: string) => {
    setLocalCounts((prev) => ({ ...prev, [itemId]: value }));

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const cantidad = Number(value) || 0;
      await api.put(`/inventario/conteos/${conteoId}/items/${itemId}?cantidad_contada=${cantidad}`);
      setSelectedConteo((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map((it) =>
            it.id === itemId
              ? { ...it, cantidad_contada: cantidad, diferencia: cantidad - cantidadEsperada }
              : it
          ),
        };
      });
    }, 600);
  };

  const openConteo = async (c: Conteo) => {
    const { data } = await api.get(`/inventario/conteos/${c.id}`);
    setSelectedConteo(data);
    const counts: Record<number, string> = {};
    data.items.forEach((it: any) => {
      if (it.cantidad_contada !== null) counts[it.id] = it.cantidad_contada.toString();
    });
    setLocalCounts(counts);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text)" }}>Inventario Físico</h2>
        <button onClick={() => setShowForm(!showForm)} style={btnPri}>+ Nuevo Conteo</button>
      </div>

      {showForm && (
        <form onSubmit={crearConteo} style={{ ...card, marginBottom: 20 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Iniciar Conteo</h3>
          {error && <div style={errStyle}>{error}</div>}
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <select value={bodegaId} onChange={(e) => setBodegaId(e.target.value)} style={inp} required>
              <option value="">Seleccionar bodega</option>
              {bodegas.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
            </select>
            <button type="submit" style={btnPri}>Iniciar</button>
            <button type="button" onClick={() => setShowForm(false)} style={btnSec}>Cancelar</button>
          </div>
        </form>
      )}

      {selectedConteo ? (
        <div>
          <button onClick={() => setSelectedConteo(null)} style={{ ...btnSec, marginBottom: 16 }}>← Volver a lista</button>
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16 }}>Conteo #{selectedConteo.id} - {selectedConteo.bodega_nombre}</h3>
                <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                  {new Date(selectedConteo.fecha).toLocaleString()} · Estado:{" "}
                  <strong style={{ color: selectedConteo.estado === "abierto" ? "#f59e0b" : selectedConteo.estado === "ajustado" ? "#16a34a" : "#6b7280" }}>
                    {selectedConteo.estado.toUpperCase()}
                  </strong>
                </span>
              </div>
              {selectedConteo.estado === "abierto" && (
                <button onClick={() => handleAjustar(selectedConteo.id)} style={btnPri}>Aplicar Ajustes</button>
              )}
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                  <th style={th}>SKU</th>
                  <th style={th}>Descripción</th>
                  <th style={{ ...th, textAlign: "right" }}>Sistema</th>
                  <th style={{ ...th, textAlign: "right" }}>Contado</th>
                  <th style={{ ...th, textAlign: "right" }}>Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {selectedConteo.items.map((item) => {
                  const dif = item.cantidad_contada !== null ? item.cantidad_contada - item.cantidad_esperada : null;
                  return (
                    <tr key={item.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ ...td, fontWeight: 600, color: "var(--primary)" }}>{item.sku_codigo}</td>
                      <td style={td}>{item.sku_descripcion}</td>
                      <td style={{ ...td, textAlign: "right" }}>{item.cantidad_esperada.toLocaleString()}</td>
                      <td style={{ ...td, textAlign: "right" }}>
                        {selectedConteo.estado === "abierto" ? (
                          <input
                            type="number"
                            step="0.01"
                            value={localCounts[item.id] ?? (item.cantidad_contada !== null ? item.cantidad_contada : "")}
                            onChange={(e) => handleCountChange(selectedConteo.id, item.id, item.cantidad_esperada, e.target.value)}
                            style={{ width: 100, padding: "5px 8px", border: "1px solid var(--border)", borderRadius: 4, textAlign: "right", fontSize: 13 }}
                            placeholder="0"
                          />
                        ) : (
                          <span style={{ color: item.cantidad_contada !== null ? "#1a1d23" : "#9ca3af" }}>
                            {item.cantidad_contada?.toLocaleString() ?? "-"}
                          </span>
                        )}
                      </td>
                      <td style={{ ...td, textAlign: "right" }}>
                        {dif !== null ? (
                          <span style={{ color: dif === 0 ? "#6b7280" : dif > 0 ? "#16a34a" : "#dc2626", fontWeight: 600 }}>
                            {dif > 0 ? "+" : ""}{dif.toLocaleString()}
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div style={card}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                <th style={th}>#</th><th style={th}>Fecha</th><th style={th}>Bodega</th><th style={th}>Estado</th><th style={th}>Ítems</th><th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ ...td, textAlign: "center", color: "var(--text-muted)" }}>Cargando...</td></tr>
              ) : conteos.length === 0 ? (
                <tr><td colSpan={6} style={{ ...td, textAlign: "center", color: "var(--text-muted)" }}>Sin conteos registrados</td></tr>
              ) : (
                conteos.map((c) => (
                  <tr key={c.id} style={{ borderBottom: "1px solid #f3f4f6", cursor: "pointer" }} onClick={() => openConteo(c)}>
                    <td style={td}>{c.id}</td>
                    <td style={td}>{new Date(c.fecha).toLocaleString()}</td>
                    <td style={td}>{c.bodega_nombre}</td>
                    <td style={td}>
                      <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 12, fontWeight: 600,
                        background: c.estado === "abierto" ? "#fef3c7" : c.estado === "ajustado" ? "#dcfce7" : "#e5e7eb",
                        color: c.estado === "abierto" ? "#92400e" : c.estado === "ajustado" ? "#166534" : "#374151",
                      }}>{c.estado}</span>
                    </td>
                    <td style={td}>{c.items.length}</td>
                    <td style={td}><span style={{ color: "var(--primary)", fontSize: 13 }}>Ver →</span></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={!!confirmModal} title={confirmModal?.title || ""} onClose={() => setConfirmModal(null)}>
        <p style={{ color: "var(--text)", marginBottom: 20, fontSize: 14 }}>{confirmModal?.msg}</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={() => setConfirmModal(null)} style={btnSec}>Cancelar</button>
          <button onClick={() => confirmModal?.action()} style={{ ...btnPri, background: "#16a34a" }}>Confirmar</button>
        </div>
      </Modal>
    </div>
  );
}

const card: React.CSSProperties = { background: "var(--surface)", padding: 20, borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow)", overflowX: "auto" };
const btnPri: React.CSSProperties = { padding: "8px 16px", background: "var(--primary)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 13, fontWeight: 600 };
const btnSec: React.CSSProperties = { padding: "8px 16px", background: "#e5e7eb", color: "var(--text)", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 13, fontWeight: 600 };
const inp: React.CSSProperties = { padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 14, minWidth: 200 };
const th: React.CSSProperties = { padding: "10px 12px", textAlign: "left", fontSize: 12, color: "var(--text-secondary)", textTransform: "uppercase", fontWeight: 600 };
const td: React.CSSProperties = { padding: "10px 12px", fontSize: 14 };
const errStyle: React.CSSProperties = { background: "var(--danger-bg)", color: "var(--danger)", padding: "8px 12px", borderRadius: "var(--radius-sm)", marginBottom: 12, fontSize: 13 };
