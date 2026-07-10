from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inventario import MovimientoInventario, ReservaStock, Stock, TipoMovimiento
from app.models.sku import SKU
from app.services.inventario import StockInsuficiente


async def calcular_pmp_entrada(
    db: AsyncSession,
    sku: SKU,
    cantidad_entrada: float,
    costo_entrada: float,
) -> float:
    if sku.metodo_valorizacion != "PMP":
        return sku.costo_unitario

    result = await db.execute(
        select(Stock).where(Stock.sku_id == sku.id)
    )
    stocks = result.scalars().all()
    total_stock = sum(s.cantidad for s in stocks)
    costo_actual = sku.costo_unitario

    if total_stock + cantidad_entrada == 0:
        return costo_entrada

    nuevo_costo = (
        (total_stock * costo_actual + cantidad_entrada * costo_entrada)
        / (total_stock + cantidad_entrada)
    )
    return round(nuevo_costo, 4)


async def validar_stock_disponible(
    db: AsyncSession,
    sku_id: int,
    bodega_id: int,
    cantidad: float,
) -> float:
    from sqlalchemy import func

    result = await db.execute(
        select(Stock).where(Stock.sku_id == sku_id, Stock.bodega_id == bodega_id)
    )
    stock = result.scalar_one_or_none()
    disponible = stock.cantidad if stock else 0.0

    result_r = await db.execute(
        select(func.coalesce(func.sum(ReservaStock.cantidad), 0.0)).where(
            ReservaStock.sku_id == sku_id,
            ReservaStock.bodega_id == bodega_id,
        )
    )
    reservado = result_r.scalar() or 0.0
    disponible -= reservado

    if disponible < cantidad:
        raise StockInsuficiente(
            f"Stock insuficiente: disponible={disponible}, solicitado={cantidad}"
        )

    return disponible


async def generar_kardex(
    db: AsyncSession,
    sku_id: int,
    fecha_desde: str | None = None,
    fecha_hasta: str | None = None,
) -> list[dict]:
    stmt = (
        select(MovimientoInventario)
        .where(MovimientoInventario.sku_id == sku_id)
    )
    if fecha_desde:
        stmt = stmt.where(MovimientoInventario.fecha >= datetime.fromisoformat(fecha_desde))
    if fecha_hasta:
        stmt = stmt.where(MovimientoInventario.fecha <= datetime.fromisoformat(fecha_hasta))

    stmt = stmt.order_by(MovimientoInventario.fecha.asc(), MovimientoInventario.id.asc())
    result = await db.execute(stmt)
    movimientos = result.scalars().all()

    items = []
    saldo_cantidad = 0.0
    saldo_costo = 0.0

    for m in movimientos:
        entrada_cantidad = m.cantidad if m.tipo == TipoMovimiento.ENTRADA else 0.0
        entrada_costo = m.costo_total if m.tipo == TipoMovimiento.ENTRADA else 0.0
        salida_cantidad = m.cantidad if m.tipo == TipoMovimiento.SALIDA else 0.0
        salida_costo = m.costo_total if m.tipo == TipoMovimiento.SALIDA else 0.0

        if m.tipo == TipoMovimiento.ENTRADA:
            saldo_cantidad += m.cantidad
            saldo_costo += m.costo_total
        else:
            saldo_cantidad -= m.cantidad
            saldo_costo -= m.costo_total

        costo_unitario = round(saldo_costo / saldo_cantidad, 4) if saldo_cantidad > 0 else 0.0

        items.append({
            "fecha": m.fecha,
            "tipo": m.tipo.value,
            "motivo": m.motivo.value if m.motivo else None,
            "referencia": m.referencia,
            "entrada_cantidad": entrada_cantidad,
            "entrada_costo": entrada_costo,
            "salida_cantidad": salida_cantidad,
            "salida_costo": salida_costo,
            "saldo_cantidad": saldo_cantidad,
            "saldo_costo": saldo_costo,
            "costo_unitario": costo_unitario,
        })

    return items
