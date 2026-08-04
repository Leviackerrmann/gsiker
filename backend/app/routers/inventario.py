from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_empresa, get_current_user, require_admin
from app.models.empresa import Empresa
from app.models.inventario import (
    Bodega,
    EstadoConteo,
    InventarioFisico,
    ItemInventarioFisico,
    Lote,
    MotivoMovimiento,
    MovimientoInventario,
    ReservaStock,
    Stock,
    TipoMovimiento,
    Ubicacion,
)
from app.models.sku import SKU
from app.models.usuario import Usuario
from app.schemas.inventario import (
    AlertaStockResponse,
    BodegaCreate,
    BodegaResponse,
    BodegaUpdate,
    ConteoCreate,
    ConteoResponse,
    ItemConteoResponse,
    KardexItemResponse,
    MovimientoCreate,
    MovimientoResponse,
    ReservaCreate,
    ReservaResponse,
    StockResponse,
    TransferenciaCreate,
)
from app.services.inventario import StockInsuficiente, actualizar_stock, crear_transferencia, validar_stock_disponible
from app.services.valorizacion import calcular_pmp_entrada, generar_kardex

router = APIRouter(prefix="/api/inventario", tags=["inventario"])


# ─── BODEGAS ───────────────────────────────────────────────

@router.get("/bodegas", response_model=list[BodegaResponse])
async def list_bodegas(db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa)):
    result = await db.execute(select(Bodega).where(Bodega.empresa_id == empresa.id).order_by(Bodega.nombre))
    return result.scalars().all()


@router.post("/bodegas", response_model=BodegaResponse, status_code=status.HTTP_201_CREATED)
async def create_bodega(body: BodegaCreate, db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa), _=Depends(require_admin)):
    existing = await db.execute(select(Bodega).where(Bodega.empresa_id == empresa.id, Bodega.nombre == body.nombre))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La bodega ya existe")
    bodega = Bodega(**body.model_dump(), empresa_id=empresa.id)
    db.add(bodega)
    await db.flush()
    await db.refresh(bodega)
    return bodega


@router.put("/bodegas/{bodega_id}", response_model=BodegaResponse)
async def update_bodega(bodega_id: int, body: BodegaUpdate, db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa), _=Depends(require_admin)):
    result = await db.execute(select(Bodega).where(Bodega.id == bodega_id, Bodega.empresa_id == empresa.id))
    bodega = result.scalar_one_or_none()
    if bodega is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bodega no encontrada")
    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(bodega, key, value)
    await db.flush()
    await db.refresh(bodega)
    return bodega


# ─── STOCK ─────────────────────────────────────────────────

@router.get("/stock", response_model=list[StockResponse])
async def list_stock(
    bodega_id: int | None = Query(None),
    sku_id: int | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    empresa: Empresa = Depends(get_current_empresa),
):
    stmt = (
        select(
            Stock.id,
            Stock.sku_id,
            SKU.codigo_sku.label("sku_codigo"),
            SKU.descripcion.label("sku_descripcion"),
            Stock.bodega_id,
            Bodega.nombre.label("bodega_nombre"),
            Stock.cantidad,
            Stock.cantidad_minima,
            Stock.cantidad_maxima,
            Stock.lote_id,
            func.coalesce(Lote.numero_lote, "").label("lote_numero"),
            Stock.updated_at,
        )
        .join(SKU, Stock.sku_id == SKU.id)
        .join(Bodega, Stock.bodega_id == Bodega.id)
        .outerjoin(Lote, Stock.lote_id == Lote.id)
        .where(Stock.empresa_id == empresa.id)
    )
    if bodega_id:
        stmt = stmt.where(Stock.bodega_id == bodega_id)
    if sku_id:
        stmt = stmt.where(Stock.sku_id == sku_id)
    stmt = stmt.order_by(SKU.codigo_sku).offset(skip).limit(limit)
    result = await db.execute(stmt)
    rows = result.fetchall()

    stock_ids = [r.sku_id for r in rows]
    reservas_map: dict[int, float] = {}
    if stock_ids:
        reservas_query = await db.execute(
            select(ReservaStock.sku_id, func.coalesce(func.sum(ReservaStock.cantidad), 0.0))
            .where(ReservaStock.empresa_id == empresa.id, ReservaStock.sku_id.in_(stock_ids))
            .group_by(ReservaStock.sku_id)
        )
        for sku_id_r, total in reservas_query.all():
            reservas_map[sku_id_r] = total

    return [
        StockResponse(
            id=row.id,
            sku_id=row.sku_id,
            sku_codigo=row.sku_codigo,
            sku_descripcion=row.sku_descripcion,
            bodega_id=row.bodega_id,
            bodega_nombre=row.bodega_nombre,
            lote_numero=row.lote_numero or None,
            cantidad=row.cantidad,
            cantidad_reservada=reservas_map.get(row.sku_id, 0.0),
            cantidad_disponible=row.cantidad - reservas_map.get(row.sku_id, 0.0),
            cantidad_minima=row.cantidad_minima,
            cantidad_maxima=row.cantidad_maxima,
            updated_at=row.updated_at,
        )
        for row in rows
    ]


@router.put("/stock/{stock_id}", response_model=StockResponse)
async def update_stock_config(
    stock_id: int,
    cantidad_minima: float | None = Query(None),
    cantidad_maxima: float | None = Query(None),
    db: AsyncSession = Depends(get_db),
    empresa: Empresa = Depends(get_current_empresa),
    _=Depends(require_admin),
):
    result = await db.execute(
        select(Stock).where(Stock.id == stock_id, Stock.empresa_id == empresa.id)
    )
    stock = result.scalar_one_or_none()
    if stock is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stock no encontrado")
    if cantidad_minima is not None:
        stock.cantidad_minima = cantidad_minima
    if cantidad_maxima is not None:
        stock.cantidad_maxima = cantidad_maxima
    await db.flush()
    await db.refresh(stock)
    return StockResponse(
        id=stock.id,
        sku_id=stock.sku_id,
        sku_codigo="",
        sku_descripcion="",
        bodega_id=stock.bodega_id,
        bodega_nombre="",
        cantidad=stock.cantidad,
        cantidad_minima=stock.cantidad_minima,
        cantidad_maxima=stock.cantidad_maxima,
        updated_at=stock.updated_at,
    )


# ─── ALERTAS STOCK ────────────────────────────────────────

@router.get("/alertas-stock", response_model=list[AlertaStockResponse])
async def alertas_stock(db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa)):
    stmt = (
        select(
            Stock.id,
            Stock.sku_id,
            SKU.codigo_sku.label("sku_codigo"),
            SKU.descripcion.label("sku_descripcion"),
            Stock.bodega_id,
            Bodega.nombre.label("bodega_nombre"),
            Stock.cantidad,
            Stock.cantidad_minima,
            Stock.cantidad_maxima,
        )
        .join(SKU, Stock.sku_id == SKU.id)
        .join(Bodega, Stock.bodega_id == Bodega.id)
        .where(
            Stock.empresa_id == empresa.id,
            (Stock.cantidad_minima.isnot(None) & (Stock.cantidad <= Stock.cantidad_minima))
            | (Stock.cantidad_maxima.isnot(None) & (Stock.cantidad >= Stock.cantidad_maxima)),
        )
    )
    result = await db.execute(stmt)
    rows = result.fetchall()

    alertas = []
    for row in rows:
        tipo = ""
        if row.cantidad_minima is not None and row.cantidad <= row.cantidad_minima:
            tipo = "bajo_minimo"
        elif row.cantidad_maxima is not None and row.cantidad >= row.cantidad_maxima:
            tipo = "sobre_maximo"
        alertas.append(AlertaStockResponse(
            id=row.id,
            sku_id=row.sku_id,
            sku_codigo=row.sku_codigo,
            sku_descripcion=row.sku_descripcion,
            bodega_id=row.bodega_id,
            bodega_nombre=row.bodega_nombre,
            cantidad=row.cantidad,
            cantidad_minima=row.cantidad_minima,
            cantidad_maxima=row.cantidad_maxima,
            tipo_alerta=tipo,
        ))
    return alertas


# ─── MOVIMIENTOS ───────────────────────────────────────────

@router.get("/movimientos", response_model=list[MovimientoResponse])
async def list_movimientos(
    bodega_id: int | None = Query(None),
    sku_id: int | None = Query(None),
    tipo: str | None = Query(None),
    motivo: str | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    empresa: Empresa = Depends(get_current_empresa),
):
    stmt = (
        select(
            MovimientoInventario.id,
            MovimientoInventario.tipo,
            MovimientoInventario.motivo,
            MovimientoInventario.sku_id,
            SKU.codigo_sku.label("sku_codigo"),
            MovimientoInventario.bodega_id,
            Bodega.nombre.label("bodega_nombre"),
            MovimientoInventario.cantidad,
            MovimientoInventario.costo_unitario,
            MovimientoInventario.costo_total,
            MovimientoInventario.fecha,
            MovimientoInventario.referencia,
            MovimientoInventario.documento_origen,
            MovimientoInventario.usuario_id,
        )
        .join(SKU, MovimientoInventario.sku_id == SKU.id)
        .join(Bodega, MovimientoInventario.bodega_id == Bodega.id)
        .where(MovimientoInventario.empresa_id == empresa.id)
    )
    if bodega_id:
        stmt = stmt.where(MovimientoInventario.bodega_id == bodega_id)
    if sku_id:
        stmt = stmt.where(MovimientoInventario.sku_id == sku_id)
    if tipo:
        stmt = stmt.where(MovimientoInventario.tipo == tipo)
    if motivo:
        stmt = stmt.where(MovimientoInventario.motivo == motivo)
    stmt = stmt.order_by(MovimientoInventario.fecha.desc()).offset(skip).limit(limit)
    result = await db.execute(stmt)
    rows = result.fetchall()
    return [dict(row._mapping) for row in rows]


@router.post("/movimientos", response_model=MovimientoResponse, status_code=status.HTTP_201_CREATED)
async def create_movimiento(
    body: MovimientoCreate,
    db: AsyncSession = Depends(get_db),
    empresa: Empresa = Depends(get_current_empresa),
    current_user: Usuario = Depends(get_current_user),
):
    try:
        tipo = TipoMovimiento(body.tipo)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tipo inválido (entrada/salida)")

    motivo = None
    if body.motivo:
        try:
            motivo = MotivoMovimiento(body.motivo)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Motivo inválido")

    sku_result = await db.execute(select(SKU).where(SKU.id == body.sku_id, SKU.empresa_id == empresa.id))
    sku = sku_result.scalar_one_or_none()
    if sku is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SKU no encontrado")

    bodega_result = await db.execute(select(Bodega).where(Bodega.id == body.bodega_id, Bodega.empresa_id == empresa.id))
    bodega = bodega_result.scalar_one_or_none()
    if bodega is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bodega no encontrada")

    if tipo == TipoMovimiento.SALIDA:
        try:
            await validar_stock_disponible(db, empresa.id, body.sku_id, body.bodega_id, body.cantidad)
        except StockInsuficiente as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    costo_unitario = body.costo_unitario if body.costo_unitario > 0 else sku.costo_unitario
    costo_total = round(body.cantidad * costo_unitario, 2)

    movimiento = MovimientoInventario(
        empresa_id=empresa.id,
        tipo=tipo,
        motivo=motivo,
        sku_id=body.sku_id,
        bodega_id=body.bodega_id,
        cantidad=body.cantidad,
        costo_unitario=costo_unitario,
        costo_total=costo_total,
        referencia=body.referencia,
        documento_origen=body.documento_origen,
        usuario_id=current_user.id,
    )
    db.add(movimiento)

    if tipo == TipoMovimiento.ENTRADA and body.costo_unitario > 0:
        sku.costo_unitario = await calcular_pmp_entrada(db, sku, body.cantidad, body.costo_unitario)

    await actualizar_stock(db, empresa.id, body.sku_id, body.bodega_id, body.cantidad, tipo)

    await db.flush()
    await db.refresh(movimiento)

    return MovimientoResponse(
        id=movimiento.id,
        tipo=movimiento.tipo.value,
        motivo=movimiento.motivo.value if movimiento.motivo else None,
        sku_id=movimiento.sku_id,
        sku_codigo=sku.codigo_sku,
        bodega_id=movimiento.bodega_id,
        bodega_nombre=bodega.nombre,
        cantidad=movimiento.cantidad,
        costo_unitario=movimiento.costo_unitario,
        costo_total=movimiento.costo_total,
        fecha=movimiento.fecha,
        referencia=movimiento.referencia,
        documento_origen=movimiento.documento_origen,
        usuario_id=movimiento.usuario_id,
    )


# ─── TRANSFERENCIAS ────────────────────────────────────────

@router.post("/transferencias")
async def transferir(
    body: TransferenciaCreate,
    db: AsyncSession = Depends(get_db),
    empresa: Empresa = Depends(get_current_empresa),
    current_user: Usuario = Depends(get_current_user),
):
    if body.bodega_origen_id == body.bodega_destino_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Origen y destino deben ser diferentes")

    sku_result = await db.execute(select(SKU).where(SKU.id == body.sku_id, SKU.empresa_id == empresa.id))
    sku = sku_result.scalar_one_or_none()
    if sku is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SKU no encontrado")

    try:
        salida, entrada = await crear_transferencia(
            db=db,
            empresa_id=empresa.id,
            sku_id=body.sku_id,
            bodega_origen_id=body.bodega_origen_id,
            bodega_destino_id=body.bodega_destino_id,
            cantidad=body.cantidad,
            costo_unitario=sku.costo_unitario,
            usuario_id=current_user.id,
            referencia=body.referencia,
        )
    except StockInsuficiente as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    await db.flush()
    return {
        "message": "Transferencia completada",
        "salida_id": salida.id,
        "entrada_id": entrada.id,
    }


# ─── KARDEX ────────────────────────────────────────────────

@router.get("/kardex/{sku_id}", response_model=list[KardexItemResponse])
async def kardex(
    sku_id: int,
    fecha_desde: str | None = Query(None),
    fecha_hasta: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    empresa: Empresa = Depends(get_current_empresa),
):
    sku = await db.execute(select(SKU).where(SKU.id == sku_id, SKU.empresa_id == empresa.id))
    if sku.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SKU no encontrado")
    return await generar_kardex(db, empresa.id, sku_id, fecha_desde, fecha_hasta)


# ─── RESERVAS ──────────────────────────────────────────────

@router.get("/reservas", response_model=list[ReservaResponse])
async def list_reservas(db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa)):
    result = await db.execute(
        select(
            ReservaStock.id,
            ReservaStock.sku_id,
            SKU.codigo_sku.label("sku_codigo"),
            SKU.descripcion.label("sku_descripcion"),
            ReservaStock.bodega_id,
            Bodega.nombre.label("bodega_nombre"),
            ReservaStock.cantidad,
            ReservaStock.referencia,
            ReservaStock.fecha_creacion,
            ReservaStock.fecha_expiracion,
            ReservaStock.usuario_id,
        )
        .join(SKU, ReservaStock.sku_id == SKU.id)
        .join(Bodega, ReservaStock.bodega_id == Bodega.id)
        .where(ReservaStock.empresa_id == empresa.id)
        .order_by(ReservaStock.fecha_creacion.desc())
    )
    rows = result.fetchall()
    return [dict(row._mapping) for row in rows]


@router.post("/reservas", response_model=ReservaResponse, status_code=status.HTTP_201_CREATED)
async def create_reserva(
    body: ReservaCreate,
    db: AsyncSession = Depends(get_db),
    empresa: Empresa = Depends(get_current_empresa),
    current_user: Usuario = Depends(get_current_user),
):
    try:
        await validar_stock_disponible(db, empresa.id, body.sku_id, body.bodega_id, body.cantidad)
    except StockInsuficiente as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    reserva = ReservaStock(
        empresa_id=empresa.id,
        sku_id=body.sku_id,
        bodega_id=body.bodega_id,
        cantidad=body.cantidad,
        referencia=body.referencia,
        fecha_expiracion=body.fecha_expiracion,
        usuario_id=current_user.id,
    )
    db.add(reserva)
    await db.flush()
    await db.refresh(reserva)

    sku = (await db.execute(select(SKU).where(SKU.id == body.sku_id, SKU.empresa_id == empresa.id))).scalar_one()
    bodega = (await db.execute(select(Bodega).where(Bodega.id == body.bodega_id, Bodega.empresa_id == empresa.id))).scalar_one()

    return ReservaResponse(
        id=reserva.id,
        sku_id=reserva.sku_id,
        sku_codigo=sku.codigo_sku,
        sku_descripcion=sku.descripcion,
        bodega_id=reserva.bodega_id,
        bodega_nombre=bodega.nombre,
        cantidad=reserva.cantidad,
        referencia=reserva.referencia,
        fecha_creacion=reserva.fecha_creacion,
        fecha_expiracion=reserva.fecha_expiracion,
        usuario_id=reserva.usuario_id,
    )


@router.delete("/reservas/{reserva_id}")
async def delete_reserva(
    reserva_id: int,
    db: AsyncSession = Depends(get_db),
    empresa: Empresa = Depends(get_current_empresa),
):
    result = await db.execute(select(ReservaStock).where(ReservaStock.id == reserva_id, ReservaStock.empresa_id == empresa.id))
    reserva = result.scalar_one_or_none()
    if reserva is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reserva no encontrada")
    await db.delete(reserva)
    await db.flush()
    return {"message": "Reserva cancelada"}


# ─── INVENTARIO FÍSICO ────────────────────────────────────

@router.get("/conteos", response_model=list[ConteoResponse])
async def list_conteos(
    estado: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    empresa: Empresa = Depends(get_current_empresa),
):
    stmt = select(InventarioFisico).where(InventarioFisico.empresa_id == empresa.id).options(
        selectinload(InventarioFisico.bodega),
        selectinload(InventarioFisico.items).selectinload(ItemInventarioFisico.sku),
    )
    if estado:
        try:
            estado_enum = EstadoConteo(estado)
            stmt = stmt.where(InventarioFisico.estado == estado_enum)
        except ValueError:
            pass
    stmt = stmt.order_by(InventarioFisico.fecha.desc())
    result = await db.execute(stmt)
    conteos = result.scalars().unique().all()
    return [
        ConteoResponse(
            id=c.id, bodega_id=c.bodega_id, bodega_nombre=c.bodega.nombre, fecha=c.fecha,
            estado=c.estado.value, usuario_id=c.usuario_id, created_at=c.created_at,
            items=[ItemConteoResponse(
                id=item.id, sku_id=item.sku_id, sku_codigo=item.sku.codigo_sku,
                sku_descripcion=item.sku.descripcion, cantidad_esperada=item.cantidad_esperada,
                cantidad_contada=item.cantidad_contada,
                diferencia=(item.cantidad_contada - item.cantidad_esperada) if item.cantidad_contada is not None else None,
                observaciones=item.observaciones,
            ) for item in c.items],
        ) for c in conteos
    ]


@router.post("/conteos", response_model=ConteoResponse, status_code=status.HTTP_201_CREATED)
async def crear_conteo(body: ConteoCreate, db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa), current_user: Usuario = Depends(get_current_user)):
    bodega = await db.execute(select(Bodega).where(Bodega.id == body.bodega_id, Bodega.empresa_id == empresa.id))
    if bodega.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bodega no encontrada")
    stock_rows = await db.execute(select(Stock).where(Stock.bodega_id == body.bodega_id, Stock.empresa_id == empresa.id))
    stocks = stock_rows.scalars().all()
    if not stocks:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La bodega no tiene stock registrado")
    conteo = InventarioFisico(empresa_id=empresa.id, bodega_id=body.bodega_id, usuario_id=current_user.id)
    items = []
    for s in stocks:
        sku = (await db.execute(select(SKU).where(SKU.id == s.sku_id))).scalar_one()
        items.append(ItemInventarioFisico(sku_id=s.sku_id, cantidad_esperada=s.cantidad))
        items[-1].sku = sku
    conteo.items = items
    db.add(conteo)
    await db.flush()
    result = await db.execute(
        select(InventarioFisico)
        .where(InventarioFisico.id == conteo.id)
        .options(
            selectinload(InventarioFisico.bodega),
            selectinload(InventarioFisico.items).selectinload(ItemInventarioFisico.sku),
        )
    )
    conteo = result.scalar_one()
    bodega_obj = (await db.execute(select(Bodega).where(Bodega.id == body.bodega_id))).scalar_one()
    return ConteoResponse(
        id=conteo.id, bodega_id=conteo.bodega_id, bodega_nombre=bodega_obj.nombre,
        fecha=conteo.fecha, estado=conteo.estado.value, usuario_id=conteo.usuario_id, created_at=conteo.created_at,
        items=[ItemConteoResponse(
            id=item.id, sku_id=item.sku_id, sku_codigo=item.sku.codigo_sku,
            sku_descripcion=item.sku.descripcion, cantidad_esperada=item.cantidad_esperada,
            cantidad_contada=item.cantidad_contada, diferencia=None, observaciones=item.observaciones,
        ) for item in conteo.items],
    )


@router.get("/conteos/{conteo_id}", response_model=ConteoResponse)
async def get_conteo(conteo_id: int, db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa)):
    result = await db.execute(
        select(InventarioFisico).where(InventarioFisico.id == conteo_id, InventarioFisico.empresa_id == empresa.id)
        .options(
            selectinload(InventarioFisico.bodega),
            selectinload(InventarioFisico.items).selectinload(ItemInventarioFisico.sku),
        )
    )
    c = result.scalar_one_or_none()
    if c is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conteo no encontrado")
    return ConteoResponse(
        id=c.id, bodega_id=c.bodega_id, bodega_nombre=c.bodega.nombre, fecha=c.fecha,
        estado=c.estado.value, usuario_id=c.usuario_id, created_at=c.created_at,
        items=[ItemConteoResponse(
            id=item.id, sku_id=item.sku_id, sku_codigo=item.sku.codigo_sku,
            sku_descripcion=item.sku.descripcion, cantidad_esperada=item.cantidad_esperada,
            cantidad_contada=item.cantidad_contada,
            diferencia=(item.cantidad_contada - item.cantidad_esperada) if item.cantidad_contada is not None else None,
            observaciones=item.observaciones,
        ) for item in c.items],
    )


@router.put("/conteos/{conteo_id}/items/{item_id}", response_model=ItemConteoResponse)
async def actualizar_item_conteo(
    conteo_id: int, item_id: int,
    cantidad_contada: float = Query(...),
    observaciones: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    empresa: Empresa = Depends(get_current_empresa),
):
    result = await db.execute(
        select(InventarioFisico).where(InventarioFisico.id == conteo_id, InventarioFisico.empresa_id == empresa.id)
        .options(
            selectinload(InventarioFisico.bodega),
            selectinload(InventarioFisico.items).selectinload(ItemInventarioFisico.sku),
        )
    )
    conteo = result.scalar_one_or_none()
    if conteo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conteo no encontrado")
    if conteo.estado != EstadoConteo.ABIERTO:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El conteo no está abierto")
    item = next((i for i in conteo.items if i.id == item_id), None)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item no encontrado")
    item.cantidad_contada = cantidad_contada
    item.observaciones = observaciones
    await db.flush()
    await db.refresh(item)
    return ItemConteoResponse(
        id=item.id, sku_id=item.sku_id, sku_codigo=item.sku.codigo_sku,
        sku_descripcion=item.sku.descripcion, cantidad_esperada=item.cantidad_esperada,
        cantidad_contada=item.cantidad_contada,
        diferencia=(item.cantidad_contada - item.cantidad_esperada) if item.cantidad_contada is not None else None,
        observaciones=item.observaciones,
    )


@router.post("/conteos/{conteo_id}/ajustar")
async def ajustar_conteo(conteo_id: int, db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa), current_user: Usuario = Depends(get_current_user)):
    result = await db.execute(
        select(InventarioFisico).where(InventarioFisico.id == conteo_id, InventarioFisico.empresa_id == empresa.id)
        .options(
            selectinload(InventarioFisico.bodega),
            selectinload(InventarioFisico.items).selectinload(ItemInventarioFisico.sku),
        )
    )
    conteo = result.scalar_one_or_none()
    if conteo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conteo no encontrado")
    if conteo.estado != EstadoConteo.ABIERTO:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El conteo ya fue procesado")
    movimientos_creados = []
    for item in conteo.items:
        if item.cantidad_contada is None:
            continue
        diferencia = item.cantidad_contada - item.cantidad_esperada
        if diferencia == 0:
            continue
        tipo = TipoMovimiento.ENTRADA if diferencia > 0 else TipoMovimiento.SALIDA
        cantidad = abs(diferencia)
        movimiento = MovimientoInventario(
            empresa_id=empresa.id,
            tipo=tipo,
            motivo=MotivoMovimiento.AJUSTE,
            sku_id=item.sku_id,
            bodega_id=conteo.bodega_id,
            cantidad=cantidad,
            referencia=f"Ajuste por inventario físico #{conteo.id}",
            usuario_id=current_user.id,
        )
        db.add(movimiento)
        await actualizar_stock(db, empresa.id, item.sku_id, conteo.bodega_id, cantidad, tipo)
        movimientos_creados.append(item.sku_id)
    conteo.estado = EstadoConteo.AJUSTADO
    await db.flush()
    return {"message": "Ajustes aplicados", "items_ajustados": len(movimientos_creados)}

# ─── LOTES ─────────────────────────────────────────────────

@router.get("/lotes")
async def list_lotes(sku_id: int | None = None, db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa)):
    stmt = select(Lote).where(Lote.empresa_id == empresa.id).options(selectinload(Lote.sku)).order_by(Lote.numero_lote)
    if sku_id:
        stmt = stmt.where(Lote.sku_id == sku_id)
    result = await db.execute(stmt)
    lotes = result.scalars().all()
    return [{"id": lote.id, "sku_id": lote.sku_id, "sku_codigo": lote.sku.codigo_sku, "numero_lote": lote.numero_lote,
             "fecha_fabricacion": lote.fecha_fabricacion, "fecha_vencimiento": lote.fecha_vencimiento,
             "activo": lote.activo, "created_at": lote.created_at} for lote in lotes]


@router.post("/lotes", status_code=status.HTTP_201_CREATED)
async def create_lote(body: dict, db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa)):
    sku = (await db.execute(select(SKU).where(SKU.id == body["sku_id"], SKU.empresa_id == empresa.id))).scalar_one_or_none()
    if sku is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SKU no encontrado")
    existing = await db.execute(select(Lote).where(Lote.empresa_id == empresa.id, Lote.sku_id == body["sku_id"], Lote.numero_lote == body["numero_lote"]))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El lote ya existe para este SKU")

    ff = body.get("fecha_fabricacion")
    fv = body.get("fecha_vencimiento")
    lote = Lote(
        empresa_id=empresa.id,
        sku_id=body["sku_id"],
        numero_lote=body["numero_lote"],
        fecha_fabricacion=datetime.fromisoformat(ff) if ff else None,
        fecha_vencimiento=datetime.fromisoformat(fv) if fv else None,
    )
    db.add(lote)
    await db.flush()
    await db.refresh(lote)
    return {"id": lote.id, "sku_id": lote.sku_id, "sku_codigo": sku.codigo_sku, "numero_lote": lote.numero_lote,
            "fecha_fabricacion": lote.fecha_fabricacion, "fecha_vencimiento": lote.fecha_vencimiento,
            "activo": lote.activo, "created_at": lote.created_at}


@router.get("/lotes/alertas-vencimiento")
async def alertas_vencimiento(db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa)):
    en_30_dias = datetime.now(timezone.utc) + timedelta(days=30)
    result = await db.execute(
        select(Lote).options(selectinload(Lote.sku)).where(
            Lote.empresa_id == empresa.id,
            Lote.fecha_vencimiento.isnot(None),
            Lote.fecha_vencimiento <= en_30_dias,
            Lote.activo.is_(True),
        ).order_by(Lote.fecha_vencimiento)
    )
    lotes = result.scalars().all()
    hoy = datetime.now(timezone.utc)
    return [{
        "id": lote.id, "sku_id": lote.sku_id, "sku_codigo": lote.sku.codigo_sku,
        "sku_descripcion": lote.sku.descripcion, "numero_lote": lote.numero_lote,
        "fecha_vencimiento": lote.fecha_vencimiento,
        "dias_restantes": (lote.fecha_vencimiento - hoy).days if lote.fecha_vencimiento else None,
    } for lote in lotes]

# ─── REPORTES ──────────────────────────────────────────────

@router.get("/reportes/valorizado")
async def reporte_valorizado(db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa)):
    result = await db.execute(
        select(
            SKU.codigo_sku, SKU.descripcion, SKU.categoria,
            func.coalesce(func.sum(Stock.cantidad), 0.0).label("total_cantidad"),
            SKU.costo_unitario,
            func.coalesce(func.sum(Stock.cantidad * SKU.costo_unitario), 0.0).label("valor_total"),
        )
        .outerjoin(Stock, Stock.sku_id == SKU.id)
        .where(SKU.empresa_id == empresa.id)
        .group_by(SKU.id)
        .order_by(SKU.codigo_sku)
    )
    rows = result.fetchall()
    gran_total = sum(r.valor_total for r in rows)
    return {
        "items": [{"codigo_sku": r.codigo_sku, "descripcion": r.descripcion, "categoria": r.categoria,
                    "cantidad": float(r.total_cantidad), "costo_unitario": r.costo_unitario,
                    "valor_total": float(r.valor_total)} for r in rows],
        "valor_total_inventario": round(gran_total, 2),
    }


@router.get("/reportes/rotacion")
async def reporte_rotacion(dias: int = 30, db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa)):
    desde = datetime.now(timezone.utc) - timedelta(days=dias)
    entradas = (
        select(MovimientoInventario.sku_id, func.sum(MovimientoInventario.cantidad).label("entradas"))
        .where(MovimientoInventario.empresa_id == empresa.id, MovimientoInventario.tipo == TipoMovimiento.ENTRADA, MovimientoInventario.fecha >= desde)
        .group_by(MovimientoInventario.sku_id)
    ).subquery()
    salidas = (
        select(MovimientoInventario.sku_id, func.sum(MovimientoInventario.cantidad).label("salidas"))
        .where(MovimientoInventario.empresa_id == empresa.id, MovimientoInventario.tipo == TipoMovimiento.SALIDA, MovimientoInventario.fecha >= desde)
        .group_by(MovimientoInventario.sku_id)
    ).subquery()
    result = await db.execute(
        select(
            SKU.id, SKU.codigo_sku, SKU.descripcion,
            func.coalesce(entradas.c.entradas, 0.0).label("entradas"),
            func.coalesce(salidas.c.salidas, 0.0).label("salidas"),
        )
        .outerjoin(entradas, SKU.id == entradas.c.sku_id)
        .outerjoin(salidas, SKU.id == salidas.c.sku_id)
        .where(SKU.empresa_id == empresa.id, (entradas.c.entradas.isnot(None)) | (salidas.c.salidas.isnot(None)))
        .order_by(func.coalesce(salidas.c.salidas, 0.0).desc())
    )
    rows = result.fetchall()
    return [{"sku_id": r.id, "codigo_sku": r.codigo_sku, "descripcion": r.descripcion,
             "entradas": float(r.entradas), "salidas": float(r.salidas),
             "rotacion": float(r.salidas)} for r in rows]


@router.get("/reportes/sin-movimiento")
async def reporte_sin_movimiento(dias: int = 60, db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa)):
    desde = datetime.now(timezone.utc) - timedelta(days=dias)
    mov_sub = (
        select(MovimientoInventario.sku_id)
        .where(MovimientoInventario.empresa_id == empresa.id, MovimientoInventario.fecha >= desde)
        .distinct()
    ).subquery()
    result = await db.execute(
        select(SKU.codigo_sku, SKU.descripcion, Stock.cantidad, Bodega.nombre.label("bodega"))
        .join(Stock, Stock.sku_id == SKU.id)
        .join(Bodega, Stock.bodega_id == Bodega.id)
        .where(SKU.empresa_id == empresa.id, SKU.id.notin_(select(mov_sub.c.sku_id)), Stock.cantidad > 0)
        .order_by(SKU.codigo_sku)
    )
    rows = result.fetchall()
    return [{"codigo_sku": r.codigo_sku, "descripcion": r.descripcion, "cantidad": float(r.cantidad), "bodega": r.bodega} for r in rows]

# ─── UBICACIONES ──────────────────────────────────────────

@router.get("/ubicaciones")
async def list_ubicaciones(bodega_id: int | None = None, db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa)):
    stmt = select(Ubicacion).where(Ubicacion.empresa_id == empresa.id).options(selectinload(Ubicacion.bodega))
    if bodega_id:
        stmt = stmt.where(Ubicacion.bodega_id == bodega_id)
    stmt = stmt.order_by(Ubicacion.bodega_id, Ubicacion.codigo)
    result = await db.execute(stmt)
    ubis = result.scalars().all()
    return [{"id": u.id, "bodega_id": u.bodega_id, "bodega_nombre": u.bodega.nombre, "codigo": u.codigo, "descripcion": u.descripcion, "activa": u.activa} for u in ubis]


@router.post("/ubicaciones", status_code=status.HTTP_201_CREATED)
async def create_ubicacion(body: dict, db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa), _=Depends(require_admin)):
    bodega = (await db.execute(select(Bodega).where(Bodega.id == body["bodega_id"], Bodega.empresa_id == empresa.id))).scalar_one_or_none()
    if bodega is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bodega no encontrada")
    existing = await db.execute(select(Ubicacion).where(Ubicacion.empresa_id == empresa.id, Ubicacion.bodega_id == body["bodega_id"], Ubicacion.codigo == body["codigo"]))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El código ya existe en esta bodega")
    u = Ubicacion(empresa_id=empresa.id, bodega_id=body["bodega_id"], codigo=body["codigo"], descripcion=body.get("descripcion"))
    db.add(u)
    await db.flush()
    await db.refresh(u)
    return {"id": u.id, "bodega_id": u.bodega_id, "bodega_nombre": bodega.nombre, "codigo": u.codigo, "descripcion": u.descripcion, "activa": u.activa}


@router.delete("/ubicaciones/{ubicacion_id}")
async def delete_ubicacion(ubicacion_id: int, db: AsyncSession = Depends(get_db), empresa: Empresa = Depends(get_current_empresa), _=Depends(require_admin)):
    result = await db.execute(select(Ubicacion).where(Ubicacion.id == ubicacion_id, Ubicacion.empresa_id == empresa.id))
    u = result.scalar_one_or_none()
    if u is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ubicación no encontrada")
    await db.delete(u)
    await db.flush()
    return {"message": "Ubicación eliminada"}
