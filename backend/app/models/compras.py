import enum
from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class EstadoOrden(str, enum.Enum):
    PENDIENTE = "pendiente"
    PARCIAL = "parcial"
    COMPLETA = "completa"
    CANCELADA = "cancelada"


class Proveedor(Base):
    __tablename__ = "proveedores"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    codigo: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    nombre: Mapped[str] = mapped_column(String(200), nullable=False)
    documento: Mapped[str] = mapped_column(String(30), nullable=True)
    direccion: Mapped[str] = mapped_column(String(255), nullable=True)
    telefono: Mapped[str] = mapped_column(String(50), nullable=True)
    email: Mapped[str] = mapped_column(String(255), nullable=True)
    activo: Mapped[bool] = mapped_column(default=True, nullable=False)
    fecha_creacion: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class OrdenCompra(Base):
    __tablename__ = "ordenes_compra"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    numero_oc: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    proveedor_id: Mapped[int] = mapped_column(Integer, ForeignKey("proveedores.id", ondelete="RESTRICT"), nullable=False)
    fecha_emision: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    fecha_entrega: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    estado: Mapped[EstadoOrden] = mapped_column(Enum(EstadoOrden), default=EstadoOrden.PENDIENTE, nullable=False)
    nota: Mapped[str] = mapped_column(Text, nullable=True)
    usuario_id: Mapped[int] = mapped_column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    proveedor: Mapped["Proveedor"] = relationship()
    items: Mapped[list["ItemOrdenCompra"]] = relationship(back_populates="orden", cascade="all, delete-orphan")


class ItemOrdenCompra(Base):
    __tablename__ = "items_orden_compra"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    orden_id: Mapped[int] = mapped_column(Integer, ForeignKey("ordenes_compra.id", ondelete="CASCADE"), nullable=False)
    sku_id: Mapped[int] = mapped_column(Integer, ForeignKey("skus.id", ondelete="RESTRICT"), nullable=False)
    lote_id: Mapped[int] = mapped_column(Integer, ForeignKey("lotes.id", ondelete="SET NULL"), nullable=True)
    cantidad_solicitada: Mapped[float] = mapped_column(Float, nullable=False)
    cantidad_recibida: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    costo_unitario: Mapped[float] = mapped_column(Float, default=0.0)
    costo_total: Mapped[float] = mapped_column(Float, default=0.0)

    orden: Mapped["OrdenCompra"] = relationship(back_populates="items")
    sku: Mapped["SKU"] = relationship()
    lote: Mapped["Lote"] = relationship()


class RecepcionCompra(Base):
    __tablename__ = "recepciones_compra"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    orden_id: Mapped[int] = mapped_column(Integer, ForeignKey("ordenes_compra.id", ondelete="RESTRICT"), nullable=False)
    fecha: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    nota: Mapped[str] = mapped_column(Text, nullable=True)
    usuario_id: Mapped[int] = mapped_column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    orden: Mapped["OrdenCompra"] = relationship()
    items: Mapped[list["ItemRecepcion"]] = relationship(back_populates="recepcion", cascade="all, delete-orphan")


class ItemRecepcion(Base):
    __tablename__ = "items_recepcion"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    recepcion_id: Mapped[int] = mapped_column(Integer, ForeignKey("recepciones_compra.id", ondelete="CASCADE"), nullable=False)
    item_orden_id: Mapped[int] = mapped_column(Integer, ForeignKey("items_orden_compra.id", ondelete="RESTRICT"), nullable=False)
    lote_id: Mapped[int] = mapped_column(Integer, ForeignKey("lotes.id", ondelete="SET NULL"), nullable=True)
    cantidad_recibida: Mapped[float] = mapped_column(Float, nullable=False)

    recepcion: Mapped["RecepcionCompra"] = relationship(back_populates="items")
    item_orden: Mapped["ItemOrdenCompra"] = relationship()
    lote: Mapped["Lote"] = relationship()


class SolicitudCompra(Base):
    __tablename__ = "solicitudes_compra"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    numero: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    fecha: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    usuario_id: Mapped[int] = mapped_column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    estado: Mapped[str] = mapped_column(String(20), default="pendiente", nullable=False)
    notas: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    usuario: Mapped["Usuario"] = relationship()
    items: Mapped[list["ItemSolicitudCompra"]] = relationship(back_populates="solicitud", cascade="all, delete-orphan")


class ItemSolicitudCompra(Base):
    __tablename__ = "items_solicitud_compra"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    solicitud_id: Mapped[int] = mapped_column(Integer, ForeignKey("solicitudes_compra.id", ondelete="CASCADE"), nullable=False)
    sku_id: Mapped[int] = mapped_column(Integer, ForeignKey("skus.id", ondelete="RESTRICT"), nullable=False)
    cantidad: Mapped[float] = mapped_column(Float, nullable=False)
    justificacion: Mapped[str] = mapped_column(Text, nullable=True)

    solicitud: Mapped["SolicitudCompra"] = relationship(back_populates="items")
    sku: Mapped["SKU"] = relationship()


class PrecioProveedor(Base):
    __tablename__ = "precios_proveedor"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    proveedor_id: Mapped[int] = mapped_column(Integer, ForeignKey("proveedores.id", ondelete="CASCADE"), nullable=False)
    sku_id: Mapped[int] = mapped_column(Integer, ForeignKey("skus.id", ondelete="CASCADE"), nullable=False)
    costo_unitario: Mapped[float] = mapped_column(Float, default=0.0)
    ultima_actualizacion: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    proveedor: Mapped["Proveedor"] = relationship()
    sku: Mapped["SKU"] = relationship()

    __table_args__ = (UniqueConstraint("proveedor_id", "sku_id"),)


class DevolucionCompra(Base):
    __tablename__ = "devoluciones_compra"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    orden_id: Mapped[int] = mapped_column(Integer, ForeignKey("ordenes_compra.id", ondelete="RESTRICT"), nullable=False)
    fecha: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    nota: Mapped[str] = mapped_column(Text, nullable=True)
    usuario_id: Mapped[int] = mapped_column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)

    orden: Mapped["OrdenCompra"] = relationship()
    items: Mapped[list["ItemDevolucionCompra"]] = relationship(back_populates="devolucion", cascade="all, delete-orphan")


class ItemDevolucionCompra(Base):
    __tablename__ = "items_devolucion_compra"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    devolucion_id: Mapped[int] = mapped_column(Integer, ForeignKey("devoluciones_compra.id", ondelete="CASCADE"), nullable=False)
    item_orden_id: Mapped[int] = mapped_column(Integer, ForeignKey("items_orden_compra.id", ondelete="RESTRICT"), nullable=False)
    cantidad_devuelta: Mapped[float] = mapped_column(Float, nullable=False)

    devolucion: Mapped["DevolucionCompra"] = relationship(back_populates="items")
    item_orden: Mapped["ItemOrdenCompra"] = relationship()


class CotizacionCompra(Base):
    __tablename__ = "cotizaciones_compra"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    numero: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    fecha: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    estado: Mapped[str] = mapped_column(String(20), default="pendiente", nullable=False)
    notas: Mapped[str] = mapped_column(Text, nullable=True)
    usuario_id: Mapped[int] = mapped_column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    usuario: Mapped["Usuario"] = relationship()
    items: Mapped[list["ItemCotizacion"]] = relationship(back_populates="cotizacion", cascade="all, delete-orphan")
    propuestas: Mapped[list["PropuestaCotizacion"]] = relationship(back_populates="cotizacion", cascade="all, delete-orphan")


class ItemCotizacion(Base):
    __tablename__ = "items_cotizacion"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    cotizacion_id: Mapped[int] = mapped_column(Integer, ForeignKey("cotizaciones_compra.id", ondelete="CASCADE"), nullable=False)
    sku_id: Mapped[int] = mapped_column(Integer, ForeignKey("skus.id", ondelete="RESTRICT"), nullable=False)
    cantidad: Mapped[float] = mapped_column(Float, nullable=False)

    cotizacion: Mapped["CotizacionCompra"] = relationship(back_populates="items")
    sku: Mapped["SKU"] = relationship()


class PropuestaCotizacion(Base):
    __tablename__ = "propuestas_cotizacion"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    cotizacion_id: Mapped[int] = mapped_column(Integer, ForeignKey("cotizaciones_compra.id", ondelete="CASCADE"), nullable=False)
    proveedor_id: Mapped[int] = mapped_column(Integer, ForeignKey("proveedores.id", ondelete="RESTRICT"), nullable=False)
    fecha: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    notas: Mapped[str] = mapped_column(Text, nullable=True)
    adjudicada: Mapped[bool] = mapped_column(default=False)

    cotizacion: Mapped["CotizacionCompra"] = relationship(back_populates="propuestas")
    proveedor: Mapped["Proveedor"] = relationship()
    items: Mapped[list["ItemPropuesta"]] = relationship(back_populates="propuesta", cascade="all, delete-orphan")


class ItemPropuesta(Base):
    __tablename__ = "items_propuesta"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    propuesta_id: Mapped[int] = mapped_column(Integer, ForeignKey("propuestas_cotizacion.id", ondelete="CASCADE"), nullable=False)
    item_cotizacion_id: Mapped[int] = mapped_column(Integer, ForeignKey("items_cotizacion.id", ondelete="CASCADE"), nullable=False)
    costo_unitario: Mapped[float] = mapped_column(Float, default=0.0)

    propuesta: Mapped["PropuestaCotizacion"] = relationship(back_populates="items")
    item_cotizacion: Mapped["ItemCotizacion"] = relationship()
