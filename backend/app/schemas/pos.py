from datetime import datetime

from pydantic import BaseModel, Field


# --- Caja / arqueo ---

class AbrirCajaRequest(BaseModel):
    monto_inicial: float = Field(ge=0, default=0.0)


class CerrarCajaRequest(BaseModel):
    monto_final_declarado: float = Field(ge=0)


class CajaSesionResponse(BaseModel):
    id: int
    usuario_id: int | None
    estado: str
    monto_inicial: float
    fecha_apertura: datetime
    fecha_cierre: datetime | None
    monto_esperado: float | None
    monto_final_declarado: float | None
    diferencia: float | None

    model_config = {"from_attributes": True}


# --- Venta POS ---

class ItemVentaPOSRequest(BaseModel):
    sku_id: int
    cantidad: float = Field(gt=0)
    # Precio final por unidad (IVA incluido). Si es None, se usa el del SKU.
    precio_unitario: float | None = Field(default=None, ge=0)


class PagoRequest(BaseModel):
    metodo: str  # efectivo | tarjeta | transferencia
    monto: float = Field(gt=0)
    monto_recibido: float | None = Field(default=None, ge=0)


class VentaPOSRequest(BaseModel):
    caja_sesion_id: int
    bodega_id: int
    cliente_id: int | None = None
    items: list[ItemVentaPOSRequest] = Field(min_length=1)
    # En contado los pagos deben cubrir el total. En crédito (fiado) pueden ser
    # parciales o vacíos: el saldo queda como cuenta por cobrar del cliente.
    pagos: list[PagoRequest] = Field(default_factory=list)
    a_credito: bool = False
    # Descuento a nivel de venta (0–100 %). El total se calcula restándolo del bruto.
    descuento_porcentaje: float = Field(default=0, ge=0, le=100)
    # Id único por venta (lo genera el frontend) para evitar duplicados por doble-clic.
    idempotency_key: str | None = Field(default=None, max_length=64)


class ItemVentaPOSResponse(BaseModel):
    id: int
    sku_id: int
    cantidad: float
    precio_unitario: float
    precio_total: float

    model_config = {"from_attributes": True}


class PagoResponse(BaseModel):
    id: int
    metodo: str
    monto: float
    monto_recibido: float | None
    cambio: float | None

    model_config = {"from_attributes": True}


class VentaPOSResponse(BaseModel):
    id: int
    numero: str
    caja_sesion_id: int
    bodega_id: int
    cliente_id: int | None
    fecha: datetime
    subtotal: float
    impuesto_porcentaje: float
    impuesto_total: float
    descuento_porcentaje: float = 0
    descuento_monto: float = 0
    total: float
    estado: str
    items: list[ItemVentaPOSResponse]
    pagos: list[PagoResponse]

    model_config = {"from_attributes": True}


class ResumenDiaResponse(BaseModel):
    fecha: str
    num_ventas: int
    total: float
    por_metodo: dict[str, float]
