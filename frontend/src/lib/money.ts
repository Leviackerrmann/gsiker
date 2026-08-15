// Formateo de moneda. Base del sistema: GTQ (Quetzal). Secundaria: USD.
export type Moneda = "GTQ" | "USD";

export const MONEDAS: { value: Moneda; label: string }[] = [
  { value: "GTQ", label: "Quetzales (Q)" },
  { value: "USD", label: "Dólares ($)" },
];

const SIMBOLOS: Record<string, string> = { GTQ: "Q", USD: "$" };

export function simboloMoneda(moneda?: string | null): string {
  const m = (moneda || "GTQ").toUpperCase();
  return SIMBOLOS[m] ?? m;
}

/** Formatea un importe con el símbolo de su moneda, ej. "Q 1,234.56" / "$ 99.00". */
export function formatMoney(monto: number | null | undefined, moneda: string = "GTQ"): string {
  const n = Number(monto ?? 0);
  const num = n.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${simboloMoneda(moneda)} ${num}`;
}
