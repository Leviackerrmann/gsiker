from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_empresa, require_admin
from app.models.empresa import Empresa, Plan
from app.models.usuario import Usuario
from app.schemas.empresa import EmpresaResponse, EmpresaUpdate, PlanResponse

router = APIRouter(prefix="/api/empresas", tags=["empresas"])


@router.get("/planes", response_model=list[PlanResponse])
async def list_planes(db: AsyncSession = Depends(get_db)):
    """Planes públicos del catálogo (no personalizados). Para el onboarding."""
    result = await db.execute(
        select(Plan)
        .where(Plan.activo, Plan.es_personalizado.is_(False))
        .order_by(Plan.precio)
    )
    return result.scalars().all()


@router.get("/mi-empresa", response_model=EmpresaResponse)
async def get_mi_empresa(empresa: Empresa = Depends(get_current_empresa)):
    """La empresa del usuario autenticado."""
    return empresa


@router.put("/mi-empresa", response_model=EmpresaResponse)
async def update_mi_empresa(
    body: EmpresaUpdate,
    empresa: Empresa = Depends(get_current_empresa),
    _: Usuario = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Actualiza los datos de la propia empresa (solo admin de la empresa).

    La gestión de plataforma (plan, activar/suspender, borrar empresas) vive en
    `/api/platform/*`, no acá: son fronteras separadas.
    """
    for campo, valor in body.model_dump(exclude_unset=True).items():
        setattr(empresa, campo, valor)
    await db.flush()
    await db.refresh(empresa)
    return empresa
