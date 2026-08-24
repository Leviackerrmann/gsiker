"""Punto de venta (POS): turnos de caja, ventas rápidas de mostrador y pagos.

Convención fiscal del POS: el `precio_unitario` de cada línea es el precio final
que paga el cliente (IVA incluido), como en el mostrador de una tienda. El
desglose (`subtotal` sin IVA e `impuesto_total`) se deriva del total, no se suma
encima. Esto difiere del flujo documental de Ventas (cotización→pedido→factura),
donde el IVA se agrega sobre el subtotal.
"""

import enum
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.mixins import TenantMixin

if TYPE_CHECKING:
    from app.models.sku import SKU


class EstadoCajaSesion(str, enum.Enum):
    ABIERTA = "abierta"
    CERRADA = "cerrada"


class MetodoPago(str, enum.Enum):
    EFECTIVO = "efectivo"
    TARJETA = "tarjeta"
    TRANSFERENCIA = "transferencia"


class EstadoVentaPOS(str, enum.Enum):
    COMPLETADA = "completada"
    ANULADA = "anulada"


class CajaSesion(TenantMixin, Base):
    """Turno de caja: base del arqueo. Un cajero abre con un monto inicial,
    registra ventas y al cerrar declara el efectivo; el sistema calcula el
    esperado y la diferencia."""

    __tablename__ = "caja_sesiones"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    usuario_id: Mapped[int] = mapped_column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    estado: Mapped[EstadoCajaSesion] = mapped_column(
        Enum(EstadoCajaSesion), default=EstadoCajaSesion.ABIERTA, nullable=False
    )
    monto_inicial: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    fecha_apertura: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    fecha_cierre: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    # Efectivo esperado en caja al cierre (inicial + ventas en efectivo).
    monto_esperado: Mapped[float] = mapped_column(Float, nullable=True)
    # Efectivo declarado por el cajero al cerrar.
    monto_final_declarado: Mapped[float] = mapped_column(Float, nullable=True)
    # declarado - esperado (positivo = sobra, negativo = falta).
    diferencia: Mapped[float] = mapped_column(Float, nullable=True)
    notas: Mapped[str] = mapped_column(Text, nullable=True)


class VentaPOS(TenantMixin, Base):
    __tablename__ = "ventas_pos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    numero: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    caja_sesion_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("caja_sesiones.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    bodega_id: Mapped[int] = mapped_column(Integer, ForeignKey("bodegas.id", ondelete="RESTRICT"), nullable=False)
    cliente_id: Mapped[int] = mapped_column(Integer, ForeignKey("clientes.id", ondelete="SET NULL"), nullable=True)
    fecha: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True
    )
    subtotal: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    impuesto_porcentaje: Mapped[float] = mapped_column(Float, default=12.0, nullable=False)
    impuesto_total: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    # Descuento a nivel de venta (trazabilidad): % aplicado y monto en dinero.
    # Los ítems conservan su precio pleno; el descuento se registra aquí y se resta
    # del total (bruto = total + descuento_monto).
    descuento_porcentaje: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    descuento_monto: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    total: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    estado: Mapped[EstadoVentaPOS] = mapped_column(
        Enum(EstadoVentaPOS), default=EstadoVentaPOS.COMPLETADA, nullable=False
    )
    usuario_id: Mapped[int] = mapped_column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    # Clave de idempotencia: el cliente envía un id único por venta; si llega dos
    # veces (doble-clic / reintento de red) devolvemos la venta ya creada en vez
    # de duplicarla. NULL para ventas antiguas o sin clave.
    idempotency_key: Mapped[str] = mapped_column(String(64), nullable=True)

    items: Mapped[list["ItemVentaPOS"]] = relationship(back_populates="venta", cascade="all, delete-orphan")
    pagos: Mapped[list["Pago"]] = relationship(back_populates="venta", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("empresa_id", "numero"),
        UniqueConstraint("empresa_id", "idempotency_key", name="uq_ventas_pos_empresa_idem"),
    )


class ItemVentaPOS(Base):
    __tablename__ = "items_venta_pos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    venta_pos_id: Mapped[int] = mapped_column(Integer, ForeignKey("ventas_pos.id", ondelete="CASCADE"), nullable=False)
    sku_id: Mapped[int] = mapped_column(Integer, ForeignKey("skus.id", ondelete="RESTRICT"), nullable=False)
    cantidad: Mapped[float] = mapped_column(Float, nullable=False)
    # Precio final por unidad (IVA incluido).
    precio_unitario: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    precio_total: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    venta: Mapped["VentaPOS"] = relationship(back_populates="items")
    sku: Mapped["SKU"] = relationship()


class Pago(TenantMixin, Base):
    __tablename__ = "pagos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    venta_pos_id: Mapped[int] = mapped_column(Integer, ForeignKey("ventas_pos.id", ondelete="CASCADE"), nullable=False)
    metodo: Mapped[MetodoPago] = mapped_column(Enum(MetodoPago), nullable=False)
    # Monto aplicado a la venta con este método.
    monto: Mapped[float] = mapped_column(Float, nullable=False)
    # Efectivo entregado por el cliente (solo efectivo); permite calcular el cambio.
    monto_recibido: Mapped[float] = mapped_column(Float, nullable=True)
    cambio: Mapped[float] = mapped_column(Float, nullable=True)
    fecha: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    usuario_id: Mapped[int] = mapped_column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)

    venta: Mapped["VentaPOS"] = relationship(back_populates="pagos")
