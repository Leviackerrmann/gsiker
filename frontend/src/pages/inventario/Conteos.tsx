import { useEffect, useMemo, useRef, useState } from "react";
import api from "../../lib/api";
import Modal from "../../components/Modal";
import { useToast } from "../../components/Toast";
import type { Bodega, Conteo } from "../../types";

const ESTADO_META: Record<string, { label: string; bg: string; fg: string }> = {
  abierto: { label: "Abierto", bg: "var(--warning-bg)", fg: "var(--warning-text)" },
  ajustado: { label: "Ajustado", bg: "var(--success-bg)", fg: "var(--success-text)" },
  cerrado: { label: "Cerrado", bg: "var(--border-light)", fg: "var(--text-muted)" },
};
const fmtFechaHora = (s: string) => new Date(s).toLocaleString("es-GT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export default function ConteosPage() {
  const toast = useToast();
  const [conteos, setConteos] = useState<Conteo[]>([]);
  const [bodegas, setBodegas] = useState<Bodega[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [bodegaId, setBodegaId] = useState("");
  const [error, setError] = useState("");
  const [selectedConteo, setSelectedConteo] = useState<Conteo | null>(null);
  const [localCounts, setLocalCounts] = useState<Record<number, string>>({});
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [confirmAjuste, setConfirmAjuste] = useState<number | null>(null);

  const load = async () => { const { data } = await api.get("/inventario/conteos"); setConteos(data); setLoading(false); };
  useEffect(() => { api.get("/inventario/bodegas").then((res) => setBodegas(res.data)); load(); }, []);

  const crearConteo = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    try { await api.post("/inventario/conteos", { bodega_id: Number(bodegaId) }); toast.success("Conteo iniciado"); setShowForm(false); setBodegaId(""); load(); }
    catch (err: any) { setError(err.response?.data?.detail || "Error al crear conteo"); }
  };

  const aplicarAjustes = async (conteoId: number) => {
    await api.post(`/inventario/conteos/${conteoId}/ajustar`);
    toast.success("Ajustes aplicados"); setSelectedConteo(null); setConfirmAjuste(null); load();
  };

  const handleCountChange = (conteoId: number, itemId: number, cantidadEsperada: number, value: string) => {
    setLocalCounts((prev) => ({ ...prev, [itemId]: value }));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const cantidad = Number(value) || 0;
      await api.put(`/inventario/conteos/${conteoId}/items/${itemId}?cantidad_contada=${cantidad}`);
      setSelectedConteo((prev) => prev ? { ...prev, items: prev.items.map((it) => it.id === itemId ? { ...it, cantidad_contada: cantidad, diferencia: cantidad - cantidadEsperada } : it) } : prev);
    }, 600);
  };

  const openConteo = async (c: Conteo) => {
    const { data } = await api.get(`/inventario/conteos/${c.id}`);
    setSelectedConteo(data);
    const counts: Record<number, string> = {};
    data.items.forEach((it: any) => { if (it.cantidad_contada !== null) counts[it.id] = it.cantidad_contada.toString(); });
    setLocalCounts(counts);
  };

  const stats = useMemo(() => ({ total: conteos.length, abiertos: conteos.filter((c) => c.estado === "abierto").length, ajustados: conteos.filter((c) => c.estado === "ajustado").length }), [conteos]);

  if (selectedConteo) {
    const sc = selectedConteo;
    const meta = ESTADO_META[sc.estado] || ESTADO_META.cerrado;
    const conDif = sc.items.filter((it) => it.cantidad_contada !== null && it.cantidad_contada - it.cantidad_esperada !== 0).length;
    return (
      <div style={{ animation: "fadeInUp .45s ease forwards" }}>
        <div className="ui-head">
          <div>
            <button className="ui-btn-ghost" style={{ marginBottom: 12 }} onClick={() => setSelectedConteo(null)}><i className="fas fa-arrow-left" /> Volver</button>
            <h1 className="ui-title">Conteo #{sc.id}</h1>
            <p className="ui-subtitle">{sc.bodega_nombre} · {fmtFechaHora(sc.fecha)}</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className="ui-badge" style={{ background: meta.bg, color: meta.fg, padding: "6px 14px" }}>{meta.label}</span>
            {sc.estado === "abierto" && <button className="ui-btn-success" onClick={() => setConfirmAjuste(sc.id)}><i className="fas fa-check-double" /> Aplicar ajustes</button>}
          </div>
        </div>

        <div className="ui-stats">
          <div className="ui-stat"><div className="ui-stat-top"><span className="ui-stat-lbl">Ítems a contar</span><i className="fas fa-list-check" style={{ color: "var(--primary)" }} /></div><div className="ui-stat-val">{sc.items.length}</div></div>
          <div className="ui-stat"><div className="ui-stat-top"><span className="ui-stat-lbl">Con diferencia</span><i className="fas fa-not-equal" style={{ color: "var(--warning-text)" }} /></div><div className="ui-stat-val" style={{ color: "var(--warning-text)" }}>{conDif}</div></div>
        </div>

        <div className="ui-table-wrap">
          <table className="ui-table">
            <thead><tr><th>SKU</th><th>Descripción</th><th style={{ textAlign: "right" }}>Sistema</th><th style={{ textAlign: "right" }}>Contado</th><th style={{ textAlign: "right" }}>Diferencia</th></tr></thead>
            <tbody>
              {sc.items.map((item) => {
                const dif = item.cantidad_contada !== null ? item.cantidad_contada - item.cantidad_esperada : null;
                return (
                  <tr key={item.id} style={{ borderBottom: "1px solid var(--row-border)" }}>
                    <td><span className="ui-code">{item.sku_codigo}</span></td>
                    <td style={{ color: "var(--text-primary)", fontWeight: 500 }}>{item.sku_descripcion}</td>
                    <td style={{ textAlign: "right" }} className="ui-mono">{item.cantidad_esperada.toLocaleString()}</td>
                    <td style={{ textAlign: "right" }}>
                      {sc.estado === "abierto" ? (
                        <input type="number" step="0.01" value={localCounts[item.id] ?? (item.cantidad_contada !== null ? item.cantidad_contada : "")} onChange={(e) => handleCountChange(sc.id, item.id, item.cantidad_esperada, e.target.value)} className="ui-input" style={{ width: 100, textAlign: "right", padding: "6px 10px" }} placeholder="0" />
                      ) : <span className="ui-mono" style={{ color: item.cantidad_contada !== null ? "var(--text)" : "var(--text-muted)" }}>{item.cantidad_contada?.toLocaleString() ?? "—"}</span>}
                    </td>
                    <td style={{ textAlign: "right" }}>{dif !== null ? <span className="ui-mono" style={{ color: dif === 0 ? "var(--text-muted)" : dif > 0 ? "var(--success-text)" : "var(--danger)", fontWeight: 700 }}>{dif > 0 ? "+" : ""}{dif.toLocaleString()}</span> : <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <Modal isOpen={confirmAjuste != null} title="Aplicar ajustes" onClose={() => setConfirmAjuste(null)}>
          <p style={{ color: "var(--text)", marginBottom: 20, fontSize: 14 }}>¿Aplicar ajustes de inventario según las diferencias encontradas? Se generarán movimientos de ajuste.</p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => setConfirmAjuste(null)} className="ui-btn-ghost">Cancelar</button>
            <button onClick={() => aplicarAjustes(confirmAjuste!)} className="ui-btn-success">Confirmar</button>
          </div>
        </Modal>
      </div>
    );
  }

  return (
    <div style={{ animation: "fadeInUp .45s ease forwards" }}>
      <div className="ui-head">
        <div><h1 className="ui-title">Inventario físico</h1><p className="ui-subtitle">Conteos cíclicos y ajuste de existencias</p></div>
        <button className="ui-btn-primary" onClick={() => setShowForm(true)}><i className="fas fa-plus" /> Nuevo conteo</button>
      </div>

      <div className="ui-stats">
        <div className="ui-stat"><div className="ui-stat-top"><span className="ui-stat-lbl">Total conteos</span><i className="fas fa-clipboard-list" style={{ color: "var(--primary)" }} /></div><div className="ui-stat-val">{stats.total}</div></div>
        <div className="ui-stat"><div className="ui-stat-top"><span className="ui-stat-lbl">Abiertos</span><i className="fas fa-hourglass-half" style={{ color: "var(--warning-text)" }} /></div><div className="ui-stat-val" style={{ color: "var(--warning-text)" }}>{stats.abiertos}</div></div>
        <div className="ui-stat"><div className="ui-stat-top"><span className="ui-stat-lbl">Ajustados</span><i className="fas fa-check-double" style={{ color: "var(--success-text)" }} /></div><div className="ui-stat-val" style={{ color: "var(--success-text)" }}>{stats.ajustados}</div></div>
      </div>

      <div className="ui-table-wrap">
        <table className="ui-table">
          <thead><tr><th>#</th><th>Fecha</th><th>Bodega</th><th>Estado</th><th style={{ textAlign: "center" }}>Ítems</th><th style={{ width: 36 }}></th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={6} style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Cargando...</td></tr>
            : conteos.length === 0 ? <tr><td colSpan={6} className="ui-empty"><i className="fas fa-clipboard-list" />Sin conteos registrados</td></tr>
            : conteos.map((c) => {
              const meta = ESTADO_META[c.estado] || ESTADO_META.cerrado;
              return (
                <tr key={c.id} className="ui-row" onClick={() => openConteo(c)}>
                  <td className="ui-mono" style={{ fontWeight: 700, color: "var(--primary)" }}>#{c.id}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{fmtFechaHora(c.fecha)}</td>
                  <td style={{ color: "var(--text-primary)", fontWeight: 600 }}>{c.bodega_nombre}</td>
                  <td><span className="ui-badge" style={{ background: meta.bg, color: meta.fg }}>{meta.label}</span></td>
                  <td style={{ textAlign: "center" }} className="ui-mono">{c.items.length}</td>
                  <td style={{ textAlign: "right" }}><i className="fas fa-chevron-right ui-chevron" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal isOpen={showForm} title="Nuevo conteo físico" onClose={() => setShowForm(false)} maxWidth={460}>
        <form onSubmit={crearConteo}>
          {error && <div className="ui-error">{error}</div>}
          <div className="ui-field"><label>Bodega</label><select value={bodegaId} onChange={(e) => setBodegaId(e.target.value)} className="ui-input" required><option value="">Seleccionar bodega</option>{bodegas.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select></div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
            <button type="button" onClick={() => setShowForm(false)} className="ui-btn-ghost">Cancelar</button>
            <button type="submit" className="ui-btn-primary">Iniciar conteo</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
