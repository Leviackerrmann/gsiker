from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class AuditLog(Base):
    """Bitácora de auditoría: quién hizo qué, cuándo y en qué empresa.

    Registra las peticiones que modifican datos (POST/PUT/PATCH/DELETE) y
    eventos de seguridad (login). No usa TenantMixin ni RLS: `empresa_id` es
    NULL en eventos de plataforma (p. ej. login antes de resolver empresa) y
    las escrituras las hace el sistema, no el usuario final. La lectura se
    filtra por empresa a nivel de aplicación.

    Es append-only por diseño: no se edita ni borra desde la app.
    """

    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    fecha: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True, nullable=False
    )
    empresa_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("empresas.id", ondelete="SET NULL"), nullable=True, index=True
    )
    usuario_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # Actor de PLATAFORMA (superadmin del SaaS). Vive en tabla/secuencia aparte de
    # `usuarios`: por eso una columna propia y no reutilizar `usuario_id` (meter un
    # id de platform admin ahí colisionaría con usuarios tenant reales).
    platform_admin_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("platform_admins.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # Acción semántica (p. ej. "login", "crear", "actualizar", "eliminar").
    accion: Mapped[str] = mapped_column(String(50), nullable=True)
    metodo: Mapped[str] = mapped_column(String(10), nullable=False)
    ruta: Mapped[str] = mapped_column(String(255), nullable=False)
    status_code: Mapped[int] = mapped_column(Integer, nullable=True)
    ip: Mapped[str] = mapped_column(String(45), nullable=True)  # IPv4/IPv6
    # Detalle opcional (JSON serializado u observaciones). Las acciones de
    # plataforma guardan aquí {"antes": {...}, "despues": {...}}.
    detalle: Mapped[str] = mapped_column(Text, nullable=True)

    __table_args__ = (
        # A lo sumo un actor: nunca un usuario tenant y un platform admin a la vez.
        # No es XOR estricto porque hay eventos legítimos sin actor (login fallido,
        # request anónimo, escrituras del sistema).
        CheckConstraint(
            "NOT (usuario_id IS NOT NULL AND platform_admin_id IS NOT NULL)",
            name="ck_audit_un_solo_actor",
        ),
    )
