from pydantic import BaseModel


class EmpresaCreate(BaseModel):
    nombre: str


class EmpresaUpdate(BaseModel):
    nombre: str | None = None
    activa: bool | None = None


class EmpresaResponse(BaseModel):
    id: int
    nombre: str
    activa: bool

    model_config = {"from_attributes": True}
