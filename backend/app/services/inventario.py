from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inventario import (
    MotivoMovimiento,
    MovimientoInventario,
    ReservaStock,
    Stock,
    TipoMovimiento,
)


class StockInsuficiente(ValueError):
    pass


async def actualizar_stock(
    db: AsyncSession,
    empresa_id: int,
    sku_id: int,
    bodega_id: int,
    cantidad: float,
    tipo: TipoMovimiento,
    lote_id: int | None = None,
) -> Stock:
    delta = cantidad if tipo == TipoMovimiento.ENTRADA else -cantidad

    result = await db.execute(
        select(Stock).where(
            Stock.empresa_id == empresa_id,
            Stock.sku_id == sku_id,
            Stock.bodega_id == bodega_id,
            Stock.lote_id == lote_id,
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        existing.cantidad += delta
        stock = existing
    else:
        stock = Stock(
            empresa_id=empresa_id,
            sku_id=sku_id,
            bodega_id=bodega_id,
            lote_id=lote_id,
            cantidad=delta,
        )
        db.add(stock)
        await db.flush()

    return stock


async def validar_stock_disponible(
    db: AsyncSession,
    empresa_id: int,
    sku_id: int,
    bodega_id: int,
    cantidad: float,
    lote_id: int | None = None,
) -> float:
    stmt = select(func.coalesce(func.sum(Stock.cantidad), 0.0)).where(
        Stock.empresa_id == empresa_id,
        Stock.sku_id == sku_id,
        Stock.bodega_id == bodega_id,
    )
    if lote_id is not None:
        stmt = stmt.where(Stock.lote_id == lote_id)
    result = await db.execute(stmt)
    disponible = result.scalar() or 0.0

    reserva_stmt = select(func.coalesce(func.sum(ReservaStock.cantidad), 0.0)).where(
        ReservaStock.empresa_id == empresa_id,
        ReservaStock.sku_id == sku_id,
        ReservaStock.bodega_id == bodega_id,
    )
    if lote_id is not None:
        reserva_stmt = reserva_stmt.where(ReservaStock.lote_id == lote_id)
    result_r = await db.execute(reserva_stmt)
    reservado = result_r.scalar() or 0.0
    disponible -= reservado

    if disponible < cantidad:
        raise StockInsuficiente(
            f"Stock insuficiente: disponible={disponible}, solicitado={cantidad}"
        )

    return disponible


async def crear_transferencia(
    db: AsyncSession,
    empresa_id: int,
    sku_id: int,
    bodega_origen_id: int,
    bodega_destino_id: int,
    cantidad: float,
    costo_unitario: float,
    usuario_id: int | None = None,
    referencia: str | None = None,
    lote_id: int | None = None,
) -> tuple[MovimientoInventario, MovimientoInventario]:
    await validar_stock_disponible(db, empresa_id, sku_id, bodega_origen_id, cantidad, lote_id=lote_id)

    costo_total = round(cantidad * costo_unitario, 2)

    salida = MovimientoInventario(
        empresa_id=empresa_id,
        tipo=TipoMovimiento.SALIDA,
        motivo=MotivoMovimiento.TRANSFERENCIA_SALIDA,
        sku_id=sku_id,
        bodega_id=bodega_origen_id,
        lote_id=lote_id,
        cantidad=cantidad,
        costo_unitario=costo_unitario,
        costo_total=costo_total,
        referencia=referencia,
        usuario_id=usuario_id,
    )
    entrada = MovimientoInventario(
        empresa_id=empresa_id,
        tipo=TipoMovimiento.ENTRADA,
        motivo=MotivoMovimiento.TRANSFERENCIA_ENTRADA,
        sku_id=sku_id,
        bodega_id=bodega_destino_id,
        lote_id=lote_id,
        cantidad=cantidad,
        costo_unitario=costo_unitario,
        costo_total=costo_total,
        referencia=referencia,
        usuario_id=usuario_id,
    )

    db.add(salida)
    db.add(entrada)

    await actualizar_stock(db, empresa_id, sku_id, bodega_origen_id, cantidad, TipoMovimiento.SALIDA, lote_id=lote_id)
    await actualizar_stock(db, empresa_id, sku_id, bodega_destino_id, cantidad, TipoMovimiento.ENTRADA, lote_id=lote_id)

    return salida, entrada
