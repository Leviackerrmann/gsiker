// Genera un UUID v4. Usa crypto.getRandomValues (disponible en TODO contexto,
// también HTTP plano), a diferencia de crypto.randomUUID() que solo existe en
// contextos seguros (HTTPS o localhost). Sin esto, el POS crashea al abrirse
// sobre http://<ip> en producción.
export function uuidv4(): string {
  // Camino preferido: randomUUID nativo si está disponible (contexto seguro).
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }
  // Fallback con getRandomValues (disponible también en contexto no seguro).
  if (c && typeof c.getRandomValues === "function") {
    const b = new Uint8Array(16);
    c.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40; // versión 4
    b[8] = (b[8] & 0x3f) | 0x80; // variante RFC 4122
    const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
      .slice(6, 8)
      .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
  }
  // Último recurso (no criptográfico): suficiente para una clave de idempotencia.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
