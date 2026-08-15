from datetime import datetime

from pydantic import BaseModel


class ProveedorCreate(BaseModel):
    codigo: str
    nombre: str
    documento: str | None = None
    direccion: str | None = None
    telefono: str | None = None
    email: str | None = None
    moneda: str = "GTQ"


class ProveedorUpdate(BaseModel):
    nombre: str | None = None
    documento: str | None = None
    direccion: str | None = None
    telefono: str | None = None
    email: str | None = None
    moneda: str | None = None
    activo: bool | None = None


class ProveedorResponse(BaseModel):
    id: int
    codigo: str
    nombre: str
    documento: str | None
    direccion: str | None
    telefono: str | None
    email: str | None
    moneda: str
    activo: bool
    fecha_creacion: datetime

    model_config = {"from_attributes": True}


class ItemOCCreate(BaseModel):
    sku_id: int
    cantidad_solicitada: float
    costo_unitario: float = 0.0


class OrdenCreate(BaseModel):
    proveedor_id: int
    fecha_entrega: datetime | None = None
    nota: str | None = None
    # Opcionales: si no se envían, se derivan del proveedor y de la empresa.
    moneda: str | None = None
    tipo_cambio: float | None = None
    items: list[ItemOCCreate]


class OrdenUpdate(BaseModel):
    fecha_entrega: datetime | None = None
    nota: str | None = None


class ItemOCResponse(BaseModel):
    id: int
    sku_id: int
    sku_codigo: str
    sku_descripcion: str
    cantidad_solicitada: float
    cantidad_recibida: float
    costo_unitario: float
    costo_total: float

    model_config = {"from_attributes": True}


class OrdenResponse(BaseModel):
    id: int
    numero_oc: str
    proveedor_id: int
    proveedor_nombre: str
    fecha_emision: datetime
    fecha_entrega: datetime | None
    estado: str
    moneda: str
    tipo_cambio: float
    nota: str | None
    usuario_id: int | None
    created_at: datetime
    items: list[ItemOCResponse] = []

    model_config = {"from_attributes": True}


class ItemRecepcionCreate(BaseModel):
    item_orden_id: int
    cantidad_recibida: float


class RecepcionCreate(BaseModel):
    bodega_id: int
    items: list[ItemRecepcionCreate]
    nota: str | None = None


class ItemRecepcionResponse(BaseModel):
    id: int
    item_orden_id: int
    cantidad_recibida: float
    sku_codigo: str

    model_config = {"from_attributes": True}


class RecepcionResponse(BaseModel):
    id: int
    orden_id: int
    numero_oc: str
    fecha: datetime
    nota: str | None
    items: list[ItemRecepcionResponse] = []

    model_config = {"from_attributes": True}
