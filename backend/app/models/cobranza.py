"""Cobranza / cuentas por cobrar ("fiado digital").

Formaliza el "fiado" del pequeño negocio: cuando un cliente se lleva mercadería
sin pagar el total, queda una **cuenta por cobrar** con `saldo_pendiente`. Los
pagos se registran como **abonos** que bajan ese saldo. Una cuenta puede nacer
de una venta POS a crédito, de una factura, o crearse manualmente.

Convención de montos: se guardan en la moneda de la cuenta (por defecto GTQ),
importe total (IVA ya incluido, igual que POS). El saldo nunca baja de 0.
"""
import enum
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.mixins import TenantMixin

if TYPE_CHECKING:
    from app.models.ventas import Cliente


class OrigenCxC(str, enum.Enum):
    VENTA_POS = "venta_pos"
    FACTURA = "factura"
    MANUAL = "manual"


class EstadoCxC(str, enum.Enum):
    PENDIENTE = "pendiente"   # sin ningún abono
    PARCIAL = "parcial"       # abonada en parte
    PAGADA = "pagada"         # saldo 0
    ANULADA = "anulada"


class MetodoAbono(str, enum.Enum):
    EFECTIVO = "efectivo"
    TARJETA = "tarjeta"
    TRANSFERENCIA = "transferencia"


class CuentaPorCobrar(TenantMixin, Base):
    """Saldo que un cliente le debe al negocio (el "fiado" formalizado)."""

    __tablename__ = "cuentas_por_cobrar"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    cliente_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("clientes.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    origen: Mapped[OrigenCxC] = mapped_column(Enum(OrigenCxC), default=OrigenCxC.MANUAL, nullable=False)
    origen_id: Mapped[int] = mapped_column(Integer, nullable=True)  # id de la venta_pos/factura de origen
    concepto: Mapped[str] = mapped_column(String(200), nullable=True)
    moneda: Mapped[str] = mapped_column(String(3), default="GTQ", nullable=False)
    monto_total: Mapped[float] = mapped_column(Float, nullable=False)
    saldo_pendiente: Mapped[float] = mapped_column(Float, nullable=False)
    estado: Mapped[EstadoCxC] = mapped_column(Enum(EstadoCxC), default=EstadoCxC.PENDIENTE, nullable=False)
    fecha: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True
    )
    fecha_vencimiento: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    notas: Mapped[str] = mapped_column(Text, nullable=True)
    usuario_id: Mapped[int] = mapped_column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)

    cliente: Mapped["Cliente"] = relationship()
    abonos: Mapped[list["AbonoCxC"]] = relationship(
        back_populates="cuenta", cascade="all, delete-orphan", order_by="AbonoCxC.fecha"
    )


class AbonoCxC(TenantMixin, Base):
    """Pago parcial (o total) aplicado a una cuenta por cobrar."""

    __tablename__ = "abonos_cxc"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    cuenta_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("cuentas_por_cobrar.id", ondelete="CASCADE"), nullable=False, index=True
    )
    monto: Mapped[float] = mapped_column(Float, nullable=False)
    metodo: Mapped[MetodoAbono] = mapped_column(Enum(MetodoAbono), default=MetodoAbono.EFECTIVO, nullable=False)
    fecha: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True
    )
    notas: Mapped[str] = mapped_column(Text, nullable=True)
    usuario_id: Mapped[int] = mapped_column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)

    cuenta: Mapped["CuentaPorCobrar"] = relationship(back_populates="abonos")
