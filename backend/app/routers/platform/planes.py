import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_platform_admin
from app.models.empresa import IntervaloPlan, Plan
from app.models.platform_admin import PlatformAdmin
from app.schemas.empresa import PlanResponse
from app.services.limites import LimitesPlan

router = APIRouter(prefix="/api/platform/planes", tags=["platform-planes"])


def _validar_limites(limites: dict) -> dict:
    """Valida la estructura de límites (no se persiste JSON arbitrario)."""
    try:
        return LimitesPlan(**limites).model_dump()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Límites inválidos: {exc}")


class PlanCreate(BaseModel):
    nombre: str
    descripcion: str | None = None
    precio: float = 0
    moneda: str = "GTQ"
    intervalo: IntervaloPlan = IntervaloPlan.MENSUAL
    limites: dict
    es_personalizado: bool = False
    empresa_id: int | None = None
    codigo: str | None = None

    @field_validator("precio")
    @classmethod
    def _precio_no_negativo(cls, v):
        if v < 0:
            raise ValueError("El precio no puede ser negativo")
        return v


class PlanUpdate(BaseModel):
    nombre: str | None = None
    descripcion: str | None = None
    precio: float | None = None
    moneda: str | None = None
    intervalo: IntervaloPlan | None = None
    limites: dict | None = None
    activo: bool | None = None


@router.get("", response_model=list[PlanResponse])
async def listar_planes(
    db: AsyncSession = Depends(get_db), _: PlatformAdmin = Depends(get_platform_admin)
):
    res = await db.execute(select(Plan).order_by(Plan.es_personalizado, Plan.precio))
    return res.scalars().all()


@router.post("", response_model=PlanResponse, status_code=status.HTTP_201_CREATED)
async def crear_plan(
    body: PlanCreate,
    db: AsyncSession = Depends(get_db),
    _: PlatformAdmin = Depends(get_platform_admin),
):
    limites = _validar_limites(body.limites)
    codigo = body.codigo
    if not codigo:
        # Para personalizados generamos un código único (evita colisión en un 2º
        # plan a medida de la misma empresa).
        base = f"custom-{body.empresa_id}" if body.es_personalizado and body.empresa_id else "plan"
        codigo = f"{base}-{secrets.token_hex(3)}"
    dup = await db.execute(select(Plan).where(Plan.codigo == codigo))
    if dup.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El código ya existe")
    plan = Plan(
        codigo=codigo, nombre=body.nombre, descripcion=body.descripcion, precio=body.precio,
        moneda=body.moneda, intervalo=body.intervalo, limites=limites,
        es_personalizado=body.es_personalizado, empresa_id=body.empresa_id,
    )
    db.add(plan)
    await db.flush()
    await db.refresh(plan)
    return plan


@router.put("/{plan_id}", response_model=PlanResponse)
async def actualizar_plan(
    plan_id: int,
    body: PlanUpdate,
    db: AsyncSession = Depends(get_db),
    _: PlatformAdmin = Depends(get_platform_admin),
):
    plan = await db.get(Plan, plan_id)
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan no encontrado")
    datos = body.model_dump(exclude_unset=True)
    if "limites" in datos and datos["limites"] is not None:
        datos["limites"] = _validar_limites(datos["limites"])
    for campo, valor in datos.items():
        setattr(plan, campo, valor)
    await db.flush()
    await db.refresh(plan)
    return plan
