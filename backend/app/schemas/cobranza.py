from datetime import datetime

from pydantic import BaseModel, Field


class CrearCuentaRequest(BaseModel):
    cliente_id: int
    monto_total: float = Field(gt=0)
    concepto: str | None = None
    moneda: str = "GTQ"
    fecha_vencimiento: datetime | None = None
    notas: str | None = None


class AbonoRequest(BaseModel):
    monto: float = Field(gt=0)
    metodo: str = "efectivo"  # efectivo | tarjeta | transferencia
    notas: str | None = None


class AbonoResponse(BaseModel):
    id: int
    cuenta_id: int
    monto: float
    metodo: str
    fecha: datetime
    notas: str | None

    model_config = {"from_attributes": True}


class CuentaResponse(BaseModel):
    id: int
    cliente_id: int
    origen: str
    origen_id: int | None
    concepto: str | None
    moneda: str
    monto_total: float
    saldo_pendiente: float
    estado: str
    fecha: datetime
    fecha_vencimiento: datetime | None
    notas: str | None

    model_config = {"from_attributes": True}


class CuentaDetalleResponse(CuentaResponse):
    abonos: list[AbonoResponse]


class EstadoCuentaResponse(BaseModel):
    cliente_id: int
    cliente_nombre: str
    saldo_total: float
    aging: dict[str, float]
    cuentas: list[CuentaResponse]


class ResumenCobranzaResponse(BaseModel):
    cuentas_abiertas: int
    por_cobrar: float
    vencido: float
