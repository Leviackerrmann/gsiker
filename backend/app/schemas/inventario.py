from datetime import datetime

from pydantic import BaseModel


class BodegaCreate(BaseModel):
    nombre: str
    ubicacion: str | None = None


class BodegaUpdate(BaseModel):
    nombre: str | None = None
    ubicacion: str | None = None
    activa: bool | None = None


class BodegaResponse(BaseModel):
    id: int
    nombre: str
    ubicacion: str | None
    activa: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class StockResponse(BaseModel):
    id: int
    sku_id: int
    sku_codigo: str
    sku_descripcion: str
    bodega_id: int
    bodega_nombre: str
    lote_numero: str | None = None
    cantidad: float
    cantidad_reservada: float = 0.0
    cantidad_disponible: float = 0.0
    cantidad_minima: float | None = None
    cantidad_maxima: float | None = None
    updated_at: datetime

    model_config = {"from_attributes": True}


class AlertaStockResponse(BaseModel):
    id: int
    sku_id: int
    sku_codigo: str
    sku_descripcion: str
    bodega_id: int
    bodega_nombre: str
    cantidad: float
    cantidad_minima: float | None
    cantidad_maxima: float | None
    tipo_alerta: str


class MovimientoCreate(BaseModel):
    tipo: str
    motivo: str | None = None
    sku_id: int
    bodega_id: int
    cantidad: float
    costo_unitario: float = 0.0
    referencia: str | None = None
    documento_origen: str | None = None


class MovimientoResponse(BaseModel):
    id: int
    tipo: str
    motivo: str | None = None
    sku_id: int
    sku_codigo: str
    bodega_id: int
    bodega_nombre: str
    cantidad: float
    costo_unitario: float = 0.0
    costo_total: float = 0.0
    fecha: datetime
    referencia: str | None
    documento_origen: str | None
    usuario_id: int | None

    model_config = {"from_attributes": True}


class TransferenciaCreate(BaseModel):
    sku_id: int
    bodega_origen_id: int
    bodega_destino_id: int
    cantidad: float
    referencia: str | None = None


class KardexItemResponse(BaseModel):
    fecha: datetime
    tipo: str
    motivo: str | None = None
    referencia: str | None
    entrada_cantidad: float = 0.0
    entrada_costo: float = 0.0
    salida_cantidad: float = 0.0
    salida_costo: float = 0.0
    saldo_cantidad: float = 0.0
    saldo_costo: float = 0.0
    costo_unitario: float = 0.0


class ReservaCreate(BaseModel):
    sku_id: int
    bodega_id: int
    cantidad: float
    referencia: str | None = None
    fecha_expiracion: datetime | None = None


class ReservaResponse(BaseModel):
    id: int
    sku_id: int
    sku_codigo: str
    sku_descripcion: str
    bodega_id: int
    bodega_nombre: str
    cantidad: float
    referencia: str | None
    fecha_creacion: datetime
    fecha_expiracion: datetime | None
    usuario_id: int | None

    model_config = {"from_attributes": True}


class ItemConteoCreate(BaseModel):
    sku_id: int
    cantidad_contada: float | None = None
    observaciones: str | None = None


class ItemConteoResponse(BaseModel):
    id: int
    sku_id: int
    sku_codigo: str
    sku_descripcion: str
    cantidad_esperada: float
    cantidad_contada: float | None
    diferencia: float | None
    observaciones: str | None

    model_config = {"from_attributes": True}


class ConteoCreate(BaseModel):
    bodega_id: int


class ConteoResponse(BaseModel):
    id: int
    bodega_id: int
    bodega_nombre: str
    fecha: datetime
    estado: str
    usuario_id: int | None
    created_at: datetime
    items: list[ItemConteoResponse] = []

    model_config = {"from_attributes": True}
