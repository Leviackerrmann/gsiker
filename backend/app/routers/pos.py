from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_empresa, get_current_user, require_admin, requiere_permiso
from app.models.empresa import Empresa
from app.models.pos import CajaSesion, EstadoVentaPOS, MetodoPago, Pago, VentaPOS
from app.models.usuario import Usuario
from app.schemas.pos import (
    AbrirCajaRequest,
    CajaSesionResponse,
    CerrarCajaRequest,
    ResumenDiaResponse,
    VentaPOSRequest,
    VentaPOSResponse,
)
from app.services import pos as pos_service
from app.services.inventario import StockInsuficiente

router = APIRouter(
    prefix="/api/pos",
    tags=["pos"],
    dependencies=[Depends(requiere_permiso("pos"))],
)


def _bad_request(exc: Exception) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


async def _cargar_venta(db: AsyncSession, empresa_id: int, venta_id: int) -> VentaPOS:
    result = await db.execute(
        select(VentaPOS)
        .where(VentaPOS.id == venta_id, VentaPOS.empresa_id == empresa_id)
        .options(selectinload(VentaPOS.items), selectinload(VentaPOS.pagos))
    )
    venta = result.scalar_one_or_none()
    if venta is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Venta no encontrada")
    return venta


# --- Caja / arqueo ---

@router.post("/caja/abrir", response_model=CajaSesionResponse, status_code=status.HTTP_201_CREATED)
async def abrir_caja(
    body: AbrirCajaRequest,
    db: AsyncSession = Depends(get_db),
    empresa: Empresa = Depends(get_current_empresa),
    current_user: Usuario = Depends(get_current_user),
):
    try:
        return await pos_service.abrir_caja(db, empresa.id, current_user.id, body.monto_inicial)
    except pos_service.POSError as exc:
        raise _bad_request(exc)


@router.get("/caja/actual", response_model=CajaSesionResponse | None)
async def caja_actual(
    db: AsyncSession = Depends(get_db),
    empresa: Empresa = Depends(get_current_empresa),
    current_user: Usuario = Depends(get_current_user),
):
    return await pos_service.caja_abierta_de_usuario(db, empresa.id, current_user.id)


@router.post("/caja/{sesion_id}/cerrar", response_model=CajaSesionResponse)
async def cerrar_caja(
    sesion_id: int,
    body: CerrarCajaRequest,
    db: AsyncSession = Depends(get_db),
    empresa: Empresa = Depends(get_current_empresa),
    _admin: Usuario = Depends(require_admin),
):
    try:
        return await pos_service.cerrar_caja(db, empresa.id, sesion_id, body.monto_final_declarado)
    except pos_service.POSError as exc:
        raise _bad_request(exc)


# --- Ventas ---

@router.post("/ventas", response_model=VentaPOSResponse, status_code=status.HTTP_201_CREATED)
async def crear_venta(
    body: VentaPOSRequest,
    db: AsyncSession = Depends(get_db),
    empresa: Empresa = Depends(get_current_empresa),
    current_user: Usuario = Depends(get_current_user),
):
    try:
        venta = await pos_service.procesar_venta_pos(
            db,
            empresa_id=empresa.id,
            iva_porcentaje=empresa.iva_porcentaje,
            caja_sesion_id=body.caja_sesion_id,
            bodega_id=body.bodega_id,
            items_data=[it.model_dump() for it in body.items],
            pagos_data=[p.model_dump() for p in body.pagos],
            cliente_id=body.cliente_id,
            usuario_id=current_user.id,
            a_credito=body.a_credito,
            idempotency_key=body.idempotency_key,
        )
    except (pos_service.POSError, StockInsuficiente) as exc:
        raise _bad_request(exc)

    return await _cargar_venta(db, empresa.id, venta.id)


@router.get("/ventas", response_model=list[VentaPOSResponse])
async def listar_ventas(
    caja_sesion_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    empresa: Empresa = Depends(get_current_empresa),
    _current_user: Usuario = Depends(get_current_user),
):
    stmt = (
        select(VentaPOS)
        .where(VentaPOS.empresa_id == empresa.id)
        .options(selectinload(VentaPOS.items), selectinload(VentaPOS.pagos))
        .order_by(VentaPOS.fecha.desc())
    )
    if caja_sesion_id is not None:
        stmt = stmt.where(VentaPOS.caja_sesion_id == caja_sesion_id)
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.get("/ventas/{venta_id}", response_model=VentaPOSResponse)
async def obtener_venta(
    venta_id: int,
    db: AsyncSession = Depends(get_db),
    empresa: Empresa = Depends(get_current_empresa),
    _current_user: Usuario = Depends(get_current_user),
):
    return await _cargar_venta(db, empresa.id, venta_id)


@router.get("/resumen/hoy", response_model=ResumenDiaResponse)
async def resumen_hoy(
    db: AsyncSession = Depends(get_db),
    empresa: Empresa = Depends(get_current_empresa),
    _current_user: Usuario = Depends(get_current_user),
):
    """Resumen de ventas del día (dashboard del POS)."""
    hoy = datetime.now(timezone.utc)
    inicio = hoy.replace(hour=0, minute=0, second=0, microsecond=0)

    base = (
        VentaPOS.empresa_id == empresa.id,
        VentaPOS.estado == EstadoVentaPOS.COMPLETADA,
        VentaPOS.fecha >= inicio,
    )

    num_ventas = (await db.execute(select(func.count()).select_from(VentaPOS).where(*base))).scalar() or 0
    total = (await db.execute(select(func.coalesce(func.sum(VentaPOS.total), 0.0)).where(*base))).scalar() or 0.0

    por_metodo_rows = await db.execute(
        select(Pago.metodo, func.coalesce(func.sum(Pago.monto), 0.0))
        .join(VentaPOS, Pago.venta_pos_id == VentaPOS.id)
        .where(*base)
        .group_by(Pago.metodo)
    )
    por_metodo = {m.value if isinstance(m, MetodoPago) else str(m): round(v, 2) for m, v in por_metodo_rows.all()}

    return ResumenDiaResponse(
        fecha=inicio.date().isoformat(),
        num_ventas=num_ventas,
        total=round(total, 2),
        por_metodo=por_metodo,
    )
