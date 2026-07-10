from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.inventario import Stock, MovimientoInventario, Bodega
from app.models.sku import SKU
from app.models.compras import OrdenCompra, EstadoOrden
from datetime import datetime, timezone, timedelta

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("")
async def get_dashboard(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    hoy = datetime.now(timezone.utc)
    inicio_mes = hoy.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    sku_count = (await db.execute(select(func.count()).select_from(SKU))).scalar() or 0

    valor_stock = (
        await db.execute(
            select(func.coalesce(func.sum(Stock.cantidad * SKU.costo_unitario), 0.0))
            .join(SKU, Stock.sku_id == SKU.id)
        )
    ).scalar() or 0.0

    stock_j = select(Stock, Bodega, SKU).join(Bodega).join(SKU)

    alertas = await db.execute(
        select(func.count()).select_from(Stock).where(
            (Stock.cantidad_minima.isnot(None) & (Stock.cantidad <= Stock.cantidad_minima))
        )
    )
    alertas_count = alertas.scalar() or 0

    oc_pendientes = await db.execute(
        select(func.count()).select_from(OrdenCompra).where(
            OrdenCompra.estado.in_([EstadoOrden.PENDIENTE, EstadoOrden.PARCIAL])
        )
    )
    oc_pendientes_count = oc_pendientes.scalar() or 0

    movs_hoy = await db.execute(
        select(func.count()).select_from(MovimientoInventario).where(
            MovimientoInventario.fecha >= hoy.replace(hour=0, minute=0, second=0)
        )
    )
    movs_hoy_count = movs_hoy.scalar() or 0

    top_sku = await db.execute(
        select(SKU.codigo_sku, SKU.descripcion, func.sum(Stock.cantidad).label("total"))
        .join(Stock, Stock.sku_id == SKU.id)
        .group_by(SKU.id)
        .order_by(func.sum(Stock.cantidad).desc())
        .limit(5)
    )
    top_skus = [{"codigo": r.codigo_sku, "descripcion": r.descripcion, "cantidad": float(r.total)} for r in top_sku.all()]

    stock_por_bodega = await db.execute(
        select(Bodega.nombre, func.sum(Stock.cantidad).label("total"))
        .join(Stock, Stock.bodega_id == Bodega.id)
        .group_by(Bodega.id, Bodega.nombre)
        .order_by(Bodega.nombre)
    )
    bodegas_chart = [{"bodega": r.nombre, "total": float(r.total)} for r in stock_por_bodega.all()]

    return {
        "sku_count": sku_count,
        "valor_stock": round(valor_stock, 2),
        "alertas_count": alertas_count,
        "oc_pendientes_count": oc_pendientes_count,
        "movs_hoy_count": movs_hoy_count,
        "top_skus": top_skus,
        "stock_por_bodega": bodegas_chart,
    }
