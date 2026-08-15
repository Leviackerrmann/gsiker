from datetime import datetime
from pydantic import BaseModel

class ClienteCreate(BaseModel):
    codigo: str; nombre: str; documento: str | None = None
    direccion: str | None = None; telefono: str | None = None; email: str | None = None
    moneda: str = "GTQ"

class ClienteUpdate(BaseModel):
    nombre: str | None = None; documento: str | None = None; direccion: str | None = None
    telefono: str | None = None; email: str | None = None; moneda: str | None = None; activo: bool | None = None

class ClienteResponse(BaseModel):
    id: int; codigo: str; nombre: str; documento: str | None; direccion: str | None
    telefono: str | None; email: str | None; moneda: str; activo: bool; fecha_creacion: datetime
    model_config = {"from_attributes": True}

class ItemCotizacionVentaCreate(BaseModel):
    sku_id: int; cantidad: float; precio_unitario: float = 0.0

class CotizacionVentaCreate(BaseModel):
    cliente_id: int; notas: str | None = None; items: list[ItemCotizacionVentaCreate]

class ItemCotizacionVentaResponse(BaseModel):
    id: int; sku_id: int; sku_codigo: str; sku_descripcion: str; cantidad: float; precio_unitario: float; precio_total: float

class CotizacionVentaResponse(BaseModel):
    id: int; numero: str; cliente_id: int; cliente_nombre: str; fecha: datetime; estado: str
    notas: str | None; usuario_nombre: str | None; items: list[ItemCotizacionVentaResponse] = []

class ItemPedidoVentaCreate(BaseModel):
    sku_id: int; cantidad_solicitada: float; precio_unitario: float = 0.0

class PedidoVentaCreate(BaseModel):
    cliente_id: int; fecha_entrega: datetime | None = None; nota: str | None = None
    cotizacion_id: int | None = None; items: list[ItemPedidoVentaCreate]

class ItemPedidoVentaResponse(BaseModel):
    id: int; sku_id: int; sku_codigo: str; sku_descripcion: str
    cantidad_solicitada: float; cantidad_despachada: float; precio_unitario: float; precio_total: float

class PedidoVentaResponse(BaseModel):
    id: int; numero: str; cliente_id: int; cliente_nombre: str; fecha_emision: datetime
    fecha_entrega: datetime | None; estado: str; subtotal: float; impuesto_total: float; total: float
    nota: str | None; items: list[ItemPedidoVentaResponse] = []

class FacturaResponse(BaseModel):
    id: int; numero: str; pedido_id: int; pedido_numero: str; cliente_id: int; cliente_nombre: str
    fecha_emision: datetime; fecha_vencimiento: datetime | None; subtotal: float
    impuesto_porcentaje: float; impuesto_total: float; total: float; estado: str; notas: str | None
