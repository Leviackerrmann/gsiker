import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../../lib/api";
import { formatMoney } from "../../lib/money";
import type { SKU } from "../../types";

interface LineaKardex {
  fecha: string; tipo: string; motivo: string | null; referencia: string | null;
  entrada_cantidad: number; entrada_costo: number; salida_cantidad: number; salida_costo: number;
  saldo_cantidad: number; saldo_costo: number; costo_unitario: number;
}
const fmtFechaHora = (s: string) => new Date(s).toLocaleString("es-GT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function KardexPage() {
  const [searchParams] = useSearchParams();
  const [skus, setSkus] = useState<SKU[]>([]);
  const [skuId, setSkuId] = useState(searchParams.get("sku") || "");
  const [lineas, setLineas] = useState<LineaKardex[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => { api.get("/skus?limit=200").then((res) => setSkus(res.data)); }, []);

  const buscar = async () => {
    if (!skuId) return;
    setLoading(true);
    const { data } = await api.get(`/inventario/kardex/${skuId}`);
    setLineas(data); setSearched(true); setLoading(false);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (searchParams.get("sku")) buscar(); }, []);

  const skuSel = useMemo(() => skus.find((s) => String(s.id) === String(skuId)), [skus, skuId]);
  const totalEntradas = lineas.reduce((a, l) => a + l.entrada_cantidad, 0);
  const totalSalidas = lineas.reduce((a, l) => a + l.salida_cantidad, 0);
  const saldoFinal = lineas.length ? lineas[lineas.length - 1].saldo_cantidad : 0;

  return (
    <div style={{ animation: "fadeInUp .45s ease forwards" }}>
      <div className="ui-head">
        <div><h1 className="ui-title">Kardex</h1><p className="ui-subtitle">Movimientos y saldo valorizado de un producto</p></div>
      </div>

      <div className="ui-table-wrap" style={{ padding: 18, marginBottom: 20, display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--text-muted)", marginBottom: 6 }}>Producto</label>
          <select value={skuId} onChange={(e) => setSkuId(e.target.value)} className="ui-input">
            <option value="">Seleccionar producto...</option>
            {skus.map((s) => <option key={s.id} value={s.id}>{s.codigo_sku} - {s.descripcion}</option>)}
          </select>
        </div>
        <button onClick={buscar} disabled={!skuId || loading} className="ui-btn-primary">{loading ? <><i className="fas fa-spinner ui-spin" /> Cargando…</> : <><i className="fas fa-magnifying-glass" /> Buscar</>}</button>
      </div>

      {searched && (
        <>
          <div className="ui-stats">
            <div className="ui-stat"><div className="ui-stat-top"><span className="ui-stat-lbl">Movimientos</span><i className="fas fa-list" style={{ color: "var(--primary)" }} /></div><div className="ui-stat-val">{lineas.length}</div></div>
            <div className="ui-stat"><div className="ui-stat-top"><span className="ui-stat-lbl">Entradas</span><i className="fas fa-arrow-down" style={{ color: "var(--success-text)" }} /></div><div className="ui-stat-val" style={{ color: "var(--success-text)" }}>{totalEntradas.toLocaleString()}</div></div>
            <div className="ui-stat"><div className="ui-stat-top"><span className="ui-stat-lbl">Salidas</span><i className="fas fa-arrow-up" style={{ color: "var(--danger)" }} /></div><div className="ui-stat-val" style={{ color: "var(--danger)" }}>{totalSalidas.toLocaleString()}</div></div>
            <div className="ui-stat"><div className="ui-stat-top"><span className="ui-stat-lbl">Saldo actual</span><i className="fas fa-cubes" style={{ color: "var(--primary)" }} /></div><div className="ui-stat-val">{saldoFinal.toLocaleString()}</div></div>
          </div>

          {skuSel && <div style={{ marginBottom: 12, fontSize: 13, color: "var(--text-muted)" }}><span className="ui-code">{skuSel.codigo_sku}</span> · {skuSel.descripcion}</div>}

          <div className="ui-table-wrap">
            <table className="ui-table">
              <thead><tr><th>Fecha</th><th>Tipo</th><th>Motivo</th><th style={{ textAlign: "right" }}>Entrada</th><th style={{ textAlign: "right" }}>Salida</th><th style={{ textAlign: "right" }}>Saldo</th><th style={{ textAlign: "right" }}>Costo U.</th><th style={{ textAlign: "right" }}>Costo total</th></tr></thead>
              <tbody>
                {lineas.length === 0 ? <tr><td colSpan={8} className="ui-empty"><i className="fas fa-file-lines" />Sin movimientos</td></tr>
                : lineas.map((l, i) => {
                  const esEntrada = l.tipo === "entrada";
                  return (
                    <tr key={i} style={{ borderBottom: "1px solid var(--row-border)" }}>
                      <td style={{ whiteSpace: "nowrap" }}>{fmtFechaHora(l.fecha)}</td>
                      <td><span className="ui-badge" style={{ background: esEntrada ? "var(--success-bg)" : "var(--danger-bg)", color: esEntrada ? "var(--success-text)" : "var(--danger-text)" }}>{esEntrada ? "Entrada" : "Salida"}</span></td>
                      <td style={{ textTransform: "capitalize" }}>{l.motivo ? l.motivo.replace(/_/g, " ") : (l.referencia || "—")}</td>
                      <td style={{ textAlign: "right" }} className="ui-mono">{l.entrada_cantidad > 0 ? l.entrada_cantidad.toLocaleString() : "—"}</td>
                      <td style={{ textAlign: "right" }} className="ui-mono">{l.salida_cantidad > 0 ? l.salida_cantidad.toLocaleString() : "—"}</td>
                      <td style={{ textAlign: "right", fontWeight: 700, color: "var(--text)" }} className="ui-mono">{l.saldo_cantidad.toLocaleString()}</td>
                      <td style={{ textAlign: "right" }} className="ui-mono">{formatMoney(l.costo_unitario, "GTQ")}</td>
                      <td style={{ textAlign: "right" }} className="ui-mono">{formatMoney(l.saldo_costo, "GTQ")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
