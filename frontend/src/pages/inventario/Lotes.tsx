import { useEffect, useState } from "react";
import api from "../../lib/api";

import Badge from "../../components/Badge";
interface Lote {
  id: number; sku_id: number; sku_codigo: string; numero_lote: string;
  fecha_fabricacion: string | null; fecha_vencimiento: string | null;
  activo: boolean; created_at: string;
}

interface LoteAlerta {
  id: number; sku_id: number; sku_codigo: string; sku_descripcion: string;
  numero_lote: string; fecha_vencimiento: string; dias_restantes: number;
}

interface SKUItem { id: number; codigo_sku: string; descripcion: string; maneja_lotes: boolean; }

export default function LotesPage() {
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [alertas, setAlertas] = useState<LoteAlerta[]>([]);
  const [skus, setSkus] = useState<SKUItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [skuId, setSkuId] = useState("");
  const [numeroLote, setNumeroLote] = useState("");
  const [fechaFab, setFechaFab] = useState("");
  const [fechaVenc, setFechaVenc] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"lotes" | "alertas">("lotes");

  const load = async () => {
    const [lRes, aRes] = await Promise.all([
      api.get("/inventario/lotes"),
      api.get("/inventario/lotes/alertas-vencimiento"),
    ]);
    setLotes(lRes.data);
    setAlertas(aRes.data);
    setLoading(false);
  };

  useEffect(() => {
    api.get("/skus?limit=300").then((res) => setSkus(res.data));
    load();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await api.post("/inventario/lotes", {
        sku_id: Number(skuId),
        numero_lote: numeroLote,
        fecha_fabricacion: fechaFab || null,
        fecha_vencimiento: fechaVenc || null,
      });
      setShowForm(false);
      setSkuId(""); setNumeroLote(""); setFechaFab(""); setFechaVenc("");
      load();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Error al crear lote");
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text)" }}>Lotes</h2>
        <button onClick={() => setShowForm(!showForm)} style={btnPri}>+ Nuevo Lote</button>
      </div>

      <div style={{ display: "flex", gap: 0, marginBottom: 16 }}>
        <button onClick={() => setTab("lotes")} style={{ ...tabBtn, borderBottom: tab === "lotes" ? "2px solid #6366f1" : "2px solid transparent", color: tab === "lotes" ? "#6366f1" : "#6b7280" }}>Lotes</button>
        <button onClick={() => setTab("alertas")} style={{ ...tabBtn, borderBottom: tab === "alertas" ? "2px solid #6366f1" : "2px solid transparent", color: tab === "alertas" ? "#6366f1" : "#6b7280" }}>
          Vencimiento ({alertas.length})
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} style={{ ...card, marginBottom: 20, maxWidth: 600 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Nuevo Lote</h3>
          {error && <div style={{ background: "var(--danger-bg)", color: "var(--danger)", padding: "8px 12px", borderRadius: "var(--radius-sm)", marginBottom: 12, fontSize: 13 }}>{error}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div><label style={lbl}>SKU *</label><select value={skuId} onChange={(e) => setSkuId(e.target.value)} style={inp} required><option value="">Seleccionar</option>{skus.map((s) => <option key={s.id} value={s.id}>{s.codigo_sku} - {s.descripcion}</option>)}</select></div>
            <div><label style={lbl}>Número Lote *</label><input value={numeroLote} onChange={(e) => setNumeroLote(e.target.value.toUpperCase())} style={inp} required /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div><label style={lbl}>F. Fabricación</label><input type="date" value={fechaFab} onChange={(e) => setFechaFab(e.target.value)} style={inp} /></div>
            <div><label style={lbl}>F. Vencimiento</label><input type="date" value={fechaVenc} onChange={(e) => setFechaVenc(e.target.value)} style={inp} /></div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" style={btnPri}>Crear Lote</button>
            <button type="button" onClick={() => setShowForm(false)} style={btnSec}>Cancelar</button>
          </div>
        </form>
      )}

      {tab === "lotes" ? (
        <div style={card}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ borderBottom: "1px solid #e5e7eb" }}>
              <th style={th}>Lote</th><th style={th}>SKU</th><th style={th}>F. Fab.</th><th style={th}>F. Venc.</th><th style={th}>Activo</th>
            </tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={5} style={{ ...td, textAlign: "center", color: "var(--text-muted)" }}>Cargando...</td></tr>
              : lotes.length === 0 ? <tr><td colSpan={5} style={{ ...td, textAlign: "center", color: "var(--text-muted)" }}>Sin lotes</td></tr>
              : lotes.map((l) => (
                <tr key={l.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ ...td, fontWeight: 600, color: "var(--primary)" }}>{l.numero_lote}</td>
                  <td style={td}>{l.sku_codigo}</td>
                  <td style={td}>{l.fecha_fabricacion ? new Date(l.fecha_fabricacion).toLocaleDateString() : "-"}</td>
                  <td style={td}>{l.fecha_vencimiento ? new Date(l.fecha_vencimiento).toLocaleDateString() : "-"}</td>
                  <td style={td}><Badge color={l.activo ? "success" : "danger"}>{l.activo ? "Activo" : "Inactivo"}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={card}>
          {alertas.length === 0 ? (
            <div style={{ textAlign: "center", padding: 30, color: "var(--success)" }}>✅ No hay lotes próximos a vencer</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                <th style={th}>Lote</th><th style={th}>SKU</th><th style={th}>Descripción</th><th style={th}>Vence</th><th style={{ ...th, textAlign: "right" }}>Días</th>
              </tr></thead>
              <tbody>
                {alertas.map((a) => (
                  <tr key={a.id} style={{ borderBottom: "1px solid #f3f4f6", background: a.dias_restantes <= 7 ? "#fef2f2" : "transparent" }}>
                    <td style={{ ...td, fontWeight: 600 }}>{a.numero_lote}</td>
                    <td style={td}>{a.sku_codigo}</td>
                    <td style={td}>{a.sku_descripcion}</td>
                    <td style={td}>{new Date(a.fecha_vencimiento).toLocaleDateString()}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 600, color: a.dias_restantes <= 7 ? "#dc2626" : "#f59e0b" }}>{a.dias_restantes} días</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

const card: React.CSSProperties = { background: "var(--surface)", padding: 20, borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow)", overflowX: "auto" };
const btnPri: React.CSSProperties = { padding: "8px 16px", background: "var(--primary)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 13, fontWeight: 600 };
const btnSec: React.CSSProperties = { padding: "8px 16px", background: "#e5e7eb", color: "var(--text)", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 13, fontWeight: 600 };
const inp: React.CSSProperties = { width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 14, boxSizing: "border-box" };
const lbl: React.CSSProperties = { display: "block", marginBottom: 4, fontSize: 13, color: "var(--text)" };
const th: React.CSSProperties = { padding: "10px 12px", textAlign: "left", fontSize: 12, color: "var(--text-secondary)", textTransform: "uppercase", fontWeight: 600 };
const td: React.CSSProperties = { padding: "10px 12px", fontSize: 14 };
const tabBtn: React.CSSProperties = { background: "none", border: "none", padding: "8px 16px", cursor: "pointer", fontSize: 14, fontWeight: 600, fontFamily: "inherit" };
