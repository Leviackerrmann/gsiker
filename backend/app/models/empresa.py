import enum
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

# Tipo de columna para los límites del plan: JSONB en PostgreSQL (indexable),
# JSON genérico en otros dialectos (SQLite en tests).
LimitesJSON = JSON().with_variant(JSONB, "postgresql")


class RegimenFiscal(str, enum.Enum):
    """Régimen fiscal de Guatemala que determina el cálculo de impuestos."""

    GENERAL = "general"  # IVA 12%
    PEQUENO_CONTRIBUYENTE = "pequeno_contribuyente"  # 5% sobre ventas


class IntervaloPlan(str, enum.Enum):
    MENSUAL = "mensual"
    ANUAL = "anual"


class Plan(Base):
    """Plan de suscripción del SaaS (plantilla editable).

    Los límites viven en `limites` (JSONB) como **datos, no código**: nada de
    `if plan == "pro"` disperso por la app. Ver `app.services.limites` para el
    esquema (`LimitesPlan`) y el accessor fail-closed.
    """

    __tablename__ = "planes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    # Identificador estable. Para planes a medida se genera único (custom-<empresa>-<n>).
    codigo: Mapped[str] = mapped_column(String(60), unique=True, nullable=False, index=True)
    nombre: Mapped[str] = mapped_column(String(80), nullable=False)
    descripcion: Mapped[str] = mapped_column(String(255), nullable=True)
    precio: Mapped[float] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    moneda: Mapped[str] = mapped_column(String(3), default="GTQ", nullable=False)
    intervalo: Mapped[IntervaloPlan] = mapped_column(
        Enum(IntervaloPlan), default=IntervaloPlan.MENSUAL, nullable=False
    )
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Plan hecho a medida de una empresa puntual (no aparece en el catálogo público).
    es_personalizado: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    empresa_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("empresas.id", ondelete="CASCADE"), nullable=True
    )
    limites: Mapped[dict] = mapped_column(LimitesJSON, nullable=False, default=dict)
    fecha_creacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


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
    # Tasa de referencia: cuántos GTQ equivalen a 1 USD. Prellenar documentos en USD.
    tipo_cambio_usd: Mapped[float] = mapped_column(Float, default=7.80, nullable=False)
    logo_url: Mapped[str] = mapped_column(String(500), nullable=True)
    # DERIVADO: cache del plan de la suscripción vigente. Fuente de verdad =
    # `suscripciones`. Se recalcula desde la suscripción vigente (servicio de
    # cambio de plan / migración) y NUNCA se escribe a mano desde un endpoint.
    plan_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("planes.id", ondelete="SET NULL"), nullable=True
    )
    activa: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Override de módulos por empresa (capa 1, control del superadmin). Ajuste
    # puntual sobre los módulos del plan SIN cambiar de plan: {"add": [...],
    # "remove": [...]}. NULL = usar tal cual los del plan. Ver services.permisos.
    modulos_override: Mapped[dict | None] = mapped_column(LimitesJSON, nullable=True)
    fecha_creacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    plan: Mapped["Plan"] = relationship(foreign_keys=[plan_id])

    @property
    def iva_porcentaje(self) -> float:
        """Tasa de impuesto (%) que aplica esta empresa según su régimen GT."""
        if self.regimen_fiscal == RegimenFiscal.PEQUENO_CONTRIBUYENTE:
            return 5.0
        return 12.0

    def factor_a_base(self, moneda: str) -> float:
        """Factor para convertir un importe en `moneda` a la moneda base (GTQ).

        GTQ → 1.0; USD → tipo de cambio configurado (GTQ por 1 USD).
        """
        if moneda and moneda.upper() == "USD":
            return self.tipo_cambio_usd
        return 1.0


class EstadoSuscripcion(str, enum.Enum):
    """Estado **administrativo** (base) de una suscripción.

    `vencida` NO está acá: es un estado *efectivo*, calculado a partir de las
    fechas (`fin_trial` / `vigente_hasta`) — ver `app.services.limites.estado_efectivo`.
    """

    TRIAL = "trial"
    ACTIVA = "activa"
    SUSPENDIDA = "suspendida"
    CANCELADA = "cancelada"


class Suscripcion(Base):
    """Vínculo empresa↔plan **versionado** con snapshot inmutable de límites/precio.

    Cada cambio de plan cierra la versión vigente (`fecha_fin`) e inserta una
    nueva. La versión vigente es la de `fecha_fin IS NULL` (índice parcial único).
    Permite responder "qué plan tenía esta empresa el 3 de marzo".
    """

    __tablename__ = "suscripciones"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    empresa_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("empresas.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Los planes nunca se borran (solo activo=false) → RESTRICT + NOT NULL consistentes.
    plan_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("planes.id", ondelete="RESTRICT"), nullable=False
    )
    estado_base: Mapped[EstadoSuscripcion] = mapped_column(
        Enum(EstadoSuscripcion), default=EstadoSuscripcion.TRIAL, nullable=False
    )
    # Snapshot inmutable al contratar: subir precio/bajar límites del plan NO
    # afecta a las empresas ya suscritas hasta que renueven o se las migre.
    limites_snapshot: Mapped[dict] = mapped_column(LimitesJSON, nullable=False, default=dict)
    precio_snapshot: Mapped[float] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    moneda_snapshot: Mapped[str] = mapped_column(String(3), default="GTQ", nullable=False)
    intervalo_snapshot: Mapped[IntervaloPlan] = mapped_column(
        Enum(IntervaloPlan), default=IntervaloPlan.MENSUAL, nullable=False
    )
    fecha_inicio: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    # NULL = versión vigente. Se setea al reemplazar/cancelar esta versión.
    fecha_fin: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    # Fin de la prueba (solo relevante mientras estado_base=trial).
    fin_trial: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    # Hasta cuándo está pagada la suscripción activa. Único escritor: registrar-pago.
    vigente_hasta: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    # Ancla del ciclo de facturación; base del cálculo del período de consumo.
    ancla_facturacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    motivo_cambio: Mapped[str] = mapped_column(String(30), nullable=True)
    creada_por_admin_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("platform_admins.id", ondelete="SET NULL"), nullable=True
    )

    empresa: Mapped["Empresa"] = relationship()
    plan: Mapped["Plan"] = relationship()

    __table_args__ = (
        # Una sola versión vigente por empresa.
        Index(
            "uq_suscripcion_vigente",
            "empresa_id",
            unique=True,
            postgresql_where=(fecha_fin.is_(None)),
            sqlite_where=(fecha_fin.is_(None)),
        ),
        CheckConstraint("precio_snapshot >= 0", name="ck_suscripcion_precio_no_negativo"),
    )
