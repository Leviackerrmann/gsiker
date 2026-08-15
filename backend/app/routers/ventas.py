from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_empresa, get_current_user, require_admin
from app.models.empresa import Empresa
from app.models.inventario import MotivoMovimiento, MovimientoInventario, TipoMovimiento
from app.models.sku import SKU
from app.models.usuario import Usuario
from app.models.ventas import (
    Cliente, CotizacionVenta, ItemCotizacionVenta,
    PedidoVenta, ItemPedidoVenta, EstadoPedido,
    DespachoVenta, ItemDespacho, FacturaVenta,
    DevolucionVenta, ItemDevolucionVenta,
)
from app.services.inventario import actualizar_stock
from app.services.ventas import generar_numero_ov, procesar_despacho, generar_factura

router = APIRouter(prefix="/api/ventas", tags=["ventas"])

# ═══ CLIENTES ═══════════════════════════════════════════

@router.get("/clientes")
async def list_clientes(db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa)):
    result = await db.execute(select(Cliente).where(Cliente.empresa_id == empresa.id).order_by(Cliente.nombre))
    return result.scalars().all()

@router.post("/clientes", status_code=status.HTTP_201_CREATED)
async def create_cliente(body: dict, db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa), _=Depends(require_admin)):
    if (await db.execute(select(Cliente).where(Cliente.empresa_id == empresa.id, Cliente.codigo == body["codigo"]))).scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El código ya existe")
    c = Cliente(empresa_id=empresa.id, codigo=body["codigo"], nombre=body["nombre"], documento=body.get("documento"),
                 direccion=body.get("direccion"), telefono=body.get("telefono"), email=body.get("email"),
                 moneda=(body.get("moneda") or "GTQ").upper())
    db.add(c); await db.flush(); await db.refresh(c); return c

@router.put("/clientes/{cliente_id}")
async def update_cliente(cliente_id: int, body: dict, db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa), _=Depends(require_admin)):
    c = (await db.execute(select(Cliente).where(Cliente.id == cliente_id, Cliente.empresa_id == empresa.id))).scalar_one_or_none()
    if not c: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente no encontrado")
    for k, v in body.items():
        if k not in ("id", "empresa_id"): setattr(c, k, v)
    await db.flush(); await db.refresh(c); return c

# ═══ COTIZACIONES VENTA ═════════════════════════════════

@router.get("/cotizaciones")
async def list_cotizaciones(estado: str | None = None, db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa)):
    stmt = select(CotizacionVenta).where(CotizacionVenta.empresa_id == empresa.id).options(
        selectinload(CotizacionVenta.cliente), selectinload(CotizacionVenta.usuario),
        selectinload(CotizacionVenta.items).selectinload(ItemCotizacionVenta.sku)
    ).order_by(CotizacionVenta.fecha.desc())
    if estado: stmt = stmt.where(CotizacionVenta.estado == estado)
    result = await db.execute(stmt)
    cotis = result.scalars().unique().all()
    return [{"id": c.id, "numero": c.numero, "cliente_id": c.cliente_id, "cliente_nombre": c.cliente.nombre,
             "fecha": c.fecha, "estado": c.estado, "moneda": c.moneda, "notas": c.notas, "usuario_nombre": c.usuario.nombre_completo if c.usuario else None,
             "items": [{"id": i.id, "sku_id": i.sku_id, "sku_codigo": i.sku.codigo_sku, "sku_descripcion": i.sku.descripcion,
                         "cantidad": i.cantidad, "precio_unitario": i.precio_unitario, "precio_total": i.precio_total} for i in c.items]} for c in cotis]

@router.post("/cotizaciones", status_code=status.HTTP_201_CREATED)
async def create_cotizacion(body: dict, db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa), current_user: Usuario = Depends(get_current_user)):
    cli = (await db.execute(select(Cliente).where(Cliente.id == body["cliente_id"], Cliente.empresa_id == empresa.id))).scalar_one_or_none()
    if not cli:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente no encontrado")
    result = await db.execute(select(func.count()).select_from(CotizacionVenta).where(CotizacionVenta.empresa_id == empresa.id))
    numero = f"COTV-{(result.scalar() or 0) + 1:06d}"
    moneda = (cli.moneda or "GTQ").upper()
    c = CotizacionVenta(empresa_id=empresa.id, numero=numero, cliente_id=body["cliente_id"], moneda=moneda,
                        tipo_cambio=empresa.factor_a_base(moneda), notas=body.get("notas"), usuario_id=current_user.id)
    db.add(c); await db.flush()
    for it in body.get("items", []):
        sku = (await db.execute(select(SKU).where(SKU.id == it["sku_id"], SKU.empresa_id == empresa.id))).scalar_one_or_none()
        if not sku: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"SKU {it['sku_id']} no encontrado")
        precio_total = round(it.get("cantidad", 0) * it.get("precio_unitario", 0), 2)
        db.add(ItemCotizacionVenta(cotizacion_id=c.id, sku_id=it["sku_id"], cantidad=it["cantidad"], precio_unitario=it.get("precio_unitario", 0), precio_total=precio_total))
    await db.flush(); return {"id": c.id, "numero": c.numero, "estado": c.estado}

@router.post("/cotizaciones/{cot_id}/aceptar")
async def aceptar_cotizacion(cot_id: int, db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa)):
    c = (await db.execute(select(CotizacionVenta).where(CotizacionVenta.id == cot_id, CotizacionVenta.empresa_id == empresa.id))).scalar_one_or_none()
    if not c: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cotización no encontrada")
    c.estado = "aceptada"; await db.flush(); return {"message": "Cotización aceptada"}

@router.post("/cotizaciones/{cot_id}/rechazar")
async def rechazar_cotizacion(cot_id: int, db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa)):
    c = (await db.execute(select(CotizacionVenta).where(CotizacionVenta.id == cot_id, CotizacionVenta.empresa_id == empresa.id))).scalar_one_or_none()
    if not c: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cotización no encontrada")
    c.estado = "rechazada"; await db.flush(); return {"message": "Cotización rechazada"}

@router.post("/cotizaciones/{cot_id}/convertir")
async def convertir_cotizacion(cot_id: int, db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa), current_user: Usuario = Depends(get_current_user)):
    c = (await db.execute(select(CotizacionVenta).where(CotizacionVenta.id == cot_id, CotizacionVenta.empresa_id == empresa.id).options(selectinload(CotizacionVenta.items)))).scalar_one_or_none()
    if not c: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cotización no encontrada")
    if c.estado != "aceptada": raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Solo cotizaciones aceptadas")
    numero = await generar_numero_ov(db, empresa.id)
    p = PedidoVenta(empresa_id=empresa.id, numero=numero, cliente_id=c.cliente_id, cotizacion_id=c.id, usuario_id=current_user.id,
                    moneda=c.moneda, tipo_cambio=c.tipo_cambio,
                    nota=f"Generado desde cotización {c.numero}")
    db.add(p); await db.flush()
    for it in c.items:
        db.add(ItemPedidoVenta(pedido_id=p.id, sku_id=it.sku_id, cantidad_solicitada=it.cantidad, precio_unitario=it.precio_unitario, precio_total=it.precio_total))
    c.estado = "convertida"; await db.flush()
    return {"message": "Convertida en pedido", "pedido_id": p.id, "numero": p.numero}

# ═══ PEDIDOS VENTA ══════════════════════════════════════

@router.get("/pedidos")
async def list_pedidos(estado: str | None = None, cliente_id: int | None = None, db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa)):
    stmt = select(PedidoVenta).where(PedidoVenta.empresa_id == empresa.id).options(selectinload(PedidoVenta.cliente), selectinload(PedidoVenta.items).selectinload(ItemPedidoVenta.sku)).order_by(PedidoVenta.fecha_emision.desc())
    if estado:
        try: stmt = stmt.where(PedidoVenta.estado == EstadoPedido(estado))
        except ValueError: pass
    if cliente_id: stmt = stmt.where(PedidoVenta.cliente_id == cliente_id)
    result = await db.execute(stmt); pedidos = result.scalars().unique().all()
    return [{"id": p.id, "numero": p.numero, "cliente_id": p.cliente_id, "cliente_nombre": p.cliente.nombre,
             "fecha_emision": p.fecha_emision, "fecha_entrega": p.fecha_entrega, "estado": p.estado.value,
             "moneda": p.moneda, "tipo_cambio": p.tipo_cambio,
             "subtotal": p.subtotal, "impuesto_total": p.impuesto_total, "total": p.total, "nota": p.nota,
             "items": [{"id": i.id, "sku_id": i.sku_id, "sku_codigo": i.sku.codigo_sku, "sku_descripcion": i.sku.descripcion,
                         "cantidad_solicitada": i.cantidad_solicitada, "cantidad_despachada": i.cantidad_despachada,
                         "precio_unitario": i.precio_unitario, "precio_total": i.precio_total} for i in p.items]} for p in pedidos]

@router.get("/pedidos/{pedido_id}")
async def get_pedido(pedido_id: int, db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa)):
    p = (await db.execute(select(PedidoVenta).where(PedidoVenta.id == pedido_id, PedidoVenta.empresa_id == empresa.id).options(selectinload(PedidoVenta.cliente), selectinload(PedidoVenta.items).selectinload(ItemPedidoVenta.sku)))).scalar_one_or_none()
    if not p: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pedido no encontrado")
    return {"id": p.id, "numero": p.numero, "cliente_id": p.cliente_id, "cliente_nombre": p.cliente.nombre,
            "fecha_emision": p.fecha_emision, "fecha_entrega": p.fecha_entrega, "estado": p.estado.value,
            "moneda": p.moneda, "tipo_cambio": p.tipo_cambio,
            "subtotal": p.subtotal, "impuesto_total": p.impuesto_total, "total": p.total, "nota": p.nota,
            "items": [{"id": i.id, "sku_id": i.sku_id, "sku_codigo": i.sku.codigo_sku, "sku_descripcion": i.sku.descripcion,
                        "cantidad_solicitada": i.cantidad_solicitada, "cantidad_despachada": i.cantidad_despachada,
                        "precio_unitario": i.precio_unitario, "precio_total": i.precio_total} for i in p.items]}

@router.post("/pedidos", status_code=status.HTTP_201_CREATED)
async def create_pedido(body: dict, db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa), current_user: Usuario = Depends(get_current_user)):
    if not body.get("items"): raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Debe incluir ítems")
    c = (await db.execute(select(Cliente).where(Cliente.id == body["cliente_id"], Cliente.empresa_id == empresa.id))).scalar_one_or_none()
    if not c: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente no encontrado")
    numero = await generar_numero_ov(db, empresa.id)
    moneda = (c.moneda or "GTQ").upper()
    p = PedidoVenta(empresa_id=empresa.id, numero=numero, cliente_id=body["cliente_id"], fecha_entrega=body.get("fecha_entrega"),
                    moneda=moneda, tipo_cambio=empresa.factor_a_base(moneda),
                    nota=body.get("nota"), usuario_id=current_user.id, cotizacion_id=body.get("cotizacion_id"))
    db.add(p); await db.flush()
    subtotal = 0.0
    for it in body["items"]:
        sku = (await db.execute(select(SKU).where(SKU.id == it["sku_id"], SKU.empresa_id == empresa.id))).scalar_one_or_none()
        if not sku: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"SKU {it['sku_id']} no encontrado")
        precio_total = round(it["cantidad_solicitada"] * it["precio_unitario"], 2)
        subtotal += precio_total
        db.add(ItemPedidoVenta(pedido_id=p.id, sku_id=it["sku_id"], cantidad_solicitada=it["cantidad_solicitada"], precio_unitario=it["precio_unitario"], precio_total=precio_total))
    p.subtotal = subtotal; p.impuesto_total = round(subtotal * empresa.iva_porcentaje / 100, 2); p.total = round(subtotal + p.impuesto_total, 2)
    await db.flush(); return {"id": p.id, "numero": p.numero, "estado": p.estado.value}

@router.post("/pedidos/{pedido_id}/cancelar")
async def cancelar_pedido(pedido_id: int, body: dict = None, db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa), _=Depends(require_admin)):
    p = (await db.execute(select(PedidoVenta).where(PedidoVenta.id == pedido_id, PedidoVenta.empresa_id == empresa.id))).scalar_one_or_none()
    if not p: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pedido no encontrado")
    p.estado = EstadoPedido.CANCELADO
    motivo = body.get("motivo", "") if body else ""
    if motivo and p.nota: p.nota = f"{p.nota} [CANCELADO: {motivo}]"
    elif motivo: p.nota = f"[CANCELADO: {motivo}]"
    await db.flush(); return {"message": "Pedido cancelado"}

# ═══ DESPACHO ═══════════════════════════════════════════

@router.post("/pedidos/{pedido_id}/despachar")
async def despachar_pedido(pedido_id: int, body: dict, db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa), current_user: Usuario = Depends(get_current_user)):
    try:
        await procesar_despacho(db=db, empresa_id=empresa.id, pedido_id=pedido_id, bodega_id=body["bodega_id"],
                                items_data=body["items"], iva_porcentaje=empresa.iva_porcentaje, usuario_id=current_user.id, nota=body.get("nota"))
    except ValueError as e: raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    await db.flush(); return {"message": "Despacho registrado"}

@router.get("/despachos")
async def list_despachos(db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa)):
    result = await db.execute(select(DespachoVenta).where(DespachoVenta.empresa_id == empresa.id).options(selectinload(DespachoVenta.pedido), selectinload(DespachoVenta.items).selectinload(ItemDespacho.item_pedido)).order_by(DespachoVenta.fecha.desc()))
    despachos = result.scalars().unique().all()
    resp = []
    for d in despachos:
        items = []
        for it in d.items:
            ip = it.item_pedido; sku = (await db.execute(select(SKU).where(SKU.id == ip.sku_id))).scalar_one()
            items.append({"id": it.id, "sku_codigo": sku.codigo_sku, "cantidad": it.cantidad_despachada})
        resp.append({"id": d.id, "pedido_id": d.pedido_id, "numero": d.pedido.numero, "fecha": d.fecha, "nota": d.nota, "items": items})
    return resp

# ═══ DEVOLUCIONES VENTA ═════════════════════════════════

@router.post("/pedidos/{pedido_id}/devolver")
async def devolver_pedido(pedido_id: int, body: dict, db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa), current_user: Usuario = Depends(get_current_user)):
    p = (await db.execute(select(PedidoVenta).where(PedidoVenta.id == pedido_id, PedidoVenta.empresa_id == empresa.id))).scalar_one_or_none()
    if not p: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pedido no encontrado")
    if p.estado.value not in ("parcial", "despachado"): raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Solo pedidos con ítems despachados (parcial o despachado)")
    dev = DevolucionVenta(empresa_id=empresa.id, pedido_id=pedido_id, nota=body.get("nota"), usuario_id=current_user.id)
    db.add(dev); await db.flush()
    for it in body.get("items", []):
        ip = (await db.execute(select(ItemPedidoVenta).where(ItemPedidoVenta.id == it["item_pedido_id"]))).scalar_one_or_none()
        if not ip or ip.pedido_id != pedido_id: raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Item inválido")
        if it["cantidad_devuelta"] > ip.cantidad_despachada: raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Excede lo despachado")
        db.add(ItemDevolucionVenta(devolucion_id=dev.id, item_pedido_id=it["item_pedido_id"], cantidad_devuelta=it["cantidad_devuelta"]))
        ip.cantidad_despachada -= it["cantidad_devuelta"]
        mov = MovimientoInventario(empresa_id=empresa.id, tipo=TipoMovimiento.ENTRADA, motivo=MotivoMovimiento.DEVOLUCION_CLIENTE, sku_id=ip.sku_id, bodega_id=body.get("bodega_id", 1), cantidad=it["cantidad_devuelta"], referencia=f"Devolución OV {p.numero}", usuario_id=current_user.id)
        db.add(mov); await actualizar_stock(db, empresa.id, ip.sku_id, body.get("bodega_id", 1), it["cantidad_devuelta"], TipoMovimiento.ENTRADA)
    await db.flush(); return {"message": "Devolución registrada"}

# ═══ FACTURACIÓN ════════════════════════════════════════

@router.post("/pedidos/{pedido_id}/facturar")
async def facturar_pedido(pedido_id: int, db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa), current_user: Usuario = Depends(get_current_user)):
    try: factura = await generar_factura(db, empresa.id, pedido_id, iva_porcentaje=empresa.iva_porcentaje, usuario_id=current_user.id)
    except ValueError as e: raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    await db.flush(); await db.refresh(factura)
    p = (await db.execute(select(PedidoVenta).where(PedidoVenta.id == pedido_id))).scalar_one()
    c = (await db.execute(select(Cliente).where(Cliente.id == factura.cliente_id))).scalar_one()
    return {"id": factura.id, "numero": factura.numero, "pedido_numero": p.numero, "cliente_nombre": c.nombre,
            "fecha_emision": factura.fecha_emision, "moneda": factura.moneda, "tipo_cambio": factura.tipo_cambio,
            "subtotal": factura.subtotal, "impuesto_total": factura.impuesto_total, "total": factura.total, "estado": factura.estado}

@router.get("/facturas")
async def list_facturas(db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa)):
    result = await db.execute(select(FacturaVenta).where(FacturaVenta.empresa_id == empresa.id).options(selectinload(FacturaVenta.cliente), selectinload(FacturaVenta.pedido)).order_by(FacturaVenta.fecha_emision.desc()))
    facturas = result.scalars().unique().all()
    return [{"id": f.id, "numero": f.numero, "pedido_id": f.pedido_id, "pedido_numero": f.pedido.numero,
             "cliente_id": f.cliente_id, "cliente_nombre": f.cliente.nombre, "fecha_emision": f.fecha_emision,
             "moneda": f.moneda, "tipo_cambio": f.tipo_cambio,
             "fecha_vencimiento": f.fecha_vencimiento, "subtotal": f.subtotal, "impuesto_porcentaje": f.impuesto_porcentaje,
             "impuesto_total": f.impuesto_total, "total": f.total, "estado": f.estado, "notas": f.notas} for f in facturas]


@router.get("/facturas/{factura_id}")
async def get_factura(factura_id: int, db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa)):
    f = (await db.execute(select(FacturaVenta).where(FacturaVenta.id == factura_id, FacturaVenta.empresa_id == empresa.id)
          .options(selectinload(FacturaVenta.cliente), selectinload(FacturaVenta.pedido)))).scalar_one_or_none()
    if not f: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Factura no encontrada")
    p = (await db.execute(select(PedidoVenta).where(PedidoVenta.id == f.pedido_id)
          .options(selectinload(PedidoVenta.items).selectinload(ItemPedidoVenta.sku)))).scalar_one()
    return {"id": f.id, "numero": f.numero, "pedido_id": f.pedido_id, "pedido_numero": p.numero,
            "cliente_nombre": f.cliente.nombre, "fecha_emision": f.fecha_emision, "moneda": f.moneda, "tipo_cambio": f.tipo_cambio,
            "fecha_vencimiento": f.fecha_vencimiento, "subtotal": f.subtotal,
            "impuesto_porcentaje": f.impuesto_porcentaje, "impuesto_total": f.impuesto_total,
            "total": f.total, "estado": f.estado, "notas": f.notas,
            "items": [{"sku_codigo": i.sku.codigo_sku, "sku_descripcion": i.sku.descripcion,
                        "cantidad": i.cantidad_despachada, "precio_unitario": i.precio_unitario,
                        "precio_total": i.precio_total} for i in p.items]}


@router.post("/facturas/{factura_id}/pagar")
async def pagar_factura(factura_id: int, db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa), _=Depends(require_admin)):
    f = (await db.execute(select(FacturaVenta).where(FacturaVenta.id == factura_id, FacturaVenta.empresa_id == empresa.id))).scalar_one_or_none()
    if not f: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Factura no encontrada")
    f.estado = "pagada"; await db.flush(); return {"message": "Factura marcada como pagada"}


@router.post("/facturas/{factura_id}/anular")
async def anular_factura(factura_id: int, db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa), _=Depends(require_admin)):
    f = (await db.execute(select(FacturaVenta).where(FacturaVenta.id == factura_id, FacturaVenta.empresa_id == empresa.id))).scalar_one_or_none()
    if not f: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Factura no encontrada")
    f.estado = "anulada"; await db.flush(); return {"message": "Factura anulada"}
