from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_empresa, require_admin, require_superadmin
from app.models.empresa import Empresa, Plan
from app.models.usuario import Usuario
from app.schemas.empresa import EmpresaResponse, EmpresaUpdate, PlanResponse

router = APIRouter(prefix="/api/empresas", tags=["empresas"])


@router.get("/planes", response_model=list[PlanResponse])
async def list_planes(db: AsyncSession = Depends(get_db)):
    """Planes disponibles. Público para poder mostrarlos en el onboarding."""
    result = await db.execute(select(Plan).where(Plan.activo).order_by(Plan.precio_mensual))
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
    """Actualiza los datos de la propia empresa (solo admin de la empresa)."""
    for campo, valor in body.model_dump(exclude_unset=True).items():
        setattr(empresa, campo, valor)
    await db.flush()
    await db.refresh(empresa)
    return empresa


# --- Endpoints de plataforma (superadmin del SaaS) ---


@router.get("", response_model=list[EmpresaResponse])
async def list_empresas(
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(require_superadmin),
):
    result = await db.execute(select(Empresa).order_by(Empresa.nombre))
    return result.scalars().all()


@router.put("/{empresa_id}", response_model=EmpresaResponse)
async def update_empresa(
    empresa_id: int,
    body: EmpresaUpdate,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(require_superadmin),
):
    empresa = await db.get(Empresa, empresa_id)
    if empresa is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa no encontrada")
    for campo, valor in body.model_dump(exclude_unset=True).items():
        setattr(empresa, campo, valor)
    await db.flush()
    await db.refresh(empresa)
    return empresa


@router.delete("/{empresa_id}")
async def delete_empresa(
    empresa_id: int,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(require_superadmin),
):
    empresa = await db.get(Empresa, empresa_id)
    if empresa is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa no encontrada")
    await db.delete(empresa)
    await db.flush()
    return {"message": "Empresa eliminada"}
