from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_empresa, require_admin
from app.models.audit import AuditLog
from app.models.empresa import Empresa
from app.models.usuario import Usuario
from app.schemas.audit import AuditLogResponse

router = APIRouter(prefix="/api/audit", tags=["audit"])


@router.get("", response_model=list[AuditLogResponse])
async def list_audit(
    db: AsyncSession = Depends(get_db),
    empresa: Empresa = Depends(get_current_empresa),
    _admin: Usuario = Depends(require_admin),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """Bitácora de auditoría de la empresa (solo admins).

    Se filtra por `empresa_id` a nivel de aplicación. Ordena por fecha
    descendente (lo más reciente primero).
    """
    result = await db.execute(
        select(AuditLog)
        .where(AuditLog.empresa_id == empresa.id)
        .order_by(AuditLog.fecha.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars().all())
