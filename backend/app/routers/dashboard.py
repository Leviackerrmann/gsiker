from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_empresa, get_current_user
from app.models.compras import EstadoOrden, OrdenCompra
from app.models.empresa import Empresa
from app.models.inventario import Bodega, MovimientoInventario, Stock
from app.models.sku import SKU
from app.models.usuario import RolUsuario, Usuario

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("")
async def get_dashboard(
    db: AsyncSession = Depends(get_db),
    empresa: Empresa = Depends(get_current_empresa),
    current_user: Usuario = Depends(get_current_user),
):
    hoy = datetime.now(timezone.utc)

    sku_count = (
        await db.execute(select(func.count()).select_from(SKU).where(SKU.empresa_id == empresa.id))
    ).scalar() or 0

    valor_stock = (
        await db.execute(
            select(func.coalesce(func.sum(Stock.cantidad * SKU.costo_unitario), 0.0))
            .join(SKU, Stock.sku_id == SKU.id)
            .where(Stock.empresa_id == empresa.id)
        )
    ).scalar() or 0.0

    alertas = await db.execute(
        select(func.count()).select_from(Stock).where(
            Stock.empresa_id == empresa.id,
            Stock.cantidad_minima.isnot(None) & (Stock.cantidad <= Stock.cantidad_minima),
        )
    )
    alertas_count = alertas.scalar() or 0

    oc_pendientes = await db.execute(
        select(func.count()).select_from(OrdenCompra).where(
            OrdenCompra.empresa_id == empresa.id,
            OrdenCompra.estado.in_([EstadoOrden.PENDIENTE, EstadoOrden.PARCIAL]),
        )
    )
    oc_pendientes_count = oc_pendientes.scalar() or 0

    movs_hoy = await db.execute(
        select(func.count()).select_from(MovimientoInventario).where(
            MovimientoInventario.empresa_id == empresa.id,
            MovimientoInventario.fecha >= hoy.replace(hour=0, minute=0, second=0),
        )
    )
    movs_hoy_count = movs_hoy.scalar() or 0

    top_sku = await db.execute(
        select(SKU.codigo_sku, SKU.descripcion, func.sum(Stock.cantidad).label("total"))
        .join(Stock, Stock.sku_id == SKU.id)
        .where(SKU.empresa_id == empresa.id)
        .group_by(SKU.id)
        .order_by(func.sum(Stock.cantidad).desc())
        .limit(5)
    )
    top_skus = [{"codigo": r.codigo_sku, "descripcion": r.descripcion, "cantidad": float(r.total)} for r in top_sku.all()]

    stock_por_bodega = await db.execute(
        select(Bodega.nombre, func.sum(Stock.cantidad).label("total"))
        .join(Stock, Stock.bodega_id == Bodega.id)
        .where(Bodega.empresa_id == empresa.id)
        .group_by(Bodega.id, Bodega.nombre)
        .order_by(Bodega.nombre)
    )
    bodegas_chart = [{"bodega": r.nombre, "total": float(r.total)} for r in stock_por_bodega.all()]

    # El valor del inventario (a costo) es dato sensible: se oculta a operadores.
    valor_stock_visible = round(valor_stock, 2) if current_user.rol == RolUsuario.ADMIN else None

    return {
        "sku_count": sku_count,
        "valor_stock": valor_stock_visible,
        "alertas_count": alertas_count,
        "oc_pendientes_count": oc_pendientes_count,
        "movs_hoy_count": movs_hoy_count,
        "top_skus": top_skus,
        "stock_por_bodega": bodegas_chart,
    }
