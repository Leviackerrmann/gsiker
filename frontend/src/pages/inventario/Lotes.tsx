import { useEffect, useMemo, useState } from "react";
import api from "../../lib/api";
import Modal from "../../components/Modal";
import { useToast } from "../../components/Toast";

interface Lote { id: number; sku_id: number; sku_codigo: string; numero_lote: string; fecha_fabricacion: string | null; fecha_vencimiento: string | null; activo: boolean; created_at: string; }
interface LoteAlerta { id: number; sku_id: number; sku_codigo: string; sku_descripcion: string; numero_lote: string; fecha_vencimiento: string; dias_restantes: number; }
interface SKUItem { id: number; codigo_sku: string; descripcion: string; maneja_lotes: boolean; }

const fmtFecha = (s: string | null) => s ? new Date(s).toLocaleDateString("es-GT", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export default function LotesPage() {
  const toast = useToast();
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [alertas, setAlertas] = useState<LoteAlerta[]>([]);
  const [skus, setSkus] = useState<SKUItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"lotes" | "alertas">("lotes");

  const [showForm, setShowForm] = useState(false);
  const [skuId, setSkuId] = useState("");
  const [numeroLote, setNumeroLote] = useState("");
  const [fechaFab, setFechaFab] = useState("");
  const [fechaVenc, setFechaVenc] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    const [lRes, aRes] = await Promise.all([api.get("/inventario/lotes"), api.get("/inventario/lotes/alertas-vencimiento")]);
    setLotes(lRes.data); setAlertas(aRes.data); setLoading(false);
  };
  useEffect(() => { api.get("/skus?limit=300").then((res) => setSkus(res.data)); load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    try {
      await api.post("/inventario/lotes", { sku_id: Number(skuId), numero_lote: numeroLote, fecha_fabricacion: fechaFab || null, fecha_vencimiento: fechaVenc || null });
      toast.success("Lote creado");
      setShowForm(false); setSkuId(""); setNumeroLote(""); setFechaFab(""); setFechaVenc(""); load();
    } catch (err: any) { setError(err.response?.data?.detail || "Error al crear lote"); }
  };

  const stats = useMemo(() => ({ total: lotes.length, activos: lotes.filter((l) => l.activo).length, porVencer: alertas.length }), [lotes, alertas]);
  const lotesFiltrados = lotes.filter((l) => !search || `${l.numero_lote} ${l.sku_codigo}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={{ animation: "fadeInUp .45s ease forwards" }}>
      <div className="ui-head">
        <div><h1 className="ui-title">Lotes</h1><p className="ui-subtitle">Trazabilidad por lote y control de vencimientos</p></div>
        <button className="ui-btn-primary" onClick={() => setShowForm(true)}><i className="fas fa-plus" /> Nuevo lote</button>
      </div>

      <div className="ui-stats">
        <div className="ui-stat"><div className="ui-stat-top"><span className="ui-stat-lbl">Total lotes</span><i className="fas fa-layer-group" style={{ color: "var(--primary)" }} /></div><div className="ui-stat-val">{stats.total}</div></div>
        <div className="ui-stat"><div className="ui-stat-top"><span className="ui-stat-lbl">Activos</span><i className="fas fa-circle-check" style={{ color: "var(--success-text)" }} /></div><div className="ui-stat-val" style={{ color: "var(--success-text)" }}>{stats.activos}</div></div>
        <div className="ui-stat"><div className="ui-stat-top"><span className="ui-stat-lbl">Por vencer</span><i className="fas fa-clock" style={{ color: "var(--danger)" }} /></div><div className="ui-stat-val" style={{ color: "var(--danger)" }}>{stats.porVencer}</div></div>
      </div>

      <div className="ui-toolbar">
        <div className="ui-chips">
          <button className={`ui-chip ${tab === "lotes" ? "active" : ""}`} onClick={() => setTab("lotes")}>Lotes<span className="ui-chip-count">{lotes.length}</span></button>
          <button className={`ui-chip ${tab === "alertas" ? "active" : ""}`} onClick={() => setTab("alertas")}>Vencimiento<span className="ui-chip-count">{alertas.length}</span></button>
        </div>
        {tab === "lotes" && <div className="ui-search-wrap" style={{ marginLeft: "auto" }}><i className="fas fa-search" /><input className="ui-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por lote o SKU..." /></div>}
      </div>

      {tab === "lotes" ? (
        <div className="ui-table-wrap">
          <table className="ui-table">
            <thead><tr><th>Lote</th><th>SKU</th><th>Fabricación</th><th>Vencimiento</th><th>Estado</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={5} style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Cargando...</td></tr>
              : lotesFiltrados.length === 0 ? <tr><td colSpan={5} className="ui-empty"><i className="fas fa-layer-group" />No hay lotes</td></tr>
              : lotesFiltrados.map((l) => (
                <tr key={l.id} style={{ borderBottom: "1px solid var(--row-border)" }}>
                  <td><span className="ui-code">{l.numero_lote}</span></td>
                  <td className="ui-mono" style={{ color: "var(--text-primary)", fontWeight: 600 }}>{l.sku_codigo}</td>
                  <td>{fmtFecha(l.fecha_fabricacion)}</td>
                  <td>{fmtFecha(l.fecha_vencimiento)}</td>
                  <td><span className="ui-badge" style={{ background: l.activo ? "var(--success-bg)" : "var(--danger-bg)", color: l.activo ? "var(--success-text)" : "var(--danger-text)" }}>{l.activo ? "Activo" : "Inactivo"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="ui-table-wrap">
          {alertas.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40 }}><i className="fas fa-circle-check" style={{ fontSize: 32, color: "var(--success-text)", marginBottom: 10 }} /><div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>No hay lotes próximos a vencer</div></div>
          ) : (
            <table className="ui-table">
              <thead><tr><th>Lote</th><th>SKU</th><th>Descripción</th><th>Vence</th><th style={{ textAlign: "right" }}>Días</th></tr></thead>
              <tbody>
                {alertas.map((a) => {
                  const crit = a.dias_restantes <= 7;
                  return (
                    <tr key={a.id} style={{ borderBottom: "1px solid var(--row-border)" }}>
                      <td><span className="ui-code">{a.numero_lote}</span></td>
                      <td className="ui-mono">{a.sku_codigo}</td>
                      <td style={{ color: "var(--text-primary)", fontWeight: 500 }}>{a.sku_descripcion}</td>
                      <td>{fmtFecha(a.fecha_vencimiento)}</td>
                      <td style={{ textAlign: "right" }}><span className="ui-badge" style={{ background: crit ? "var(--danger-bg)" : "var(--warning-bg)", color: crit ? "var(--danger-text)" : "var(--warning-text)" }}>{a.dias_restantes} días</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      <Modal isOpen={showForm} title="Nuevo lote" onClose={() => setShowForm(false)} maxWidth={560}>
        <form onSubmit={handleCreate}>
          {error && <div className="ui-error">{error}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="ui-field" style={{ margin: 0 }}><label>SKU *</label><select value={skuId} onChange={(e) => setSkuId(e.target.value)} className="ui-input" required><option value="">Seleccionar</option>{skus.map((s) => <option key={s.id} value={s.id}>{s.codigo_sku} - {s.descripcion}</option>)}</select></div>
            <div className="ui-field" style={{ margin: 0 }}><label>Número de lote *</label><input value={numeroLote} onChange={(e) => setNumeroLote(e.target.value.toUpperCase())} className="ui-input" required /></div>
            <div className="ui-field" style={{ margin: 0 }}><label>Fecha fabricación</label><input type="date" value={fechaFab} onChange={(e) => setFechaFab(e.target.value)} className="ui-input" /></div>
            <div className="ui-field" style={{ margin: 0 }}><label>Fecha vencimiento</label><input type="date" value={fechaVenc} onChange={(e) => setFechaVenc(e.target.value)} className="ui-input" /></div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
            <button type="button" onClick={() => setShowForm(false)} className="ui-btn-ghost">Cancelar</button>
            <button type="submit" className="ui-btn-primary">Crear lote</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
