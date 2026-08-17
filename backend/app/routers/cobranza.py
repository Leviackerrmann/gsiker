from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_empresa, get_current_user, require_admin, requiere_permiso
from app.models.cobranza import CuentaPorCobrar, EstadoCxC, MetodoAbono
from app.models.empresa import Empresa
from app.models.usuario import Usuario
from app.schemas.cobranza import (
    AbonoRequest,
    AbonoResponse,
    CrearCuentaRequest,
    CuentaDetalleResponse,
    CuentaResponse,
    EstadoCuentaResponse,
    ResumenCobranzaResponse,
)
from app.services import cobranza as cobranza_service

router = APIRouter(
    prefix="/api/cobranza",
    tags=["cobranza"],
    dependencies=[Depends(requiere_permiso("cobranza"))],
)


def _bad_request(exc: Exception) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


def _metodo(valor: str) -> MetodoAbono:
    try:
        return MetodoAbono(valor)
    except ValueError:
        raise _bad_request(Exception(f"Método de pago inválido: {valor}"))


async def _cargar_cuenta(db: AsyncSession, empresa_id: int, cuenta_id: int) -> CuentaPorCobrar:
    result = await db.execute(
        select(CuentaPorCobrar)
        .where(CuentaPorCobrar.id == cuenta_id, CuentaPorCobrar.empresa_id == empresa_id)
        .options(selectinload(CuentaPorCobrar.abonos))
    )
    cuenta = result.scalar_one_or_none()
    if cuenta is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cuenta por cobrar no encontrada")
    return cuenta


@router.post("/cuentas", response_model=CuentaResponse, status_code=status.HTTP_201_CREATED)
async def crear_cuenta(
    body: CrearCuentaRequest,
    db: AsyncSession = Depends(get_db),
    empresa: Empresa = Depends(get_current_empresa),
    current_user: Usuario = Depends(get_current_user),
):
    try:
        return await cobranza_service.crear_cuenta(
            db,
            empresa.id,
            cliente_id=body.cliente_id,
            monto_total=body.monto_total,
            concepto=body.concepto,
            moneda=body.moneda,
            fecha_vencimiento=body.fecha_vencimiento,
            notas=body.notas,
            usuario_id=current_user.id,
        )
    except cobranza_service.CobranzaError as exc:
        raise _bad_request(exc)


@router.get("/cuentas", response_model=list[CuentaResponse])
async def listar_cuentas(
    cliente_id: int | None = None,
    estado: str | None = None,
    db: AsyncSession = Depends(get_db),
    empresa: Empresa = Depends(get_current_empresa),
    _current_user: Usuario = Depends(get_current_user),
):
    stmt = (
        select(CuentaPorCobrar)
        .where(CuentaPorCobrar.empresa_id == empresa.id)
        .order_by(CuentaPorCobrar.fecha.desc())
    )
    if cliente_id is not None:
        stmt = stmt.where(CuentaPorCobrar.cliente_id == cliente_id)
    if estado is not None:
        try:
            stmt = stmt.where(CuentaPorCobrar.estado == EstadoCxC(estado))
        except ValueError:
            raise _bad_request(Exception(f"Estado inválido: {estado}"))
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.get("/resumen", response_model=ResumenCobranzaResponse)
async def resumen(
    db: AsyncSession = Depends(get_db),
    empresa: Empresa = Depends(get_current_empresa),
    _current_user: Usuario = Depends(get_current_user),
):
    return await cobranza_service.resumen_cobranza(db, empresa.id)


@router.get("/clientes/{cliente_id}/estado-cuenta", response_model=EstadoCuentaResponse)
async def estado_cuenta(
    cliente_id: int,
    db: AsyncSession = Depends(get_db),
    empresa: Empresa = Depends(get_current_empresa),
    _current_user: Usuario = Depends(get_current_user),
):
    try:
        return await cobranza_service.estado_cuenta_cliente(db, empresa.id, cliente_id)
    except cobranza_service.CobranzaError as exc:
        raise _bad_request(exc)


@router.get("/cuentas/{cuenta_id}", response_model=CuentaDetalleResponse)
async def obtener_cuenta(
    cuenta_id: int,
    db: AsyncSession = Depends(get_db),
    empresa: Empresa = Depends(get_current_empresa),
    _current_user: Usuario = Depends(get_current_user),
):
    return await _cargar_cuenta(db, empresa.id, cuenta_id)


@router.post("/cuentas/{cuenta_id}/abonos", response_model=AbonoResponse, status_code=status.HTTP_201_CREATED)
async def registrar_abono(
    cuenta_id: int,
    body: AbonoRequest,
    db: AsyncSession = Depends(get_db),
    empresa: Empresa = Depends(get_current_empresa),
    current_user: Usuario = Depends(get_current_user),
):
    try:
        return await cobranza_service.registrar_abono(
            db,
            empresa.id,
            cuenta_id=cuenta_id,
            monto=body.monto,
            metodo=_metodo(body.metodo),
            notas=body.notas,
            usuario_id=current_user.id,
        )
    except cobranza_service.CobranzaError as exc:
        raise _bad_request(exc)


@router.post("/cuentas/{cuenta_id}/anular", response_model=CuentaResponse)
async def anular_cuenta(
    cuenta_id: int,
    db: AsyncSession = Depends(get_db),
    empresa: Empresa = Depends(get_current_empresa),
    _admin: Usuario = Depends(require_admin),
):
    try:
        return await cobranza_service.anular_cuenta(db, empresa.id, cuenta_id)
    except cobranza_service.CobranzaError as exc:
        raise _bad_request(exc)
