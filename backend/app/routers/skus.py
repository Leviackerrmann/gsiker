from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_empresa, get_current_user, require_admin
from app.models.empresa import Empresa
from app.models.sku import SKU
from app.models.usuario import RolUsuario, Usuario
from app.schemas.sku import SKUCreate, SKUResponse, SKUUpdate

router = APIRouter(prefix="/api/skus", tags=["skus"])


def _sku_out(sku: SKU, user: Usuario) -> SKUResponse:
    """Serializa un SKU ocultando el costo a operadores (dato sensible: márgenes)."""
    out = SKUResponse.model_validate(sku)
    if user.rol != RolUsuario.ADMIN:
        out.costo_unitario = None
    return out


@router.get("", response_model=list[SKUResponse])
async def list_skus(
    q: str | None = Query(None, description="Buscar por código o descripción"),
    categoria: str | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    empresa: Empresa = Depends(get_current_empresa),
    current_user: Usuario = Depends(get_current_user),
):
    stmt = select(SKU).where(SKU.empresa_id == empresa.id)

    if q:
        stmt = stmt.where(
            (SKU.codigo_sku.ilike(f"%{q}%")) | (SKU.descripcion.ilike(f"%{q}%"))
        )
    if categoria:
        stmt = stmt.where(SKU.categoria == categoria)

    stmt = stmt.order_by(SKU.codigo_sku).offset(skip).limit(limit)
    result = await db.execute(stmt)
    return [_sku_out(s, current_user) for s in result.scalars().all()]


@router.get("/categorias")
async def list_categorias(
    db: AsyncSession = Depends(get_db),
    empresa: Empresa = Depends(get_current_empresa),
):
    result = await db.execute(
        select(SKU.categoria)
        .where(SKU.empresa_id == empresa.id, SKU.categoria.isnot(None))
        .distinct()
        .order_by(SKU.categoria)
    )
    return [row[0] for row in result.all() if row[0]]


@router.get("/{sku_id}", response_model=SKUResponse)
async def get_sku(
    sku_id: int,
    db: AsyncSession = Depends(get_db),
    empresa: Empresa = Depends(get_current_empresa),
    current_user: Usuario = Depends(get_current_user),
):
    result = await db.execute(
        select(SKU).where(SKU.id == sku_id, SKU.empresa_id == empresa.id)
    )
    sku = result.scalar_one_or_none()
    if sku is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SKU no encontrado")
    return _sku_out(sku, current_user)


@router.post("", response_model=SKUResponse, status_code=status.HTTP_201_CREATED)
async def create_sku(
    body: SKUCreate,
    db: AsyncSession = Depends(get_db),
    empresa: Empresa = Depends(get_current_empresa),
    _=Depends(require_admin),
):
    codigo = body.codigo_sku.strip().upper()
    if codigo.endswith("-") and body.categoria:
        prefix = codigo
        result = await db.execute(
            select(func.count())
            .select_from(SKU)
            .where(SKU.empresa_id == empresa.id, SKU.codigo_sku.like(f"{prefix}%"))
        )
        count = result.scalar() or 0
        codigo = f"{prefix}{count + 1:05d}"

    existing = await db.execute(
        select(SKU).where(SKU.empresa_id == empresa.id, SKU.codigo_sku == codigo)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El código SKU ya existe")

    sku_data = body.model_dump()
    sku_data["codigo_sku"] = codigo
    sku = SKU(**sku_data, empresa_id=empresa.id)
    db.add(sku)
    await db.flush()
    await db.refresh(sku)
    return sku


@router.put("/{sku_id}", response_model=SKUResponse)
async def update_sku(
    sku_id: int,
    body: SKUUpdate,
    db: AsyncSession = Depends(get_db),
    empresa: Empresa = Depends(get_current_empresa),
    _=Depends(require_admin),
):
    result = await db.execute(
        select(SKU).where(SKU.id == sku_id, SKU.empresa_id == empresa.id)
    )
    sku = result.scalar_one_or_none()
    if sku is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SKU no encontrado")

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(sku, key, value)

    await db.flush()
    await db.refresh(sku)
    return sku


@router.post("/importar")
async def importar_skus(
    body: dict,
    db: AsyncSession = Depends(get_db),
    empresa: Empresa = Depends(get_current_empresa),
    _=Depends(require_admin),
):
    items = body.get("items", [])
    creados = 0
    errores = []
    for it in items:
        codigo = it.get("codigo_sku", "").strip().upper()
        if not codigo:
            errores.append({"fila": it, "error": "código SKU vacío"})
            continue
        existing = await db.execute(
            select(SKU).where(SKU.empresa_id == empresa.id, SKU.codigo_sku == codigo)
        )
        if existing.scalar_one_or_none():
            errores.append({"fila": codigo, "error": "ya existe"})
            continue
        sku = SKU(
            empresa_id=empresa.id,
            codigo_sku=codigo,
            descripcion=it.get("descripcion", ""),
            unidad_medida=it.get("unidad_medida", "UNIDAD"),
            costo_unitario=float(it.get("costo_unitario", 0)),
            precio_referencia=float(it.get("precio_referencia", 0)),
            categoria=it.get("categoria"),
            subcategoria=it.get("subcategoria"),
            maneja_lotes=bool(it.get("maneja_lotes", False)),
        )
        db.add(sku)
        creados += 1
    await db.flush()
    return {"message": f"{creados} SKUs creados", "errores": errores}
