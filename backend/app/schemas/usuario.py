from datetime import datetime

from pydantic import BaseModel, EmailStr


class UsuarioCreate(BaseModel):
    username: str
    email: str | None = None
    password: str
    nombre_completo: str
    rol: str = "operador"


class UsuarioUpdate(BaseModel):
    nombre_completo: str | None = None
    email: str | None = None
    rol: str | None = None
    activo: bool | None = None


class UsuarioResponse(BaseModel):
    id: int
    empresa_id: int | None
    username: str
    email: str | None
    nombre_completo: str
    rol: str
    activo: bool
    fecha_creacion: datetime

    model_config = {"from_attributes": True}
