export interface User {
  id: number;
  username: string;
  email: string | null;
  nombre_completo: string;
  rol: string;
  activo: boolean;
  fecha_creacion: string;
}

export interface Bodega {
  id: number;
  nombre: string;
  ubicacion: string | null;
  activa: boolean;
  created_at: string;
}

export interface StockItem {
  id: number;
  sku_id: number;
  sku_codigo: string;
  sku_descripcion: string;
  bodega_id: number;
  bodega_nombre: string;
  lote_numero?: string | null;
  cantidad: number;
  cantidad_reservada: number;
  cantidad_disponible: number;
  cantidad_minima: number | null;
  cantidad_maxima: number | null;
  updated_at: string;
}

export interface Movimiento {
  id: number;
  tipo: string;
  motivo: string | null;
  sku_id: number;
  sku_codigo: string;
  bodega_id: number;
  bodega_nombre: string;
  cantidad: number;
  costo_unitario: number;
  costo_total: number;
  fecha: string;
  referencia: string | null;
  documento_origen: string | null;
  usuario_id: number | null;
}

export interface ItemConteo {
  id: number;
  sku_id: number;
  sku_codigo: string;
  sku_descripcion: string;
  cantidad_esperada: number;
  cantidad_contada: number | null;
  diferencia: number | null;
  observaciones: string | null;
}

export interface Conteo {
  id: number;
  bodega_id: number;
  bodega_nombre: string;
  fecha: string;
  estado: string;
  usuario_id: number | null;
  created_at: string;
  items: ItemConteo[];
}

export interface SKU {
  id: number;
  codigo_sku: string;
  descripcion: string;
  unidad_medida: string;
  precio_referencia: number;
  costo_unitario: number;
  metodo_valorizacion: string;
  categoria: string | null;
  subcategoria: string | null;
  maneja_lotes?: boolean;
  fecha_creacion: string;
}
