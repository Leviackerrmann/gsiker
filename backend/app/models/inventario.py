import enum
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class TipoMovimiento(str, enum.Enum):
    ENTRADA = "entrada"
    SALIDA = "salida"


class MotivoMovimiento(str, enum.Enum):
    COMPRA = "compra"
    DEVOLUCION_PROVEEDOR = "devolucion_proveedor"
    VENTA = "venta"
    DEVOLUCION_CLIENTE = "devolucion_cliente"
    TRANSFERENCIA_SALIDA = "transferencia_salida"
    TRANSFERENCIA_ENTRADA = "transferencia_entrada"
    CONSUMO_INTERNO = "consumo_interno"
    MERMA = "merma"
    AJUSTE = "ajuste"
    STOCK_INICIAL = "stock_inicial"


class EstadoConteo(str, enum.Enum):
    ABIERTO = "abierto"
    CERRADO = "cerrado"
    AJUSTADO = "ajustado"


class Lote(Base):
    __tablename__ = "lotes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    sku_id: Mapped[int] = mapped_column(Integer, ForeignKey("skus.id", ondelete="RESTRICT"), nullable=False)
    numero_lote: Mapped[str] = mapped_column(String(100), nullable=False)
    fecha_fabricacion: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    fecha_vencimiento: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    sku: Mapped["SKU"] = relationship()

    __table_args__ = (UniqueConstraint("sku_id", "numero_lote"),)


class Bodega(Base):
    __tablename__ = "bodegas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    nombre: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    ubicacion: Mapped[str] = mapped_column(String(255), nullable=True)
    activa: Mapped[bool] = mapped_column(default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    stocks: Mapped[list["Stock"]] = relationship(back_populates="bodega", cascade="all, delete-orphan")


class Stock(Base):
    __tablename__ = "stocks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    sku_id: Mapped[int] = mapped_column(Integer, ForeignKey("skus.id", ondelete="CASCADE"), nullable=False)
    bodega_id: Mapped[int] = mapped_column(Integer, ForeignKey("bodegas.id", ondelete="CASCADE"), nullable=False)
    lote_id: Mapped[int] = mapped_column(Integer, ForeignKey("lotes.id", ondelete="SET NULL"), nullable=True)
    ubicacion_id: Mapped[int] = mapped_column(Integer, ForeignKey("ubicaciones.id", ondelete="SET NULL"), nullable=True)
    cantidad: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    cantidad_minima: Mapped[float] = mapped_column(Float, nullable=True)
    cantidad_maxima: Mapped[float] = mapped_column(Float, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    sku: Mapped["SKU"] = relationship()
    bodega: Mapped["Bodega"] = relationship(back_populates="stocks")
    lote: Mapped["Lote"] = relationship()
    ubicacion: Mapped["Ubicacion"] = relationship()


class MovimientoInventario(Base):
    __tablename__ = "movimientos_inventario"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    tipo: Mapped[TipoMovimiento] = mapped_column(Enum(TipoMovimiento), nullable=False)
    motivo: Mapped[MotivoMovimiento] = mapped_column(Enum(MotivoMovimiento), nullable=True)
    sku_id: Mapped[int] = mapped_column(Integer, ForeignKey("skus.id", ondelete="RESTRICT"), nullable=False)
    bodega_id: Mapped[int] = mapped_column(Integer, ForeignKey("bodegas.id", ondelete="RESTRICT"), nullable=False)
    lote_id: Mapped[int] = mapped_column(Integer, ForeignKey("lotes.id", ondelete="SET NULL"), nullable=True)
    ubicacion_id: Mapped[int] = mapped_column(Integer, ForeignKey("ubicaciones.id", ondelete="SET NULL"), nullable=True)
    cantidad: Mapped[float] = mapped_column(Float, nullable=False)
    costo_unitario: Mapped[float] = mapped_column(Float, default=0.0)
    costo_total: Mapped[float] = mapped_column(Float, default=0.0)
    numero_serie: Mapped[str] = mapped_column(String(100), nullable=True)
    fecha: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    referencia: Mapped[str] = mapped_column(String(255), nullable=True)
    documento_origen: Mapped[str] = mapped_column(String(255), nullable=True)
    usuario_id: Mapped[int] = mapped_column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    sku: Mapped["SKU"] = relationship()
    bodega: Mapped["Bodega"] = relationship()
    lote: Mapped["Lote"] = relationship()
    ubicacion: Mapped["Ubicacion"] = relationship()


class ReservaStock(Base):
    __tablename__ = "reservas_stock"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    sku_id: Mapped[int] = mapped_column(Integer, ForeignKey("skus.id", ondelete="RESTRICT"), nullable=False)
    bodega_id: Mapped[int] = mapped_column(Integer, ForeignKey("bodegas.id", ondelete="RESTRICT"), nullable=False)
    lote_id: Mapped[int] = mapped_column(Integer, ForeignKey("lotes.id", ondelete="SET NULL"), nullable=True)
    ubicacion_id: Mapped[int] = mapped_column(Integer, ForeignKey("ubicaciones.id", ondelete="SET NULL"), nullable=True)
    cantidad: Mapped[float] = mapped_column(Float, nullable=False)
    referencia: Mapped[str] = mapped_column(String(255), nullable=True)
    usuario_id: Mapped[int] = mapped_column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    fecha_creacion: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    fecha_expiracion: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    sku: Mapped["SKU"] = relationship()
    bodega: Mapped["Bodega"] = relationship()
    lote: Mapped["Lote"] = relationship()
    ubicacion: Mapped["Ubicacion"] = relationship()


class InventarioFisico(Base):
    __tablename__ = "inventarios_fisicos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    bodega_id: Mapped[int] = mapped_column(Integer, ForeignKey("bodegas.id", ondelete="RESTRICT"), nullable=False)
    fecha: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    estado: Mapped[EstadoConteo] = mapped_column(Enum(EstadoConteo), default=EstadoConteo.ABIERTO, nullable=False)
    usuario_id: Mapped[int] = mapped_column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    bodega: Mapped["Bodega"] = relationship()
    items: Mapped[list["ItemInventarioFisico"]] = relationship(back_populates="inventario", cascade="all, delete-orphan")


class ItemInventarioFisico(Base):
    __tablename__ = "items_inventario_fisico"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    inventario_id: Mapped[int] = mapped_column(Integer, ForeignKey("inventarios_fisicos.id", ondelete="CASCADE"), nullable=False)
    sku_id: Mapped[int] = mapped_column(Integer, ForeignKey("skus.id", ondelete="RESTRICT"), nullable=False)
    lote_id: Mapped[int] = mapped_column(Integer, ForeignKey("lotes.id", ondelete="SET NULL"), nullable=True)
    ubicacion_id: Mapped[int] = mapped_column(Integer, ForeignKey("ubicaciones.id", ondelete="SET NULL"), nullable=True)
    cantidad_esperada: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    cantidad_contada: Mapped[float] = mapped_column(Float, nullable=True)
    observaciones: Mapped[str] = mapped_column(Text, nullable=True)

    inventario: Mapped["InventarioFisico"] = relationship(back_populates="items")
    sku: Mapped["SKU"] = relationship()
    lote: Mapped["Lote"] = relationship()
    ubicacion: Mapped["Ubicacion"] = relationship()


class Ubicacion(Base):
    __tablename__ = "ubicaciones"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    bodega_id: Mapped[int] = mapped_column(Integer, ForeignKey("bodegas.id", ondelete="CASCADE"), nullable=False)
    codigo: Mapped[str] = mapped_column(String(50), nullable=False)
    descripcion: Mapped[str] = mapped_column(String(200), nullable=True)
    activa: Mapped[bool] = mapped_column(default=True, nullable=False)

    bodega: Mapped["Bodega"] = relationship()

    __table_args__ = (UniqueConstraint("bodega_id", "codigo"),)
