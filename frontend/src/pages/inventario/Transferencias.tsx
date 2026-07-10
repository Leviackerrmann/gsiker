import { useEffect, useState } from "react";
import api from "../../lib/api";
import SearchableSelect from "../../components/SearchableSelect";
import type { Bodega, SKU } from "../../types";

export default function TransferenciasPage() {
  const [bodegas, setBodegas] = useState<Bodega[]>([]);
  const [skus, setSkus] = useState<SKU[]>([]);
  const [origenId, setOrigenId] = useState("");
  const [destinoId, setDestinoId] = useState("");
  const [skuId, setSkuId] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [referencia, setReferencia] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api.get("/inventario/bodegas"), api.get("/skus?limit=500")])
      .then(([bRes, sRes]) => { setBodegas(bRes.data); setSkus(sRes.data); });
  }, []);

  const resetForm = () => {
    setOrigenId(""); setDestinoId(""); setSkuId(""); setCantidad(""); setReferencia("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setMsg("");
    if (origenId === destinoId) { setError("Origen y destino deben ser diferentes"); return; }
    try {
      const { data } = await api.post("/inventario/transferencias", {
        sku_id: Number(skuId), bodega_origen_id: Number(origenId),
        bodega_destino_id: Number(destinoId), cantidad: Number(cantidad),
        referencia: referencia || undefined,
      });
      setMsg(`Transferencia completada (salida #${data.salida_id}, entrada #${data.entrada_id})`);
      resetForm();
    } catch (err: any) { setError(err.response?.data?.detail || "Error en transferencia"); }
  };

  const bodegaOpts = bodegas.map((b) => ({ value: String(b.id), label: b.nombre }));
  const skuOpts = skus.map((s) => ({ value: String(s.id), label: `${s.codigo_sku} - ${s.descripcion}` }));

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", marginBottom: 20 }}>Transferencias entre Bodegas</h2>

      <form onSubmit={handleSubmit} style={card}>
        {msg && <div style={{ background: "var(--success-bg)", color: "var(--success-text)", padding: "10px 14px", borderRadius: "var(--radius-sm)", marginBottom: 12, fontSize: 13 }}>{msg}</div>}
        {error && <div style={{ background: "var(--danger-bg)", color: "var(--danger)", padding: "10px 14px", borderRadius: "var(--radius-sm)", marginBottom: 12, fontSize: 13 }}>{error}</div>}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div><label style={lbl}>Bodega Origen</label><SearchableSelect options={bodegaOpts} value={origenId} onChange={setOrigenId} placeholder="Seleccionar..." required /></div>
          <div><label style={lbl}>Bodega Destino</label><SearchableSelect options={bodegaOpts} value={destinoId} onChange={setDestinoId} placeholder="Seleccionar..." required /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div><label style={lbl}>SKU</label><SearchableSelect options={skuOpts} value={skuId} onChange={setSkuId} placeholder="Seleccionar..." required /></div>
          <div><label style={lbl}>Cantidad</label><input type="number" step="0.01" min="0.01" value={cantidad} onChange={(e) => setCantidad(e.target.value)} style={inp} required /></div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>Referencia (opcional)</label>
          <input value={referencia} onChange={(e) => setReferencia(e.target.value)} style={{ ...inp, width: "50%" }} placeholder="Ej: TRF-001" />
        </div>
        <button type="submit" style={btn}>Realizar Transferencia</button>
      </form>
    </div>
  );
}

const card: React.CSSProperties = { background: "var(--surface)", padding: 24, borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow)", maxWidth: 700 };
const inp: React.CSSProperties = { width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 14, boxSizing: "border-box" };
const lbl: React.CSSProperties = { display: "block", marginBottom: 4, fontSize: 13, color: "var(--text)" };
const btn: React.CSSProperties = { padding: "10px 20px", background: "var(--primary)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 14, fontWeight: 600 };
