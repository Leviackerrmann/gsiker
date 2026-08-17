"""Auditoría de acciones de plataforma: actor (platform_admin), empresa afectada
y snapshot antes/después. Escribe una entrada explícita en `audit_log` (más rica
que la del middleware genérico)."""
import json

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog


async def registrar_auditoria_plataforma(
    db: AsyncSession,
    *,
    admin_id: int,
    empresa_id: int | None,
    accion: str,
    antes: dict | None = None,
    despues: dict | None = None,
) -> None:
    db.add(
        AuditLog(
            empresa_id=empresa_id,
            platform_admin_id=admin_id,
            accion=accion,
            metodo="PLATFORM",
            ruta=f"/platform/{accion}",
            status_code=200,
            detalle=json.dumps({"antes": antes or {}, "despues": despues or {}}, default=str, ensure_ascii=False),
        )
    )
