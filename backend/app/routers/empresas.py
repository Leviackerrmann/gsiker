from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_admin
from app.models.empresa import Empresa
from app.schemas.empresa import EmpresaCreate, EmpresaResponse, EmpresaUpdate

router = APIRouter(prefix="/api/empresas", tags=["empresas"])


@router.get("", response_model=list[EmpresaResponse])
async def list_empresas(
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
):
    result = await db.execute(select(Empresa).order_by(Empresa.nombre))
    return result.scalars().all()


@router.post("", response_model=EmpresaResponse, status_code=status.HTTP_201_CREATED)
async def create_empresa(
    body: EmpresaCreate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_admin),
):
    existing = await db.execute(select(Empresa).where(Empresa.nombre == body.nombre))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La empresa ya existe")

    empresa = Empresa(nombre=body.nombre)
    db.add(empresa)
    await db.flush()
    await db.refresh(empresa)
    return empresa


@router.put("/{empresa_id}", response_model=EmpresaResponse)
async def update_empresa(
    empresa_id: int,
    body: EmpresaUpdate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_admin),
):
    result = await db.execute(select(Empresa).where(Empresa.id == empresa_id))
    empresa = result.scalar_one_or_none()
    if empresa is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa no encontrada")

    if body.nombre is not None:
        empresa.nombre = body.nombre
    if body.activa is not None:
        empresa.activa = body.activa

    await db.flush()
    await db.refresh(empresa)
    return empresa


@router.delete("/{empresa_id}")
async def delete_empresa(
    empresa_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_admin),
):
    result = await db.execute(select(Empresa).where(Empresa.id == empresa_id))
    empresa = result.scalar_one_or_none()
    if empresa is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa no encontrada")

    await db.delete(empresa)
    await db.flush()
    return {"message": "Empresa eliminada"}
