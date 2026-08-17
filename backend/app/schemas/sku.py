from datetime import datetime

from pydantic import BaseModel


class SKUCreate(BaseModel):
    codigo_sku: str
    descripcion: str
    unidad_medida: str = "UNIDAD"
    precio_referencia: float = 0.0
    costo_unitario: float = 0.0
    metodo_valorizacion: str = "PMP"
    categoria: str | None = None
    subcategoria: str | None = None


class SKUUpdate(BaseModel):
    descripcion: str | None = None
    unidad_medida: str | None = None
    precio_referencia: float | None = None
    costo_unitario: float | None = None
    metodo_valorizacion: str | None = None
    categoria: str | None = None
    subcategoria: str | None = None


class SKUResponse(BaseModel):
    id: int
    codigo_sku: str
    descripcion: str
    unidad_medida: str
    precio_referencia: float
    # Se oculta (null) a operadores: el costo es información sensible (márgenes).
    costo_unitario: float | None
    metodo_valorizacion: str
    categoria: str | None
    subcategoria: str | None
    fecha_creacion: datetime

    model_config = {"from_attributes": True}
