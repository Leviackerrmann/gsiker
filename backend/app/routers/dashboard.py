from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
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

PERIODOS = ("hoy", "semana", "mes")


def _ventanas(periodo: str, now: datetime):
    """Ventana actual y anterior (misma duración) para comparar y sacar trends.

    Devuelve (inicio, fin, inicio_prev, fin_prev, granularidad) donde granularidad
    es 'hour' para hoy y 'day' para semana/mes (define los buckets de la serie).
    """
    hoy0 = now.replace(hour=0, minute=0, second=0, microsecond=0)
    if periodo == "semana":
        inicio = hoy0 - timedelta(days=6)
        return inicio, now, inicio - timedelta(days=7), inicio, "day"
    if periodo == "mes":
        inicio = hoy0 - timedelta(days=29)
        return inicio, now, inicio - timedelta(days=30), inicio, "day"
    # hoy: se compara con la misma franja transcurrida de ayer.
    transcurrido = now - hoy0
    return hoy0, now, hoy0 - timedelta(days=1), hoy0 - timedelta(days=1) + transcurrido, "hour"


def _trend(cur: float, prev: float):
    """% de cambio vs período anterior. None si no hay base previa para comparar."""
    if prev == 0:
        return None
    return round((cur - prev) / prev * 100, 1)


async def _count_movs(db, empresa_id, desde, hasta):
    return (
        await db.execute(
            select(func.count()).select_from(MovimientoInventario).where(
                MovimientoInventario.empresa_id == empresa_id,
                MovimientoInventario.fecha >= desde,
                MovimientoInventario.fecha <= hasta,
            )
        )
    ).scalar() or 0


async def _count_skus_nuevos(db, empresa_id, desde, hasta):
    return (
        await db.execute(
            select(func.count()).select_from(SKU).where(
                SKU.empresa_id == empresa_id,
                SKU.fecha_creacion >= desde,
                SKU.fecha_creacion <= hasta,
            )
        )
    ).scalar() or 0


async def _count_oc_creadas(db, empresa_id, desde, hasta):
    return (
        await db.execute(
            select(func.count()).select_from(OrdenCompra).where(
                OrdenCompra.empresa_id == empresa_id,
                OrdenCompra.fecha_emision >= desde,
                OrdenCompra.fecha_emision <= hasta,
            )
        )
    ).scalar() or 0


@router.get("")
async def get_dashboard(
    periodo: str = Query("hoy"),
    db: AsyncSession = Depends(get_db),
    empresa: Empresa = Depends(get_current_empresa),
    current_user: Usuario = Depends(get_current_user),
):
    if periodo not in PERIODOS:
        periodo = "hoy"
    now = datetime.now(timezone.utc)
    inicio, fin, prev_inicio, prev_fin, gran = _ventanas(periodo, now)

    # --- Tarjetas snapshot (estado actual, no dependen del período) ---
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

    alertas_count = (
        await db.execute(
            select(func.count()).select_from(Stock).where(
                Stock.empresa_id == empresa.id,
                Stock.cantidad_minima.isnot(None) & (Stock.cantidad <= Stock.cantidad_minima),
            )
        )
    ).scalar() or 0

    oc_pendientes_count = (
        await db.execute(
            select(func.count()).select_from(OrdenCompra).where(
                OrdenCompra.empresa_id == empresa.id,
                OrdenCompra.estado.in_([EstadoOrden.PENDIENTE, EstadoOrden.PARCIAL]),
            )
        )
    ).scalar() or 0

    # --- Métricas del período + trend real vs período anterior ---
    movs_periodo = await _count_movs(db, empresa.id, inicio, fin)
    movs_prev = await _count_movs(db, empresa.id, prev_inicio, prev_fin)
    skus_nuevos = await _count_skus_nuevos(db, empresa.id, inicio, fin)
    skus_prev = await _count_skus_nuevos(db, empresa.id, prev_inicio, prev_fin)
    oc_creadas = await _count_oc_creadas(db, empresa.id, inicio, fin)
    oc_prev = await _count_oc_creadas(db, empresa.id, prev_inicio, prev_fin)

    # --- Serie temporal de movimientos (para la gráfica) ---
    fechas = (
        await db.execute(
            select(MovimientoInventario.fecha).where(
                MovimientoInventario.empresa_id == empresa.id,
                MovimientoInventario.fecha >= inicio,
                MovimientoInventario.fecha <= fin,
            )
        )
    ).scalars().all()
    serie = _serie_movimientos(fechas, inicio, now, gran)

    # --- Tablas ---
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
        "periodo": periodo,
        "generado_at": now.isoformat(),
        "sku_count": sku_count,
        "valor_stock": valor_stock_visible,
        "alertas_count": alertas_count,
        "oc_pendientes_count": oc_pendientes_count,
        "movs_periodo": movs_periodo,
        "movs_trend": _trend(movs_periodo, movs_prev),
        "skus_nuevos": skus_nuevos,
        "skus_trend": _trend(skus_nuevos, skus_prev),
        "oc_creadas": oc_creadas,
        "oc_trend": _trend(oc_creadas, oc_prev),
        "movimientos_serie": serie,
        "top_skus": top_skus,
        "stock_por_bodega": bodegas_chart,
    }


def _serie_movimientos(fechas, inicio: datetime, now: datetime, gran: str):
    """Agrupa las fechas en buckets (por hora si 'hour', por día si 'day') en Python.

    Se hace en Python para ser agnóstico al motor (los tests corren en SQLite, prod
    en Postgres) y evitar date_trunc.
    """
    conteos: dict[str, int] = {}
    for f in fechas:
        if f.tzinfo is None:
            f = f.replace(tzinfo=timezone.utc)
        clave = f.strftime("%Y%m%d%H") if gran == "hour" else f.strftime("%Y%m%d")
        conteos[clave] = conteos.get(clave, 0) + 1

    serie = []
    if gran == "hour":
        for h in range(now.hour + 1):
            b = inicio + timedelta(hours=h)
            serie.append({"label": b.strftime("%H:00"), "total": conteos.get(b.strftime("%Y%m%d%H"), 0)})
    else:
        dias = (now.replace(hour=0, minute=0, second=0, microsecond=0) - inicio).days + 1
        for d in range(dias):
            b = inicio + timedelta(days=d)
            serie.append({"label": b.strftime("%d/%m"), "total": conteos.get(b.strftime("%Y%m%d"), 0)})
    return serie
