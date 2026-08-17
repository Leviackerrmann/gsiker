from datetime import datetime, timezone

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base
from app.models.mixins import TenantMixin


class IaUsoEvento(Base, TenantMixin):
    """Bitácora append-only del consumo de IA: un registro por llamada.

    Bajo RLS (empresa_id + política tenant_isolation): cada tenant ve su propio
    uso; la plataforma cruza por la vía explícita (engine BYPASSRLS). El costo
    se guarda SIEMPRE en USD; la conversión a GTQ ocurre al facturar.
    """

    __tablename__ = "ia_uso_eventos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    usuario_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )
    feature: Mapped[str] = mapped_column(String(50), nullable=False)
    modelo: Mapped[str] = mapped_column(String(80), nullable=True)
    tokens_entrada: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tokens_salida: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    costo_estimado_usd: Mapped[float] = mapped_column(Numeric(12, 6), default=0, nullable=False)
    periodo_inicio: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    idempotency_key: Mapped[str] = mapped_column(String(64), nullable=False)
    fecha: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True
    )

    __table_args__ = (
        # Candado de idempotencia: un envío (clave) se cuenta una sola vez.
        UniqueConstraint("empresa_id", "idempotency_key", name="uq_ia_evento_empresa_idem"),
    )


class IaUsoContador(Base, TenantMixin):
    """Contador agregado por empresa+período. Se incrementa atómicamente en la DB
    (INSERT ... ON CONFLICT DO UPDATE), nunca read-modify-write en el app server.

    Cada período es una fila (no se pisa): el histórico queda intacto y el
    "reseteo" es por cálculo (una fila nueva nace en 0 al entrar un período nuevo).
    """

    __tablename__ = "ia_uso_contador"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    periodo_inicio: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    periodo_fin: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    requests_usados: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tokens_usados: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    costo_acumulado_usd: Mapped[float] = mapped_column(Numeric(12, 6), default=0, nullable=False)
    # Crédito puntual otorgado por plataforma (no cambia el plan). No se arrastra
    # al período siguiente: vive en la fila del período.
    credito_extra_requests: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    credito_extra_tokens: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)

    __table_args__ = (
        UniqueConstraint("empresa_id", "periodo_inicio", name="uq_ia_contador_empresa_periodo"),
    )
