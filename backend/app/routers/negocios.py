"""Alta del negocio en el onboarding (paso 2).

`POST /businesses` la usa un usuario ya autenticado (por teléfono/Google) que
todavía NO tiene empresa: crea su negocio, le asigna el plan trial y lo deja como
admin. Depende de `get_current_user` (no de `get_current_empresa`), justamente
porque el usuario aún no tiene tenant.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.empresa import Empresa, Plan
from app.models.usuario import RolUsuario, Usuario
from app.schemas.auth import CrearNegocioRequest, NegocioResponse
from app.services.platform import suscripciones as suscripciones_svc

router = APIRouter(prefix="/api", tags=["negocios"])


@router.post("/businesses", response_model=NegocioResponse, status_code=status.HTTP_201_CREATED)
async def crear_negocio(
    body: CrearNegocioRequest,
    current_user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.empresa_id is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ya tienes un negocio asociado.",
        )

    nombre = (body.nombre or "").strip()
    if not nombre:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El nombre del negocio es obligatorio.")

    dup = await db.execute(select(Empresa).where(Empresa.nombre == nombre))
    if dup.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ya existe un negocio con ese nombre.")

    empresa = Empresa(
        nombre=nombre,
        tipo_negocio=(body.categoria or None),
    )
    db.add(empresa)
    await db.flush()

    # Plan por defecto: el más barato entre los activos no personalizados (igual
    # que el onboarding clásico). Si no hay planes, el negocio nace sin suscripción.
    plan_result = await db.execute(
        select(Plan).where(Plan.activo, Plan.es_personalizado.is_(False)).order_by(Plan.precio).limit(1)
    )
    plan = plan_result.scalar_one_or_none()
    if plan is not None:
        await suscripciones_svc.crear_trial(db, empresa, plan, admin_id=None)

    # El creador queda como admin del negocio y guardamos su nombre si lo dio.
    if body.nombre_usuario and body.nombre_usuario.strip():
        current_user.nombre_completo = body.nombre_usuario.strip()
    current_user.empresa_id = empresa.id
    current_user.rol = RolUsuario.ADMIN
    await db.flush()

    return empresa
