import { useEffect, useMemo, useState } from "react";
import api from "../../lib/api";
import Modal from "../../components/Modal";
import SearchableSelect from "../../components/SearchableSelect";
import { useToast } from "../../components/Toast";
import type { Bodega, SKU } from "../../types";

interface Reserva {
  id: number; sku_id: number; sku_codigo: string; sku_descripcion: string;
  bodega_id: number; bodega_nombre: string; cantidad: number;
  referencia: string | null; fecha_creacion: string; fecha_expiracion: string | null;
}
interface LoteItem { id: number; numero_lote: string; sku_id: number; }

const fmtFechaHora = (s: string) => new Date(s).toLocaleString("es-GT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export default function ReservasPage() {
  const toast = useToast();
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [bodegas, setBodegas] = useState<Bodega[]>([]);
  const [skus, setSkus] = useState<SKU[]>([]);
  const [lotes, setLotes] = useState<LoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [bodegaFilter, setBodegaFilter] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [skuId, setSkuIdF] = useState("");
  const [bodegaIdF, setBodegaIdF] = useState("");
  const [loteIdF, setLoteIdF] = useState("");
  const [cantidadF, setCantidadF] = useState("");
  const [referenciaF, setReferenciaF] = useState("");
  const [error, setError] = useState("");

  const selectedSku = skus.find((s) => s.id === Number(skuId));
  const load = async () => { const { data } = await api.get("/inventario/reservas"); setReservas(data); setLoading(false); };
  useEffect(() => {
    Promise.all([api.get("/inventario/bodegas"), api.get("/skus?limit=500"), api.get("/inventario/lotes")])
      .then(([bRes, sRes, lRes]) => { setBodegas(bRes.data); setSkus(sRes.data); setLotes(lRes.data); });
    load();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    try {
      await api.post("/inventario/reservas", { sku_id: Number(skuId), bodega_id: Number(bodegaIdF), lote_id: loteIdF ? Number(loteIdF) : undefined, cantidad: Number(cantidadF), referencia: referenciaF || undefined });
      toast.success("Reserva creada");
      setShowForm(false); setSkuIdF(""); setBodegaIdF(""); setLoteIdF(""); setCantidadF(""); setReferenciaF(""); load();
    } catch (err: any) { setError(err.response?.data?.detail || "Error"); }
  };
  const cancelar = async (id: number) => { if (!confirm("¿Cancelar esta reserva?")) return; await api.delete(`/inventario/reservas/${id}`); toast.success("Reserva cancelada"); load(); };

  const bodegaOpts = bodegas.map((b) => ({ value: String(b.id), label: b.nombre }));
  const skuOpts = skus.map((s) => ({ value: String(s.id), label: `${s.codigo_sku} - ${s.descripcion}` }));
  const loteOpts = lotes.filter((l) => l.sku_id === Number(skuId)).map((l) => ({ value: String(l.id), label: l.numero_lote }));

  const filtered = useMemo(() => reservas.filter((r) => {
    if (bodegaFilter && String(r.bodega_id) !== bodegaFilter) return false;
    if (search) { const h = `${r.sku_codigo} ${r.sku_descripcion} ${r.referencia || ""}`.toLowerCase(); if (!h.includes(search.toLowerCase())) return false; }
    return true;
  }), [reservas, bodegaFilter, search]);
  const totalReservado = filtered.reduce((a, r) => a + r.cantidad, 0);

  return (
    <div style={{ animation: "fadeInUp .45s ease forwards" }}>
      <div className="ui-head">
        <div><h1 className="ui-title">Reservas de stock</h1><p className="ui-subtitle">Existencias apartadas para pedidos o compromisos</p></div>
        <button className="ui-btn-primary" onClick={() => setShowForm(true)}><i className="fas fa-plus" /> Nueva reserva</button>
      </div>

      <div className="ui-stats">
        <div className="ui-stat"><div className="ui-stat-top"><span className="ui-stat-lbl">Reservas activas</span><i className="fas fa-lock" style={{ color: "var(--primary)" }} /></div><div className="ui-stat-val">{reservas.length}</div></div>
        <div className="ui-stat"><div className="ui-stat-top"><span className="ui-stat-lbl">Unidades reservadas</span><i className="fas fa-cubes" style={{ color: "var(--warning-text)" }} /></div><div className="ui-stat-val" style={{ color: "var(--warning-text)" }}>{totalReservado.toLocaleString()}</div></div>
      </div>

      <div className="ui-toolbar">
        <div className="ui-search-wrap"><i className="fas fa-search" /><input className="ui-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por SKU o referencia..." /></div>
        <select className="ui-select" value={bodegaFilter} onChange={(e) => setBodegaFilter(e.target.value)}><option value="">Todas las bodegas</option>{bodegas.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select>
      </div>

      <div className="ui-table-wrap">
        <table className="ui-table">
          <thead><tr><th>SKU</th><th>Descripción</th><th>Bodega</th><th style={{ textAlign: "right" }}>Cantidad</th><th>Referencia</th><th>Fecha</th><th style={{ width: 90 }}></th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={7} style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Cargando...</td></tr>
            : filtered.length === 0 ? <tr><td colSpan={7} className="ui-empty"><i className="fas fa-lock" />No hay reservas con estos filtros</td></tr>
            : filtered.map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid var(--row-border)" }}>
                <td><span className="ui-code">{r.sku_codigo}</span></td>
                <td style={{ color: "var(--text-primary)", fontWeight: 500 }}>{r.sku_descripcion}</td>
                <td>{r.bodega_nombre}</td>
                <td style={{ textAlign: "right", fontWeight: 700, color: "var(--warning-text)" }} className="ui-mono">{r.cantidad.toLocaleString()}</td>
                <td>{r.referencia || <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                <td style={{ whiteSpace: "nowrap" }}>{fmtFechaHora(r.fecha_creacion)}</td>
                <td style={{ textAlign: "right" }}><button className="ui-btn-danger" style={{ padding: "5px 12px", fontSize: 12 }} onClick={() => cancelar(r.id)}>Cancelar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal isOpen={showForm} title="Nueva reserva de stock" onClose={() => setShowForm(false)} maxWidth={600}>
        <form onSubmit={handleCreate}>
          {error && <div className="ui-error">{error}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div className="ui-field" style={{ margin: 0 }}><label>SKU</label><SearchableSelect options={skuOpts} value={skuId} onChange={(v) => { setSkuIdF(v); setLoteIdF(""); }} placeholder="SKU" required /></div>
            <div className="ui-field" style={{ margin: 0 }}><label>Bodega</label><SearchableSelect options={bodegaOpts} value={bodegaIdF} onChange={setBodegaIdF} placeholder="Bodega" required /></div>
            <div className="ui-field" style={{ margin: 0 }}><label>Cantidad</label><input type="number" step="0.01" min="0.01" value={cantidadF} onChange={(e) => setCantidadF(e.target.value)} className="ui-input" required /></div>
          </div>
          {selectedSku?.maneja_lotes && loteOpts.length > 0 && (
            <div className="ui-field" style={{ marginTop: 12 }}><label>Lote (requerido para este SKU)</label><SearchableSelect options={loteOpts} value={loteIdF} onChange={setLoteIdF} placeholder="Seleccionar lote..." required /></div>
          )}
          <div className="ui-field" style={{ marginTop: 12 }}><label>Referencia</label><input value={referenciaF} onChange={(e) => setReferenciaF(e.target.value)} className="ui-input" /></div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
            <button type="button" onClick={() => setShowForm(false)} className="ui-btn-ghost">Cancelar</button>
            <button type="submit" className="ui-btn-primary">Reservar</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
