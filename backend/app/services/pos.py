from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inventario import Bodega, MotivoMovimiento, MovimientoInventario, TipoMovimiento
from app.models.pos import (
    CajaSesion,
    EstadoCajaSesion,
    EstadoVentaPOS,
    ItemVentaPOS,
    MetodoPago,
    Pago,
    VentaPOS,
)
from app.models.cobranza import OrigenCxC
from app.models.sku import SKU
from app.services.cobranza import crear_cuenta
from app.services.inventario import actualizar_stock, validar_stock_disponible

# Tolerancia para comparar montos en centavos (evita ruido de coma flotante).
_EPS = 0.005


class POSError(ValueError):
    """Error de negocio del POS (se traduce a HTTP 400)."""


async def generar_numero_venta_pos(db: AsyncSession, empresa_id: int) -> str:
    """Siguiente correlativo POS. Se basa en el máximo existente (no en count),
    para no chocar si hay huecos por ventas borradas. El constraint único
    (empresa_id, numero) es el respaldo final ante colisiones."""
    result = await db.execute(
        select(func.max(VentaPOS.numero)).where(VentaPOS.empresa_id == empresa_id)
    )
    ultimo = result.scalar()
    siguiente = (int(ultimo.split("-")[1]) + 1) if ultimo else 1
    return f"POS-{siguiente:06d}"


async def caja_abierta_de_usuario(db: AsyncSession, empresa_id: int, usuario_id: int) -> CajaSesion | None:
    result = await db.execute(
        select(CajaSesion).where(
            CajaSesion.empresa_id == empresa_id,
            CajaSesion.usuario_id == usuario_id,
            CajaSesion.estado == EstadoCajaSesion.ABIERTA,
        )
    )
    return result.scalar_one_or_none()


async def abrir_caja(db: AsyncSession, empresa_id: int, usuario_id: int, monto_inicial: float) -> CajaSesion:
    if monto_inicial < 0:
        raise POSError("El monto inicial no puede ser negativo")
    if await caja_abierta_de_usuario(db, empresa_id, usuario_id) is not None:
        raise POSError("Ya tienes una caja abierta; ciérrala antes de abrir otra")

    sesion = CajaSesion(empresa_id=empresa_id, usuario_id=usuario_id, monto_inicial=monto_inicial)
    db.add(sesion)
    await db.flush()
    return sesion


async def _efectivo_de_sesion(db: AsyncSession, empresa_id: int, sesion_id: int) -> float:
    """Suma del efectivo aplicado en ventas COMPLETADAS de la sesión."""
    result = await db.execute(
        select(func.coalesce(func.sum(Pago.monto), 0.0))
        .join(VentaPOS, Pago.venta_pos_id == VentaPOS.id)
        .where(
            VentaPOS.empresa_id == empresa_id,
            VentaPOS.caja_sesion_id == sesion_id,
            VentaPOS.estado == EstadoVentaPOS.COMPLETADA,
            Pago.metodo == MetodoPago.EFECTIVO,
        )
    )
    return round(result.scalar() or 0.0, 2)


async def cerrar_caja(
    db: AsyncSession, empresa_id: int, sesion_id: int, monto_final_declarado: float
) -> CajaSesion:
    sesion = await db.get(CajaSesion, sesion_id)
    if sesion is None or sesion.empresa_id != empresa_id:
        raise POSError("Sesión de caja no encontrada")
    if sesion.estado == EstadoCajaSesion.CERRADA:
        raise POSError("La caja ya está cerrada")

    efectivo_ventas = await _efectivo_de_sesion(db, empresa_id, sesion_id)
    esperado = round(sesion.monto_inicial + efectivo_ventas, 2)

    sesion.monto_esperado = esperado
    sesion.monto_final_declarado = round(monto_final_declarado, 2)
    sesion.diferencia = round(monto_final_declarado - esperado, 2)
    sesion.estado = EstadoCajaSesion.CERRADA
    sesion.fecha_cierre = datetime.now(timezone.utc)
    await db.flush()
    return sesion


async def procesar_venta_pos(
    db: AsyncSession,
    empresa_id: int,
    iva_porcentaje: float,
    caja_sesion_id: int,
    bodega_id: int,
    items_data: list[dict],
    pagos_data: list[dict],
    cliente_id: int | None = None,
    usuario_id: int | None = None,
    a_credito: bool = False,
    idempotency_key: str | None = None,
) -> VentaPOS:
    """Venta rápida de mostrador: descuenta stock, calcula el desglose de IVA
    (incluido en el precio) y registra los pagos. Todo en una transacción.

    Si `a_credito`, los pagos pueden no cubrir el total: el saldo queda como
    **cuenta por cobrar** (fiado) del cliente. Requiere `cliente_id`.

    Si `idempotency_key` viene y ya existe una venta con esa clave (doble-clic o
    reintento), se devuelve la venta existente sin crear una duplicada."""
    if not items_data:
        raise POSError("La venta no tiene productos")
    if a_credito and cliente_id is None:
        raise POSError("Una venta al crédito (fiado) requiere un cliente")

    # Idempotencia: si ya procesamos esta clave, devolvemos la venta previa.
    if idempotency_key:
        existente = (
            await db.execute(
                select(VentaPOS).where(
                    VentaPOS.empresa_id == empresa_id,
                    VentaPOS.idempotency_key == idempotency_key,
                )
            )
        ).scalar_one_or_none()
        if existente is not None:
            return existente

    # Caja: debe existir, ser de esta empresa y estar abierta.
    sesion = await db.get(CajaSesion, caja_sesion_id)
    if sesion is None or sesion.empresa_id != empresa_id:
        raise POSError("Sesión de caja no encontrada")
    if sesion.estado != EstadoCajaSesion.ABIERTA:
        raise POSError("La caja está cerrada; abre una nueva para vender")

    # Bodega: existe, de esta empresa y activa.
    bodega = await db.get(Bodega, bodega_id)
    if bodega is None or bodega.empresa_id != empresa_id or not bodega.activa:
        raise POSError("Bodega no encontrada o inactiva")

    numero = await generar_numero_venta_pos(db, empresa_id)
    venta = VentaPOS(
        empresa_id=empresa_id,
        numero=numero,
        caja_sesion_id=caja_sesion_id,
        bodega_id=bodega_id,
        cliente_id=cliente_id,
        impuesto_porcentaje=iva_porcentaje,
        usuario_id=usuario_id,
        idempotency_key=idempotency_key,
    )
    db.add(venta)
    await db.flush()

    total = 0.0
    for it in items_data:
        sku = (
            await db.execute(select(SKU).where(SKU.id == it["sku_id"], SKU.empresa_id == empresa_id))
        ).scalar_one_or_none()
        if sku is None:
            raise POSError(f"SKU {it['sku_id']} no encontrado")

        cantidad = float(it["cantidad"])
        if cantidad <= 0:
            raise POSError("La cantidad debe ser mayor que cero")

        # Precio final (IVA incluido): el enviado o el de referencia del SKU.
        precio = it.get("precio_unitario")
        precio = float(precio) if precio is not None else sku.precio_referencia
        precio_total = round(precio * cantidad, 2)
        total += precio_total

        await validar_stock_disponible(db, empresa_id, sku.id, bodega_id, cantidad)

        db.add(
            ItemVentaPOS(
                venta_pos_id=venta.id,
                sku_id=sku.id,
                cantidad=cantidad,
                precio_unitario=precio,
                precio_total=precio_total,
            )
        )
        db.add(
            MovimientoInventario(
                empresa_id=empresa_id,
                tipo=TipoMovimiento.SALIDA,
                motivo=MotivoMovimiento.VENTA,
                sku_id=sku.id,
                bodega_id=bodega_id,
                cantidad=cantidad,
                costo_unitario=sku.costo_unitario,
                costo_total=round(cantidad * sku.costo_unitario, 2),
                referencia=f"Venta POS {numero}",
                usuario_id=usuario_id,
            )
        )
        await actualizar_stock(db, empresa_id, sku.id, bodega_id, cantidad, TipoMovimiento.SALIDA)

    total = round(total, 2)
    # IVA incluido: se extrae del total, no se suma encima.
    impuesto_total = round(total - total / (1 + iva_porcentaje / 100), 2)
    subtotal = round(total - impuesto_total, 2)

    suma_pagos = _registrar_pagos(db, venta, empresa_id, pagos_data, usuario_id)

    if a_credito:
        if suma_pagos > total + _EPS:
            raise POSError(f"Los pagos ({suma_pagos}) exceden el total ({total})")
        saldo = round(total - suma_pagos, 2)
        if saldo > _EPS:
            assert cliente_id is not None  # garantizado por la validación de arriba
            await crear_cuenta(
                db,
                empresa_id,
                cliente_id=cliente_id,
                monto_total=saldo,
                concepto=f"Venta POS {numero}",
                origen=OrigenCxC.VENTA_POS,
                origen_id=venta.id,
                usuario_id=usuario_id,
            )
    else:
        if not pagos_data:
            raise POSError("La venta no tiene pagos")
        if abs(suma_pagos - total) > _EPS:
            raise POSError(f"Los pagos ({suma_pagos}) no cubren el total ({total})")

    venta.subtotal = subtotal
    venta.impuesto_total = impuesto_total
    venta.total = total
    await db.flush()
    return venta


def _registrar_pagos(
    db: AsyncSession,
    venta: VentaPOS,
    empresa_id: int,
    pagos_data: list[dict],
    usuario_id: int | None,
) -> float:
    """Registra los pagos de la venta y devuelve la suma. No valida que cubran
    el total: eso lo decide el llamador (contado exige exacto; crédito permite
    saldo). Una lista vacía es válida (venta 100% al fiado)."""
    suma = 0.0
    for p in pagos_data:
        try:
            metodo = MetodoPago(p["metodo"])
        except ValueError:
            raise POSError(f"Método de pago inválido: {p.get('metodo')}")

        monto = round(float(p["monto"]), 2)
        if monto <= 0:
            raise POSError("El monto de un pago debe ser mayor que cero")
        suma += monto

        monto_recibido = p.get("monto_recibido")
        cambio = None
        if metodo == MetodoPago.EFECTIVO and monto_recibido is not None:
            monto_recibido = round(float(monto_recibido), 2)
            if monto_recibido < monto:
                raise POSError("El efectivo recibido es menor que el monto del pago")
            cambio = round(monto_recibido - monto, 2)

        db.add(
            Pago(
                empresa_id=empresa_id,
                venta_pos_id=venta.id,
                metodo=metodo,
                monto=monto,
                monto_recibido=monto_recibido,
                cambio=cambio,
                usuario_id=usuario_id,
            )
        )

    return round(suma, 2)
