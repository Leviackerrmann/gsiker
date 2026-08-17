from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class PlatformAdmin(Base):
    """Dueño/operador de la plataforma SaaS. Vive en su **propia tabla**, fuera de
    `usuarios`, para que un usuario de tenant nunca pueda escalar a plataforma
    (secuencias e identidades independientes). Login y token propios (scope=platform).
    """

    __tablename__ = "platform_admins"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    nombre_completo: Mapped[str] = mapped_column(String(200), nullable=False)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # 2FA (TOTP) opcional, mismo mecanismo que los usuarios tenant.
    totp_secret: Mapped[str] = mapped_column(String(64), nullable=True)
    totp_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    fecha_creacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
