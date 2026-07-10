import enum
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class EstadoPedido(str, enum.Enum):
    PENDIENTE = "pendiente"
    PARCIAL = "parcial"
    DESPACHADO = "despachado"
    FACTURADO = "facturado"
    CANCELADO = "cancelado"


class Cliente(Base):
    __tablename__ = "clientes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    codigo: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    nombre: Mapped[str] = mapped_column(String(200), nullable=False)
    documento: Mapped[str] = mapped_column(String(30), nullable=True)
    direccion: Mapped[str] = mapped_column(String(255), nullable=True)
    telefono: Mapped[str] = mapped_column(String(50), nullable=True)
    email: Mapped[str] = mapped_column(String(255), nullable=True)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    fecha_creacion: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class CotizacionVenta(Base):
    __tablename__ = "cotizaciones_venta"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    numero: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    cliente_id: Mapped[int] = mapped_column(Integer, ForeignKey("clientes.id", ondelete="RESTRICT"), nullable=False)
    fecha: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    estado: Mapped[str] = mapped_column(String(20), default="pendiente", nullable=False)
    notas: Mapped[str] = mapped_column(Text, nullable=True)
    usuario_id: Mapped[int] = mapped_column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    cliente: Mapped["Cliente"] = relationship()
    usuario: Mapped["Usuario"] = relationship()
    items: Mapped[list["ItemCotizacionVenta"]] = relationship(back_populates="cotizacion", cascade="all, delete-orphan")


class ItemCotizacionVenta(Base):
    __tablename__ = "items_cotizacion_venta"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    cotizacion_id: Mapped[int] = mapped_column(Integer, ForeignKey("cotizaciones_venta.id", ondelete="CASCADE"), nullable=False)
    sku_id: Mapped[int] = mapped_column(Integer, ForeignKey("skus.id", ondelete="RESTRICT"), nullable=False)
    cantidad: Mapped[float] = mapped_column(Float, nullable=False)
    precio_unitario: Mapped[float] = mapped_column(Float, default=0.0)
    precio_total: Mapped[float] = mapped_column(Float, default=0.0)

    cotizacion: Mapped["CotizacionVenta"] = relationship(back_populates="items")
    sku: Mapped["SKU"] = relationship()


class PedidoVenta(Base):
    __tablename__ = "pedidos_venta"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    numero: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    cliente_id: Mapped[int] = mapped_column(Integer, ForeignKey("clientes.id", ondelete="RESTRICT"), nullable=False)
    cotizacion_id: Mapped[int] = mapped_column(Integer, ForeignKey("cotizaciones_venta.id", ondelete="SET NULL"), nullable=True)
    fecha_emision: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    fecha_entrega: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    estado: Mapped[EstadoPedido] = mapped_column(Enum(EstadoPedido), default=EstadoPedido.PENDIENTE, nullable=False)
    subtotal: Mapped[float] = mapped_column(Float, default=0.0)
    impuesto_total: Mapped[float] = mapped_column(Float, default=0.0)
    total: Mapped[float] = mapped_column(Float, default=0.0)
    nota: Mapped[str] = mapped_column(Text, nullable=True)
    usuario_id: Mapped[int] = mapped_column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    cliente: Mapped["Cliente"] = relationship()
    items: Mapped[list["ItemPedidoVenta"]] = relationship(back_populates="pedido", cascade="all, delete-orphan")


class ItemPedidoVenta(Base):
    __tablename__ = "items_pedido_venta"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    pedido_id: Mapped[int] = mapped_column(Integer, ForeignKey("pedidos_venta.id", ondelete="CASCADE"), nullable=False)
    sku_id: Mapped[int] = mapped_column(Integer, ForeignKey("skus.id", ondelete="RESTRICT"), nullable=False)
    cantidad_solicitada: Mapped[float] = mapped_column(Float, nullable=False)
    cantidad_despachada: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    precio_unitario: Mapped[float] = mapped_column(Float, default=0.0)
    precio_total: Mapped[float] = mapped_column(Float, default=0.0)

    pedido: Mapped["PedidoVenta"] = relationship(back_populates="items")
    sku: Mapped["SKU"] = relationship()


class DespachoVenta(Base):
    __tablename__ = "despachos_venta"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    pedido_id: Mapped[int] = mapped_column(Integer, ForeignKey("pedidos_venta.id", ondelete="RESTRICT"), nullable=False)
    bodega_id: Mapped[int] = mapped_column(Integer, ForeignKey("bodegas.id", ondelete="RESTRICT"), nullable=False)
    fecha: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    nota: Mapped[str] = mapped_column(Text, nullable=True)
    usuario_id: Mapped[int] = mapped_column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)

    pedido: Mapped["PedidoVenta"] = relationship()
    bodega: Mapped["Bodega"] = relationship()
    items: Mapped[list["ItemDespacho"]] = relationship(back_populates="despacho", cascade="all, delete-orphan")


class ItemDespacho(Base):
    __tablename__ = "items_despacho"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    despacho_id: Mapped[int] = mapped_column(Integer, ForeignKey("despachos_venta.id", ondelete="CASCADE"), nullable=False)
    item_pedido_id: Mapped[int] = mapped_column(Integer, ForeignKey("items_pedido_venta.id", ondelete="RESTRICT"), nullable=False)
    cantidad_despachada: Mapped[float] = mapped_column(Float, nullable=False)

    despacho: Mapped["DespachoVenta"] = relationship(back_populates="items")
    item_pedido: Mapped["ItemPedidoVenta"] = relationship()


class FacturaVenta(Base):
    __tablename__ = "facturas_venta"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    numero: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    pedido_id: Mapped[int] = mapped_column(Integer, ForeignKey("pedidos_venta.id", ondelete="RESTRICT"), nullable=False)
    cliente_id: Mapped[int] = mapped_column(Integer, ForeignKey("clientes.id", ondelete="RESTRICT"), nullable=False)
    fecha_emision: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    fecha_vencimiento: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    subtotal: Mapped[float] = mapped_column(Float, default=0.0)
    impuesto_porcentaje: Mapped[float] = mapped_column(Float, default=16.0)
    impuesto_total: Mapped[float] = mapped_column(Float, default=0.0)
    total: Mapped[float] = mapped_column(Float, default=0.0)
    estado: Mapped[str] = mapped_column(String(20), default="pendiente", nullable=False)
    notas: Mapped[str] = mapped_column(Text, nullable=True)
    usuario_id: Mapped[int] = mapped_column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)

    pedido: Mapped["PedidoVenta"] = relationship()
    cliente: Mapped["Cliente"] = relationship()


class DevolucionVenta(Base):
    __tablename__ = "devoluciones_venta"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    pedido_id: Mapped[int] = mapped_column(Integer, ForeignKey("pedidos_venta.id", ondelete="RESTRICT"), nullable=False)
    fecha: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    nota: Mapped[str] = mapped_column(Text, nullable=True)
    usuario_id: Mapped[int] = mapped_column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)

    pedido: Mapped["PedidoVenta"] = relationship()
    items: Mapped[list["ItemDevolucionVenta"]] = relationship(back_populates="devolucion", cascade="all, delete-orphan")


class ItemDevolucionVenta(Base):
    __tablename__ = "items_devolucion_venta"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    devolucion_id: Mapped[int] = mapped_column(Integer, ForeignKey("devoluciones_venta.id", ondelete="CASCADE"), nullable=False)
    item_pedido_id: Mapped[int] = mapped_column(Integer, ForeignKey("items_pedido_venta.id", ondelete="RESTRICT"), nullable=False)
    cantidad_devuelta: Mapped[float] = mapped_column(Float, nullable=False)

    devolucion: Mapped["DevolucionVenta"] = relationship(back_populates="items")
    item_pedido: Mapped["ItemPedidoVenta"] = relationship()
