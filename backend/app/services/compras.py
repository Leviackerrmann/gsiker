from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.compras import (
    EstadoOrden,
    ItemOrdenCompra,
    OrdenCompra,
    RecepcionCompra,
)
from app.models.inventario import MotivoMovimiento, MovimientoInventario, TipoMovimiento
from app.models.sku import SKU
from app.services.inventario import actualizar_stock
from app.services.valorizacion import calcular_pmp_entrada


async def generar_numero_oc(db: AsyncSession, empresa_id: int) -> str:
    result = await db.execute(
        select(func.count()).select_from(OrdenCompra).where(OrdenCompra.empresa_id == empresa_id)
    )
    count = result.scalar() or 0
    return f"OC-{count + 1:06d}"


async def procesar_recepcion(
    db: AsyncSession,
    empresa_id: int,
    orden_id: int,
    bodega_id: int,
    items_recibidos: list[dict],
    usuario_id: int | None = None,
    nota: str | None = None,
) -> RecepcionCompra:
    result = await db.execute(
        select(OrdenCompra).where(OrdenCompra.id == orden_id, OrdenCompra.empresa_id == empresa_id)
    )
    orden = result.scalar_one_or_none()
    if orden is None:
        raise ValueError("Orden no encontrada")
    if orden.estado == EstadoOrden.CANCELADA:
        raise ValueError("No se puede recibir una orden cancelada")

    recepcion = RecepcionCompra(
        empresa_id=empresa_id,
        orden_id=orden_id,
        nota=nota,
        usuario_id=usuario_id,
    )
    db.add(recepcion)

    total_recibido = 0
    total_solicitado = 0

    for item_data in items_recibidos:
        item_result = await db.execute(
            select(ItemOrdenCompra).where(ItemOrdenCompra.id == item_data["item_orden_id"])
        )
        item = item_result.scalar_one_or_none()
        if item is None:
            raise ValueError(f"Item de orden {item_data['item_orden_id']} no encontrado")
        if item.orden_id != orden_id:
            raise ValueError(f"Item no pertenece a esta orden")

        cantidad = item_data["cantidad_recibida"]
        pendiente = item.cantidad_solicitada - item.cantidad_recibida
        if cantidad > pendiente:
            raise ValueError(
                f"Cantidad excede pendiente para SKU {item.sku_id}: pendiente={pendiente}"
            )

        from app.models.compras import ItemRecepcion

        ir = ItemRecepcion(
            recepcion_id=recepcion.id,
            item_orden_id=item.id,
            cantidad_recibida=cantidad,
        )
        db.add(ir)

        item.cantidad_recibida += cantidad
        item.costo_total = item.cantidad_recibida * item.costo_unitario
        total_recibido += item.cantidad_recibida
        total_solicitado += item.cantidad_solicitada

        sku_result = await db.execute(
            select(SKU).where(SKU.id == item.sku_id, SKU.empresa_id == empresa_id)
        )
        sku = sku_result.scalar_one()

        # El costo de la OC está en la moneda del documento; el inventario/kardex
        # se valoriza en la moneda base (GTQ), así que se convierte con el tipo de cambio.
        costo_gtq = round(item.costo_unitario * orden.tipo_cambio, 4)

        movimiento = MovimientoInventario(
            empresa_id=empresa_id,
            tipo=TipoMovimiento.ENTRADA,
            motivo=MotivoMovimiento.COMPRA,
            sku_id=item.sku_id,
            bodega_id=bodega_id,
            cantidad=cantidad,
            costo_unitario=costo_gtq,
            costo_total=round(cantidad * costo_gtq, 2),
            referencia=f"Recepción OC {orden.numero_oc}",
            usuario_id=usuario_id,
        )
        db.add(movimiento)

        sku.costo_unitario = await calcular_pmp_entrada(db, sku, cantidad, costo_gtq)
        await actualizar_stock(db, empresa_id, item.sku_id, bodega_id, cantidad, TipoMovimiento.ENTRADA)

    if total_recibido >= total_solicitado:
        orden.estado = EstadoOrden.COMPLETA
    elif total_recibido > 0:
        orden.estado = EstadoOrden.PARCIAL

    return recepcion
