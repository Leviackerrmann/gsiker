import enum
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class RegimenFiscal(str, enum.Enum):
    """Régimen fiscal de Guatemala que determina el cálculo de impuestos."""

    GENERAL = "general"  # IVA 12%
    PEQUENO_CONTRIBUYENTE = "pequeno_contribuyente"  # 5% sobre ventas


class Plan(Base):
    """Plan de suscripción del SaaS. Define límites y precio."""

    __tablename__ = "planes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    nombre: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    descripcion: Mapped[str] = mapped_column(String(255), nullable=True)
    precio_mensual: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)  # GTQ
    # NULL = ilimitado
    max_usuarios: Mapped[int] = mapped_column(Integer, nullable=True)
    max_skus: Mapped[int] = mapped_column(Integer, nullable=True)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Empresa(Base):
    __tablename__ = "empresas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    nombre: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    nombre_comercial: Mapped[str] = mapped_column(String(200), nullable=True)
    nit: Mapped[str] = mapped_column(String(20), nullable=True)
    direccion: Mapped[str] = mapped_column(String(255), nullable=True)
    telefono: Mapped[str] = mapped_column(String(50), nullable=True)
    email: Mapped[str] = mapped_column(String(255), nullable=True)
    regimen_fiscal: Mapped[RegimenFiscal] = mapped_column(
        Enum(RegimenFiscal), default=RegimenFiscal.GENERAL, nullable=False
    )
    moneda: Mapped[str] = mapped_column(String(3), default="GTQ", nullable=False)
    logo_url: Mapped[str] = mapped_column(String(500), nullable=True)
    plan_id: Mapped[int] = mapped_column(Integer, ForeignKey("planes.id", ondelete="SET NULL"), nullable=True)
    activa: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    fecha_creacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    plan: Mapped["Plan"] = relationship()

    @property
    def iva_porcentaje(self) -> float:
        """Tasa de impuesto (%) que aplica esta empresa según su régimen GT."""
        if self.regimen_fiscal == RegimenFiscal.PEQUENO_CONTRIBUYENTE:
            return 5.0
        return 12.0


class EstadoSuscripcion(str, enum.Enum):
    ACTIVA = "activa"
    SUSPENDIDA = "suspendida"
    CANCELADA = "cancelada"


class Suscripcion(Base):
    """Vínculo empresa↔plan con estado y periodo. Base para el cobro."""

    __tablename__ = "suscripciones"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    empresa_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("empresas.id", ondelete="CASCADE"), nullable=False, index=True
    )
    plan_id: Mapped[int] = mapped_column(Integer, ForeignKey("planes.id", ondelete="RESTRICT"), nullable=False)
    estado: Mapped[EstadoSuscripcion] = mapped_column(
        Enum(EstadoSuscripcion), default=EstadoSuscripcion.ACTIVA, nullable=False
    )
    fecha_inicio: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    fecha_fin: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    empresa: Mapped["Empresa"] = relationship()
    plan: Mapped["Plan"] = relationship()
