from datetime import datetime

from pydantic import BaseModel

from app.models.empresa import RegimenFiscal


class EmpresaCreate(BaseModel):
    nombre: str
    nombre_comercial: str | None = None
    nit: str | None = None
    direccion: str | None = None
    telefono: str | None = None
    email: str | None = None
    regimen_fiscal: RegimenFiscal = RegimenFiscal.GENERAL
    moneda: str = "GTQ"


class EmpresaUpdate(BaseModel):
    nombre: str | None = None
    nombre_comercial: str | None = None
    nit: str | None = None
    direccion: str | None = None
    telefono: str | None = None
    email: str | None = None
    regimen_fiscal: RegimenFiscal | None = None
    moneda: str | None = None
    logo_url: str | None = None
    activa: bool | None = None


class EmpresaResponse(BaseModel):
    id: int
    nombre: str
    nombre_comercial: str | None
    nit: str | None
    direccion: str | None
    telefono: str | None
    email: str | None
    regimen_fiscal: RegimenFiscal
    moneda: str
    logo_url: str | None
    plan_id: int | None
    activa: bool
    fecha_creacion: datetime

    model_config = {"from_attributes": True}


class RegistroEmpresaRequest(BaseModel):
    """Onboarding público: crea la empresa y su primer usuario administrador."""

    # Datos de la empresa
    empresa_nombre: str
    nit: str | None = None
    regimen_fiscal: RegimenFiscal = RegimenFiscal.GENERAL
    telefono: str | None = None
    # Primer usuario admin
    admin_username: str
    admin_password: str
    admin_nombre_completo: str
    admin_email: str | None = None


class PlanResponse(BaseModel):
    id: int
    nombre: str
    descripcion: str | None
    precio_mensual: float
    max_usuarios: int | None
    max_skus: int | None
    activo: bool

    model_config = {"from_attributes": True}
