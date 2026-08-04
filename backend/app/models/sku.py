from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base
from app.models.mixins import TenantMixin


class SKU(TenantMixin, Base):
    __tablename__ = "skus"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    codigo_sku: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    descripcion: Mapped[str] = mapped_column(Text, nullable=False)
    unidad_medida: Mapped[str] = mapped_column(String(50), nullable=False, default="UNIDAD")
    precio_referencia: Mapped[float] = mapped_column(Float, default=0.0)
    costo_unitario: Mapped[float] = mapped_column(Float, default=0.0)
    metodo_valorizacion: Mapped[str] = mapped_column(String(10), default="PMP", nullable=False)
    categoria: Mapped[str] = mapped_column(String(100), nullable=True)
    subcategoria: Mapped[str] = mapped_column(String(100), nullable=True)
    maneja_lotes: Mapped[bool] = mapped_column(Boolean, default=False)
    tipo_producto: Mapped[str] = mapped_column(String(50), default="terminado", nullable=False)
    fecha_creacion: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (UniqueConstraint("empresa_id", "codigo_sku"),)
