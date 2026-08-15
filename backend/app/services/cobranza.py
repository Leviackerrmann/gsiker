"""Lógica de cobranza / cuentas por cobrar (el "fiado" formalizado).

Reglas de negocio:
- Una cuenta nace con `saldo_pendiente == monto_total` y estado PENDIENTE.
- Cada abono baja el saldo; no se permite abonar más que el saldo pendiente.
- El estado se recalcula: PENDIENTE (sin abonos) → PARCIAL (abonada en parte) →
  PAGADA (saldo 0). ANULADA es manual y no admite abonos.
- La antigüedad de saldos (aging) se calcula sobre `fecha_vencimiento` si existe,
  o sobre `fecha` de la cuenta en su defecto.
"""
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cobranza import (
    AbonoCxC,
    CuentaPorCobrar,
    EstadoCxC,
    MetodoAbono,
    OrigenCxC,
)
from app.models.ventas import Cliente

# Tolerancia para comparar montos en centavos (ruido de coma flotante).
_EPS = 0.005


class CobranzaError(ValueError):
    """Error de negocio de cobranza (se traduce a HTTP 400)."""


def _redondear(monto: float) -> float:
    return round(monto + 1e-9, 2)


def _recalcular_estado(cuenta: CuentaPorCobrar) -> None:
    """Ajusta el estado según el saldo (no toca cuentas ANULADAS)."""
    if cuenta.estado == EstadoCxC.ANULADA:
        return
    if cuenta.saldo_pendiente <= _EPS:
        cuenta.saldo_pendiente = 0.0
        cuenta.estado = EstadoCxC.PAGADA
    elif cuenta.saldo_pendiente < cuenta.monto_total - _EPS:
        cuenta.estado = EstadoCxC.PARCIAL
    else:
        cuenta.estado = EstadoCxC.PENDIENTE


async def _validar_cliente(db: AsyncSession, empresa_id: int, cliente_id: int) -> Cliente:
    result = await db.execute(
        select(Cliente).where(Cliente.id == cliente_id, Cliente.empresa_id == empresa_id)
    )
    cliente = result.scalar_one_or_none()
    if cliente is None:
        raise CobranzaError("Cliente no encontrado")
    return cliente


async def crear_cuenta(
    db: AsyncSession,
    empresa_id: int,
    *,
    cliente_id: int,
    monto_total: float,
    concepto: str | None = None,
    moneda: str = "GTQ",
    origen: OrigenCxC = OrigenCxC.MANUAL,
    origen_id: int | None = None,
    fecha_vencimiento: datetime | None = None,
    notas: str | None = None,
    usuario_id: int | None = None,
) -> CuentaPorCobrar:
    if monto_total <= 0:
        raise CobranzaError("El monto de la cuenta debe ser mayor a 0")
    await _validar_cliente(db, empresa_id, cliente_id)

    cuenta = CuentaPorCobrar(
        empresa_id=empresa_id,
        cliente_id=cliente_id,
        origen=origen,
        origen_id=origen_id,
        concepto=concepto,
        moneda=moneda,
        monto_total=_redondear(monto_total),
        saldo_pendiente=_redondear(monto_total),
        estado=EstadoCxC.PENDIENTE,
        fecha_vencimiento=fecha_vencimiento,
        notas=notas,
        usuario_id=usuario_id,
    )
    db.add(cuenta)
    await db.flush()
    return cuenta


async def registrar_abono(
    db: AsyncSession,
    empresa_id: int,
    *,
    cuenta_id: int,
    monto: float,
    metodo: MetodoAbono = MetodoAbono.EFECTIVO,
    notas: str | None = None,
    usuario_id: int | None = None,
) -> AbonoCxC:
    if monto <= 0:
        raise CobranzaError("El abono debe ser mayor a 0")

    result = await db.execute(
        select(CuentaPorCobrar).where(
            CuentaPorCobrar.id == cuenta_id, CuentaPorCobrar.empresa_id == empresa_id
        )
    )
    cuenta = result.scalar_one_or_none()
    if cuenta is None:
        raise CobranzaError("Cuenta por cobrar no encontrada")
    if cuenta.estado == EstadoCxC.ANULADA:
        raise CobranzaError("La cuenta está anulada")
    if cuenta.estado == EstadoCxC.PAGADA or cuenta.saldo_pendiente <= _EPS:
        raise CobranzaError("La cuenta ya está pagada")
    if monto > cuenta.saldo_pendiente + _EPS:
        raise CobranzaError(
            f"El abono ({monto:.2f}) excede el saldo pendiente ({cuenta.saldo_pendiente:.2f})"
        )

    abono = AbonoCxC(
        empresa_id=empresa_id,
        cuenta_id=cuenta.id,
        monto=_redondear(monto),
        metodo=metodo,
        notas=notas,
        usuario_id=usuario_id,
    )
    db.add(abono)

    cuenta.saldo_pendiente = _redondear(cuenta.saldo_pendiente - monto)
    _recalcular_estado(cuenta)
    await db.flush()
    return abono


async def anular_cuenta(db: AsyncSession, empresa_id: int, cuenta_id: int) -> CuentaPorCobrar:
    result = await db.execute(
        select(CuentaPorCobrar).where(
            CuentaPorCobrar.id == cuenta_id, CuentaPorCobrar.empresa_id == empresa_id
        )
    )
    cuenta = result.scalar_one_or_none()
    if cuenta is None:
        raise CobranzaError("Cuenta por cobrar no encontrada")
    if cuenta.estado == EstadoCxC.PAGADA:
        raise CobranzaError("No se puede anular una cuenta ya pagada")
    cuenta.estado = EstadoCxC.ANULADA
    await db.flush()
    return cuenta


def _dias_atraso(cuenta: CuentaPorCobrar, ahora: datetime) -> int:
    ref = cuenta.fecha_vencimiento or cuenta.fecha
    if ref.tzinfo is None:
        ref = ref.replace(tzinfo=timezone.utc)
    return (ahora - ref).days


async def estado_cuenta_cliente(db: AsyncSession, empresa_id: int, cliente_id: int) -> dict:
    """Estado de cuenta de un cliente: cuentas con saldo + antigüedad (aging)."""
    cliente = await _validar_cliente(db, empresa_id, cliente_id)

    result = await db.execute(
        select(CuentaPorCobrar)
        .where(
            CuentaPorCobrar.empresa_id == empresa_id,
            CuentaPorCobrar.cliente_id == cliente_id,
            CuentaPorCobrar.estado != EstadoCxC.ANULADA,
        )
        .order_by(CuentaPorCobrar.fecha)
    )
    cuentas = list(result.scalars().all())

    ahora = datetime.now(timezone.utc)
    aging = {"corriente": 0.0, "1_30": 0.0, "31_60": 0.0, "61_90": 0.0, "mas_90": 0.0}
    saldo_total = 0.0
    for c in cuentas:
        if c.saldo_pendiente <= _EPS:
            continue
        saldo_total += c.saldo_pendiente
        dias = _dias_atraso(c, ahora)
        if dias <= 0:
            aging["corriente"] += c.saldo_pendiente
        elif dias <= 30:
            aging["1_30"] += c.saldo_pendiente
        elif dias <= 60:
            aging["31_60"] += c.saldo_pendiente
        elif dias <= 90:
            aging["61_90"] += c.saldo_pendiente
        else:
            aging["mas_90"] += c.saldo_pendiente

    return {
        "cliente_id": cliente.id,
        "cliente_nombre": cliente.nombre,
        "saldo_total": _redondear(saldo_total),
        "aging": {k: _redondear(v) for k, v in aging.items()},
        "cuentas": cuentas,
    }


async def resumen_cobranza(db: AsyncSession, empresa_id: int) -> dict:
    """Totales de cartera: por cobrar total, vencido y número de cuentas abiertas."""
    result = await db.execute(
        select(CuentaPorCobrar).where(
            CuentaPorCobrar.empresa_id == empresa_id,
            CuentaPorCobrar.estado.in_([EstadoCxC.PENDIENTE, EstadoCxC.PARCIAL]),
        )
    )
    cuentas = list(result.scalars().all())
    ahora = datetime.now(timezone.utc)
    por_cobrar = sum(c.saldo_pendiente for c in cuentas)
    vencido = sum(c.saldo_pendiente for c in cuentas if _dias_atraso(c, ahora) > 0)
    return {
        "cuentas_abiertas": len(cuentas),
        "por_cobrar": _redondear(por_cobrar),
        "vencido": _redondear(vencido),
    }
