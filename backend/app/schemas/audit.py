from datetime import datetime

from pydantic import BaseModel


class AuditLogResponse(BaseModel):
    id: int
    fecha: datetime
    empresa_id: int | None
    usuario_id: int | None
    accion: str | None
    metodo: str
    ruta: str
    status_code: int | None
    ip: str | None

    model_config = {"from_attributes": True}
