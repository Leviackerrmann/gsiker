from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_empresa, get_current_user, require_admin
from app.models.compras import (
    CotizacionCompra,
    DevolucionCompra,
    EstadoOrden,
    ItemCotizacion,
    ItemDevolucionCompra,
    ItemOrdenCompra,
    ItemPropuesta,
    ItemRecepcion,
    ItemSolicitudCompra,
    OrdenCompra,
    PrecioProveedor,
    PropuestaCotizacion,
    Proveedor,
    RecepcionCompra,
    SolicitudCompra,
)
from app.models.empresa import Empresa
from app.models.inventario import MotivoMovimiento, MovimientoInventario, TipoMovimiento
from app.models.sku import SKU
from app.models.usuario import Usuario
from app.schemas.compras import (
    ItemOCResponse,
    ItemRecepcionResponse,
    OrdenCreate,
    OrdenResponse,
    ProveedorCreate,
    ProveedorResponse,
    ProveedorUpdate,
    RecepcionCreate,
    RecepcionResponse,
)
from app.services.compras import generar_numero_oc, procesar_recepcion
from app.services.inventario import actualizar_stock

router = APIRouter(prefix="/api/compras", tags=["compras"])


# ═══ PROVEEDORES ═══════════════════════════════════════════

@router.get("/proveedores", response_model=list[ProveedorResponse])
async def list_proveedores(db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa)):
    result = await db.execute(select(Proveedor).where(Proveedor.empresa_id == empresa.id).order_by(Proveedor.nombre))
    return result.scalars().all()


@router.post("/proveedores", response_model=ProveedorResponse, status_code=status.HTTP_201_CREATED)
async def create_proveedor(body: ProveedorCreate, db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa), _=Depends(require_admin)):
    existing = await db.execute(select(Proveedor).where(Proveedor.empresa_id == empresa.id, Proveedor.codigo == body.codigo))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El código ya existe")
    prov = Proveedor(**body.model_dump(), empresa_id=empresa.id)
    db.add(prov)
    await db.flush()
    await db.refresh(prov)
    return prov


@router.put("/proveedores/{prov_id}", response_model=ProveedorResponse)
async def update_proveedor(prov_id: int, body: ProveedorUpdate, db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa), _=Depends(require_admin)):
    result = await db.execute(select(Proveedor).where(Proveedor.id == prov_id, Proveedor.empresa_id == empresa.id))
    prov = result.scalar_one_or_none()
    if prov is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proveedor no encontrado")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(prov, k, v)
    await db.flush()
    await db.refresh(prov)
    return prov


# ═══ ÓRDENES DE COMPRA ════════════════════════════════════

def _orden_to_response(o: OrdenCompra) -> OrdenResponse:
    return OrdenResponse(
        id=o.id, numero_oc=o.numero_oc, proveedor_id=o.proveedor_id,
        proveedor_nombre=o.proveedor.nombre, fecha_emision=o.fecha_emision,
        fecha_entrega=o.fecha_entrega, estado=o.estado.value,
        moneda=o.moneda, tipo_cambio=o.tipo_cambio, nota=o.nota,
        usuario_id=o.usuario_id, created_at=o.created_at,
        items=[ItemOCResponse(
            id=i.id, sku_id=i.sku_id, sku_codigo=i.sku.codigo_sku,
            sku_descripcion=i.sku.descripcion,
            cantidad_solicitada=i.cantidad_solicitada,
            cantidad_recibida=i.cantidad_recibida,
            costo_unitario=i.costo_unitario, costo_total=i.costo_total,
        ) for i in o.items],
    )


@router.get("/ordenes", response_model=list[OrdenResponse])
async def list_ordenes(
    estado: str | None = None,
    proveedor_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    empresa: Empresa = Depends(get_current_empresa),
):
    stmt = (
        select(OrdenCompra)
        .where(OrdenCompra.empresa_id == empresa.id)
        .options(selectinload(OrdenCompra.proveedor), selectinload(OrdenCompra.items).selectinload(ItemOrdenCompra.sku))
        .order_by(OrdenCompra.fecha_emision.desc())
    )
    if estado:
        try:
            stmt = stmt.where(OrdenCompra.estado == EstadoOrden(estado))
        except ValueError:
            pass
    if proveedor_id:
        stmt = stmt.where(OrdenCompra.proveedor_id == proveedor_id)

    result = await db.execute(stmt)
    ordenes = result.scalars().unique().all()
    return [_orden_to_response(o) for o in ordenes]


@router.get("/ordenes/{orden_id}", response_model=OrdenResponse)
async def get_orden(orden_id: int, db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa)):
    result = await db.execute(
        select(OrdenCompra).where(OrdenCompra.id == orden_id, OrdenCompra.empresa_id == empresa.id)
        .options(selectinload(OrdenCompra.proveedor), selectinload(OrdenCompra.items).selectinload(ItemOrdenCompra.sku))
    )
    o = result.scalar_one_or_none()
    if o is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Orden no encontrada")
    return _orden_to_response(o)


@router.post("/ordenes", response_model=OrdenResponse, status_code=status.HTTP_201_CREATED)
async def create_orden(
    body: OrdenCreate,
    db: AsyncSession = Depends(get_db),
    empresa: Empresa = Depends(get_current_empresa),
    current_user: Usuario = Depends(get_current_user),
):
    if not body.items:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Debe incluir al menos un ítem")

    prov = await db.execute(select(Proveedor).where(Proveedor.id == body.proveedor_id, Proveedor.empresa_id == empresa.id))
    prov_obj = prov.scalar_one_or_none()
    if prov_obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proveedor no encontrado")

    numero = await generar_numero_oc(db, empresa.id)

    # Moneda del documento: la del proveedor por defecto (o la enviada). El tipo de
    # cambio se toma del enviado o se deriva de la tasa de referencia de la empresa.
    moneda = (body.moneda or prov_obj.moneda or "GTQ").upper()
    tipo_cambio = body.tipo_cambio if body.tipo_cambio else empresa.factor_a_base(moneda)

    orden = OrdenCompra(
        empresa_id=empresa.id,
        numero_oc=numero,
        proveedor_id=body.proveedor_id,
        fecha_entrega=body.fecha_entrega,
        moneda=moneda,
        tipo_cambio=tipo_cambio,
        nota=body.nota,
        usuario_id=current_user.id,
    )
    db.add(orden)
    await db.flush()

    items = []
    for item_data in body.items:
        sku_r = await db.execute(select(SKU).where(SKU.id == item_data.sku_id, SKU.empresa_id == empresa.id))
        sku = sku_r.scalar_one_or_none()
        if sku is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"SKU {item_data.sku_id} no encontrado")

        costo_total = round(item_data.cantidad_solicitada * item_data.costo_unitario, 2)
        item = ItemOrdenCompra(
            orden_id=orden.id,
            sku_id=item_data.sku_id,
            cantidad_solicitada=item_data.cantidad_solicitada,
            costo_unitario=item_data.costo_unitario,
            costo_total=costo_total,
        )
        db.add(item)
        item.sku = sku
        items.append(item)

    await db.flush()
    # Recargar con eager-load para serializar sin lazy-loads (async).
    result = await db.execute(
        select(OrdenCompra).where(OrdenCompra.id == orden.id)
        .options(selectinload(OrdenCompra.proveedor), selectinload(OrdenCompra.items).selectinload(ItemOrdenCompra.sku))
    )
    return _orden_to_response(result.scalar_one())


@router.post("/ordenes/{orden_id}/cancelar")
async def cancelar_orden(orden_id: int, body: dict = None, db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa), _=Depends(require_admin)):
    result = await db.execute(select(OrdenCompra).where(OrdenCompra.id == orden_id, OrdenCompra.empresa_id == empresa.id))
    orden = result.scalar_one_or_none()
    if orden is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Orden no encontrada")
    if orden.estado == EstadoOrden.COMPLETA:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No se puede cancelar una orden completa")
    orden.estado = EstadoOrden.CANCELADA
    motivo = body.get("motivo", "") if body else ""
    if motivo and orden.nota:
        orden.nota = f"{orden.nota} [CANCELADA: {motivo}]"
    elif motivo:
        orden.nota = f"[CANCELADA: {motivo}]"
    await db.flush()
    return {"message": "Orden cancelada", "numero_oc": orden.numero_oc}


# ═══ RECEPCIÓN ════════════════════════════════════════════

@router.post("/ordenes/{orden_id}/recibir", response_model=RecepcionResponse, status_code=status.HTTP_201_CREATED)
async def recibir_orden(
    orden_id: int,
    body: RecepcionCreate,
    db: AsyncSession = Depends(get_db),
    empresa: Empresa = Depends(get_current_empresa),
    current_user: Usuario = Depends(get_current_user),
):
    try:
        recepcion = await procesar_recepcion(
            db=db,
            empresa_id=empresa.id,
            orden_id=orden_id,
            bodega_id=body.bodega_id,
            items_recibidos=[it.model_dump() for it in body.items],
            usuario_id=current_user.id,
            nota=body.nota,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    await db.flush()

    recepcion_reloaded = (await db.execute(
        select(RecepcionCompra)
        .where(RecepcionCompra.id == recepcion.id)
        .options(selectinload(RecepcionCompra.items), selectinload(RecepcionCompra.orden))
    )).scalar_one()

    items_resp = []
    for ir in recepcion_reloaded.items:
        item_orden = (await db.execute(select(ItemOrdenCompra).where(ItemOrdenCompra.id == ir.item_orden_id))).scalar_one()
        sku = (await db.execute(select(SKU).where(SKU.id == item_orden.sku_id))).scalar_one()
        items_resp.append(ItemRecepcionResponse(
            id=ir.id, item_orden_id=ir.item_orden_id,
            cantidad_recibida=ir.cantidad_recibida, sku_codigo=sku.codigo_sku,
        ))

    return RecepcionResponse(
        id=recepcion_reloaded.id, orden_id=recepcion_reloaded.orden_id,
        numero_oc=recepcion_reloaded.orden.numero_oc, fecha=recepcion_reloaded.fecha, nota=recepcion_reloaded.nota,
        items=items_resp,
    )


@router.get("/recepciones", response_model=list[RecepcionResponse])
async def list_recepciones(db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa)):
    result = await db.execute(
        select(RecepcionCompra)
        .where(RecepcionCompra.empresa_id == empresa.id)
        .options(selectinload(RecepcionCompra.items), selectinload(RecepcionCompra.orden))
        .order_by(RecepcionCompra.fecha.desc())
    )
    recepciones = result.scalars().unique().all()

    responses = []
    for r in recepciones:
        items_resp = []
        for ir in r.items:
            item_orden = (await db.execute(select(ItemOrdenCompra).where(ItemOrdenCompra.id == ir.item_orden_id))).scalar_one()
            sku = (await db.execute(select(SKU).where(SKU.id == item_orden.sku_id))).scalar_one()
            items_resp.append(ItemRecepcionResponse(
                id=ir.id, item_orden_id=ir.item_orden_id,
                cantidad_recibida=ir.cantidad_recibida, sku_codigo=sku.codigo_sku,
            ))
        responses.append(RecepcionResponse(
            id=r.id, orden_id=r.orden_id, numero_oc=r.orden.numero_oc,
            fecha=r.fecha, nota=r.nota, items=items_resp,
        ))
    return responses

# ═══ SOLICITUDES DE COMPRA ═════════════════════════════════

@router.get("/solicitudes")
async def list_solicitudes(estado: str | None = None, db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa)):
    stmt = select(SolicitudCompra).where(SolicitudCompra.empresa_id == empresa.id).options(
        selectinload(SolicitudCompra.usuario),
        selectinload(SolicitudCompra.items).selectinload(ItemSolicitudCompra.sku),
    ).order_by(SolicitudCompra.fecha.desc())
    if estado:
        stmt = stmt.where(SolicitudCompra.estado == estado)
    result = await db.execute(stmt)
    solicitudes = result.scalars().unique().all()
    return [{
        "id": s.id, "numero": s.numero, "fecha": s.fecha,
        "usuario_nombre": s.usuario.nombre_completo if s.usuario else None,
        "estado": s.estado, "notas": s.notas,
        "items": [{"id": i.id, "sku_id": i.sku_id, "sku_codigo": i.sku.codigo_sku,
                    "sku_descripcion": i.sku.descripcion, "cantidad": i.cantidad,
                    "justificacion": i.justificacion} for i in s.items],
    } for s in solicitudes]


@router.post("/solicitudes", status_code=status.HTTP_201_CREATED)
async def create_solicitud(body: dict, db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa), current_user: Usuario = Depends(get_current_user)):
    result = await db.execute(select(func.count()).select_from(SolicitudCompra).where(SolicitudCompra.empresa_id == empresa.id))
    count = result.scalar() or 0
    numero = f"SC-{count + 1:06d}"

    sol = SolicitudCompra(
        empresa_id=empresa.id,
        numero=numero,
        usuario_id=current_user.id,
        notas=body.get("notas"),
    )
    db.add(sol)
    await db.flush()

    items = []
    for it in body.get("items", []):
        sku = (await db.execute(select(SKU).where(SKU.id == it["sku_id"], SKU.empresa_id == empresa.id))).scalar_one_or_none()
        if sku is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"SKU {it['sku_id']} no encontrado")
        item = ItemSolicitudCompra(
            solicitud_id=sol.id,
            sku_id=it["sku_id"],
            cantidad=it["cantidad"],
            justificacion=it.get("justificacion"),
        )
        db.add(item)
        item.sku = sku
        items.append(item)

    await db.flush()
    return {"id": sol.id, "numero": sol.numero, "fecha": sol.fecha, "estado": sol.estado, "notas": sol.notas,
            "items": [{"id": i.id, "sku_id": i.sku_id, "sku_codigo": i.sku.codigo_sku,
                        "sku_descripcion": i.sku.descripcion, "cantidad": i.cantidad,
                        "justificacion": i.justificacion} for i in items]}


@router.post("/solicitudes/{solicitud_id}/aprobar")
async def aprobar_solicitud(solicitud_id: int, db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa), _=Depends(require_admin)):
    result = await db.execute(select(SolicitudCompra).where(SolicitudCompra.id == solicitud_id, SolicitudCompra.empresa_id == empresa.id))
    sol = result.scalar_one_or_none()
    if sol is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Solicitud no encontrada")
    if sol.estado != "pendiente":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Solo solicitudes pendientes pueden aprobarse")
    sol.estado = "aprobada"
    await db.flush()
    return {"message": "Solicitud aprobada"}


@router.post("/solicitudes/{solicitud_id}/rechazar")
async def rechazar_solicitud(solicitud_id: int, db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa), _=Depends(require_admin)):
    result = await db.execute(select(SolicitudCompra).where(SolicitudCompra.id == solicitud_id, SolicitudCompra.empresa_id == empresa.id))
    sol = result.scalar_one_or_none()
    if sol is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Solicitud no encontrada")
    if sol.estado != "pendiente":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Solo solicitudes pendientes pueden rechazarse")
    sol.estado = "rechazada"
    await db.flush()
    return {"message": "Solicitud rechazada"}


@router.post("/solicitudes/{solicitud_id}/convertir")
async def convertir_solicitud(solicitud_id: int, db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa), current_user: Usuario = Depends(get_current_user)):
    result = await db.execute(
        select(SolicitudCompra).where(SolicitudCompra.id == solicitud_id, SolicitudCompra.empresa_id == empresa.id)
        .options(selectinload(SolicitudCompra.items).selectinload(ItemSolicitudCompra.sku))
    )
    sol = result.scalar_one_or_none()
    if sol is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Solicitud no encontrada")
    if sol.estado != "aprobada":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Solo solicitudes aprobadas pueden convertirse")

    numero = await generar_numero_oc(db, empresa.id)

    # Usar el primer proveedor activo disponible de la empresa
    prov_result = await db.execute(select(Proveedor).where(Proveedor.empresa_id == empresa.id, Proveedor.activo.is_(True)).limit(1))
    proveedor = prov_result.scalar_one_or_none()
    if proveedor is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No hay proveedores activos")

    orden = OrdenCompra(
        empresa_id=empresa.id,
        numero_oc=numero,
        proveedor_id=proveedor.id,
        usuario_id=current_user.id,
        nota=f"Generada desde solicitud {sol.numero}",
    )
    db.add(orden)
    await db.flush()

    for it in sol.items:
        item_oc = ItemOrdenCompra(
            orden_id=orden.id,
            sku_id=it.sku_id,
            cantidad_solicitada=it.cantidad,
        )
        db.add(item_oc)

    sol.estado = "convertida"
    await db.flush()
    return {"message": "Solicitud convertida en OC", "orden_id": orden.id, "numero_oc": orden.numero_oc}

# ═══ PRECIOS PROVEEDOR ═══════════════════════════════════

@router.get("/precios")
async def list_precios(proveedor_id: int | None = None, sku_id: int | None = None, db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa)):
    stmt = select(PrecioProveedor).where(PrecioProveedor.empresa_id == empresa.id).options(selectinload(PrecioProveedor.sku), selectinload(PrecioProveedor.proveedor))
    if proveedor_id:
        stmt = stmt.where(PrecioProveedor.proveedor_id == proveedor_id)
    if sku_id:
        stmt = stmt.where(PrecioProveedor.sku_id == sku_id)
    stmt = stmt.order_by(PrecioProveedor.sku_id)
    result = await db.execute(stmt)
    precios = result.scalars().all()
    return [{"id": p.id, "proveedor_id": p.proveedor_id, "proveedor_nombre": p.proveedor.nombre,
             "sku_id": p.sku_id, "sku_codigo": p.sku.codigo_sku, "sku_descripcion": p.sku.descripcion,
             "costo_unitario": p.costo_unitario, "ultima_actualizacion": p.ultima_actualizacion} for p in precios]


@router.post("/precios")
async def upsert_precio(body: dict, db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa), _=Depends(require_admin)):
    result = await db.execute(
        select(PrecioProveedor).where(
            PrecioProveedor.empresa_id == empresa.id,
            PrecioProveedor.proveedor_id == body["proveedor_id"],
            PrecioProveedor.sku_id == body["sku_id"],
        )
    )
    p = result.scalar_one_or_none()
    if p:
        p.costo_unitario = body["costo_unitario"]
        p.ultima_actualizacion = datetime.now(timezone.utc)
    else:
        p = PrecioProveedor(
            empresa_id=empresa.id,
            proveedor_id=body["proveedor_id"],
            sku_id=body["sku_id"],
            costo_unitario=body["costo_unitario"],
        )
        db.add(p)
    await db.flush()
    return {"message": "Precio actualizado", "id": p.id, "costo_unitario": p.costo_unitario}


@router.delete("/precios/{precio_id}")
async def delete_precio(precio_id: int, db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa), _=Depends(require_admin)):
    result = await db.execute(select(PrecioProveedor).where(PrecioProveedor.id == precio_id, PrecioProveedor.empresa_id == empresa.id))
    p = result.scalar_one_or_none()
    if p is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Precio no encontrado")
    await db.delete(p)
    await db.flush()
    return {"message": "Precio eliminado"}


# ═══ DEVOLUCIONES COMPRA ═════════════════════════════════

@router.post("/ordenes/{orden_id}/devolver")
async def devolver_orden(orden_id: int, body: dict, db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa), current_user: Usuario = Depends(get_current_user)):
    result = await db.execute(select(OrdenCompra).where(OrdenCompra.id == orden_id, OrdenCompra.empresa_id == empresa.id))
    orden = result.scalar_one_or_none()
    if orden is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Orden no encontrada")
    if orden.estado.value not in ("parcial", "completa"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Solo se pueden devolver órdenes recibidas")

    dev = DevolucionCompra(empresa_id=empresa.id, orden_id=orden_id, nota=body.get("nota"), usuario_id=current_user.id)
    db.add(dev)
    await db.flush()

    for it in body.get("items", []):
        item_oc = (await db.execute(select(ItemOrdenCompra).where(ItemOrdenCompra.id == it["item_orden_id"]))).scalar_one_or_none()
        if item_oc is None or item_oc.orden_id != orden_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Item inválido")
        if it["cantidad_devuelta"] > item_oc.cantidad_recibida:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cantidad a devolver excede lo recibido")

        idev = ItemDevolucionCompra(devolucion_id=dev.id, item_orden_id=it["item_orden_id"], cantidad_devuelta=it["cantidad_devuelta"])
        db.add(idev)

        item_oc.cantidad_recibida -= it["cantidad_devuelta"]

        mov = MovimientoInventario(
            empresa_id=empresa.id,
            tipo=TipoMovimiento.SALIDA,
            motivo=MotivoMovimiento.DEVOLUCION_PROVEEDOR,
            sku_id=item_oc.sku_id,
            bodega_id=body.get("bodega_id", 1),
            cantidad=it["cantidad_devuelta"],
            costo_unitario=item_oc.costo_unitario,
            costo_total=it["cantidad_devuelta"] * item_oc.costo_unitario,
            referencia=f"Devolución OC {orden.numero_oc}",
            usuario_id=current_user.id,
        )
        db.add(mov)
        await actualizar_stock(db, empresa.id, item_oc.sku_id, body.get("bodega_id", 1), it["cantidad_devuelta"], TipoMovimiento.SALIDA)

    if orden.estado == EstadoOrden.COMPLETA:
        orden.estado = EstadoOrden.PARCIAL
    await db.flush()
    return {"message": "Devolución registrada", "devolucion_id": dev.id}


@router.get("/devoluciones")
async def list_devoluciones(db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa)):
    result = await db.execute(
        select(DevolucionCompra).where(DevolucionCompra.empresa_id == empresa.id).options(
            selectinload(DevolucionCompra.orden),
            selectinload(DevolucionCompra.items).selectinload(ItemDevolucionCompra.item_orden),
        ).order_by(DevolucionCompra.fecha.desc())
    )
    devoluciones = result.scalars().unique().all()
    resp = []
    for d in devoluciones:
        items_resp = []
        for it in d.items:
            item_oc = it.item_orden
            sku = (await db.execute(select(SKU).where(SKU.id == item_oc.sku_id))).scalar_one()
            items_resp.append({"id": it.id, "sku_codigo": sku.codigo_sku, "cantidad_devuelta": it.cantidad_devuelta})
        resp.append({"id": d.id, "orden_id": d.orden_id, "numero_oc": d.orden.numero_oc, "fecha": d.fecha, "nota": d.nota, "items": items_resp})
    return resp


# ═══ COTIZACIONES ═══════════════════════════════════════

@router.get("/cotizaciones")
async def list_cotizaciones(estado: str | None = None, db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa)):
    stmt = select(CotizacionCompra).where(CotizacionCompra.empresa_id == empresa.id).options(
        selectinload(CotizacionCompra.usuario),
        selectinload(CotizacionCompra.items).selectinload(ItemCotizacion.sku),
        selectinload(CotizacionCompra.propuestas).options(
            selectinload(PropuestaCotizacion.proveedor),
            selectinload(PropuestaCotizacion.items),
        ),
    ).order_by(CotizacionCompra.fecha.desc())
    if estado:
        stmt = stmt.where(CotizacionCompra.estado == estado)
    result = await db.execute(stmt)
    cotis = result.scalars().unique().all()
    return [{
        "id": c.id, "numero": c.numero, "fecha": c.fecha, "estado": c.estado, "notas": c.notas,
        "usuario_nombre": c.usuario.nombre_completo if c.usuario else None,
        "items": [{"id": i.id, "sku_id": i.sku_id, "sku_codigo": i.sku.codigo_sku, "sku_descripcion": i.sku.descripcion, "cantidad": i.cantidad} for i in c.items],
        "propuestas": [{"id": p.id, "proveedor_nombre": p.proveedor.nombre, "fecha": p.fecha,
                         "adjudicada": p.adjudicada, "notas": p.notas,
                         "items": [{"item_cotizacion_id": ip.item_cotizacion_id, "costo_unitario": ip.costo_unitario} for ip in p.items],
                         "total": sum(ip.costo_unitario * next(ii.cantidad for ii in c.items if ii.id == ip.item_cotizacion_id) for ip in p.items)} for p in c.propuestas],
    } for c in cotis]


@router.post("/cotizaciones", status_code=status.HTTP_201_CREATED)
async def create_cotizacion(body: dict, db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa), current_user: Usuario = Depends(get_current_user)):
    result = await db.execute(select(func.count()).select_from(CotizacionCompra).where(CotizacionCompra.empresa_id == empresa.id))
    count = result.scalar() or 0
    numero = f"COT-{count + 1:06d}"
    cot = CotizacionCompra(empresa_id=empresa.id, numero=numero, usuario_id=current_user.id, notas=body.get("notas"))
    db.add(cot)
    await db.flush()
    for it in body.get("items", []):
        sku = (await db.execute(select(SKU).where(SKU.id == it["sku_id"], SKU.empresa_id == empresa.id))).scalar_one_or_none()
        if sku is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"SKU {it['sku_id']} no encontrado")
        item = ItemCotizacion(cotizacion_id=cot.id, sku_id=it["sku_id"], cantidad=it["cantidad"])
        db.add(item)
    await db.flush()
    return {"id": cot.id, "numero": cot.numero, "fecha": cot.fecha, "estado": cot.estado, "items": len(body.get("items", []))}


@router.post("/cotizaciones/{cotizacion_id}/propuestas", status_code=status.HTTP_201_CREATED)
async def registrar_propuesta(cotizacion_id: int, body: dict, db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa), _=Depends(require_admin)):
    cot = (await db.execute(select(CotizacionCompra).where(CotizacionCompra.id == cotizacion_id, CotizacionCompra.empresa_id == empresa.id))).scalar_one_or_none()
    if cot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cotización no encontrada")
    if cot.estado not in ("pendiente", "en_proceso"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No se pueden agregar propuestas")
    # Verificar que el proveedor pertenece a la empresa
    prov = (await db.execute(select(Proveedor).where(Proveedor.id == body["proveedor_id"], Proveedor.empresa_id == empresa.id))).scalar_one_or_none()
    if prov is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proveedor no encontrado")
    prop = PropuestaCotizacion(empresa_id=empresa.id, cotizacion_id=cotizacion_id, proveedor_id=body["proveedor_id"], notas=body.get("notas"))
    db.add(prop)
    await db.flush()
    total = 0.0
    for ip_data in body.get("items", []):
        ip = ItemPropuesta(propuesta_id=prop.id, item_cotizacion_id=ip_data["item_cotizacion_id"], costo_unitario=ip_data["costo_unitario"])
        db.add(ip)
        item_cot = (await db.execute(select(ItemCotizacion).where(ItemCotizacion.id == ip_data["item_cotizacion_id"]))).scalar_one()
        total += ip_data["costo_unitario"] * item_cot.cantidad
    if cot.estado == "pendiente":
        cot.estado = "en_proceso"
    await db.flush()
    return {"id": prop.id, "message": "Propuesta registrada", "total": round(total, 2)}


@router.post("/cotizaciones/{cotizacion_id}/adjudicar")
async def adjudicar_cotizacion(cotizacion_id: int, body: dict, db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa), current_user: Usuario = Depends(get_current_user)):
    cot = (await db.execute(
        select(CotizacionCompra).where(CotizacionCompra.id == cotizacion_id, CotizacionCompra.empresa_id == empresa.id)
        .options(selectinload(CotizacionCompra.items), selectinload(CotizacionCompra.propuestas).selectinload(PropuestaCotizacion.items))
    )).scalar_one_or_none()
    if cot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cotización no encontrada")
    if cot.estado == "adjudicada":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ya está adjudicada")

    propuesta_id = body["propuesta_id"]
    prop = next((p for p in cot.propuestas if p.id == propuesta_id), None)
    if prop is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Propuesta no encontrada")

    numero = await generar_numero_oc(db, empresa.id)
    orden = OrdenCompra(empresa_id=empresa.id, numero_oc=numero, proveedor_id=prop.proveedor_id, usuario_id=current_user.id,
                         nota=f"Generada desde cotización {cot.numero}")
    db.add(orden)
    await db.flush()

    for ip in prop.items:
        item_cot = next((ic for ic in cot.items if ic.id == ip.item_cotizacion_id), None)
        if item_cot is None:
            continue
        item_oc = ItemOrdenCompra(orden_id=orden.id, sku_id=item_cot.sku_id,
                                   cantidad_solicitada=item_cot.cantidad, costo_unitario=ip.costo_unitario,
                                   costo_total=item_cot.cantidad * ip.costo_unitario)
        db.add(item_oc)

    prop.adjudicada = True
    cot.estado = "adjudicada"
    await db.flush()
    return {"message": "Cotización adjudicada", "orden_id": orden.id, "numero_oc": orden.numero_oc}
