from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inventario import MotivoMovimiento, MovimientoInventario, TipoMovimiento
from app.models.sku import SKU
from app.models.ventas import DespachoVenta, EstadoPedido, FacturaVenta, ItemDespacho, ItemPedidoVenta, PedidoVenta
from app.services.inventario import actualizar_stock, validar_stock_disponible


async def generar_numero_ov(db: AsyncSession, empresa_id: int) -> str:
    result = await db.execute(
        select(func.count()).select_from(PedidoVenta).where(PedidoVenta.empresa_id == empresa_id)
    )
    return f"OV-{(result.scalar() or 0) + 1:06d}"


async def generar_numero_factura(db: AsyncSession, empresa_id: int) -> str:
    result = await db.execute(
        select(func.count()).select_from(FacturaVenta).where(FacturaVenta.empresa_id == empresa_id)
    )
    return f"FAC-{(result.scalar() or 0) + 1:06d}"


async def procesar_despacho(
    db: AsyncSession,
    empresa_id: int,
    pedido_id: int,
    bodega_id: int,
    items_data: list[dict],
    iva_porcentaje: float = 12.0,
    usuario_id: int | None = None,
    nota: str | None = None,
):
    result = await db.execute(
        select(PedidoVenta).where(PedidoVenta.id == pedido_id, PedidoVenta.empresa_id == empresa_id)
    )
    pedido = result.scalar_one_or_none()
    if pedido is None:
        raise ValueError("Pedido no encontrado")
    if pedido.estado == EstadoPedido.CANCELADO:
        raise ValueError("Pedido cancelado")
    if pedido.estado == EstadoPedido.FACTURADO:
        raise ValueError("Pedido ya facturado")

    despacho = DespachoVenta(empresa_id=empresa_id, pedido_id=pedido_id, bodega_id=bodega_id, nota=nota, usuario_id=usuario_id)
    db.add(despacho)
    await db.flush()

    subtotal = 0.0
    total_despachado = 0
    total_solicitado = 0
    for it_data in items_data:
        item = (await db.execute(select(ItemPedidoVenta).where(ItemPedidoVenta.id == it_data["item_pedido_id"]))).scalar_one_or_none()
        if item is None or item.pedido_id != pedido_id:
            raise ValueError(f"Item {it_data['item_pedido_id']} inválido")
        cantidad = it_data["cantidad_despachada"]
        pendiente = item.cantidad_solicitada - item.cantidad_despachada
        if cantidad > pendiente:
            raise ValueError(f"Cantidad excede pendiente para item {item.id}")

        sku = (await db.execute(select(SKU).where(SKU.id == item.sku_id, SKU.empresa_id == empresa_id))).scalar_one()
        await validar_stock_disponible(db, empresa_id, item.sku_id, bodega_id, cantidad)

        db.add(ItemDespacho(despacho_id=despacho.id, item_pedido_id=item.id, cantidad_despachada=cantidad))
        item.cantidad_despachada += cantidad
        item.precio_total = item.cantidad_despachada * item.precio_unitario
        subtotal += cantidad * item.precio_unitario
        total_despachado += item.cantidad_despachada
        total_solicitado += item.cantidad_solicitada

        mov = MovimientoInventario(empresa_id=empresa_id, tipo=TipoMovimiento.SALIDA, motivo=MotivoMovimiento.VENTA, sku_id=item.sku_id, bodega_id=bodega_id, cantidad=cantidad, costo_unitario=sku.costo_unitario, costo_total=cantidad * sku.costo_unitario, referencia=f"Despacho OV {pedido.numero}", usuario_id=usuario_id)
        db.add(mov)
        await actualizar_stock(db, empresa_id, item.sku_id, bodega_id, cantidad, TipoMovimiento.SALIDA)

    await db.flush()
    pedido.subtotal = subtotal
    pedido.impuesto_total = round(subtotal * iva_porcentaje / 100, 2)
    pedido.total = round(subtotal + pedido.impuesto_total, 2)

    if total_despachado >= total_solicitado:
        pedido.estado = EstadoPedido.DESPACHADO
    elif total_despachado > 0:
        pedido.estado = EstadoPedido.PARCIAL
    return despacho


async def generar_factura(
    db: AsyncSession,
    empresa_id: int,
    pedido_id: int,
    iva_porcentaje: float = 12.0,
    usuario_id: int | None = None,
) -> FacturaVenta:
    result = await db.execute(
        select(PedidoVenta).where(PedidoVenta.id == pedido_id, PedidoVenta.empresa_id == empresa_id)
    )
    pedido = result.scalar_one_or_none()
    if pedido is None:
        raise ValueError("Pedido no encontrado")
    if pedido.estado == EstadoPedido.FACTURADO:
        raise ValueError("Ya facturado")
    if pedido.estado == EstadoPedido.CANCELADO:
        raise ValueError("Pedido cancelado")

    numero = await generar_numero_factura(db, empresa_id)
    factura = FacturaVenta(
        empresa_id=empresa_id,
        numero=numero,
        pedido_id=pedido_id,
        cliente_id=pedido.cliente_id,
        moneda=pedido.moneda,
        tipo_cambio=pedido.tipo_cambio,
        subtotal=pedido.subtotal,
        impuesto_porcentaje=iva_porcentaje,
        impuesto_total=pedido.impuesto_total,
        total=pedido.total,
        usuario_id=usuario_id,
    )
    db.add(factura)
    pedido.estado = EstadoPedido.FACTURADO
    await db.flush()
    return factura
