import enum
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class RolUsuario(str, enum.Enum):
    # Dueño de la plataforma SaaS: empresa_id NULL, no pertenece a ninguna empresa.
    SUPERADMIN = "superadmin"
    # Admin de una empresa concreta.
    ADMIN = "admin"
    # Operador de una empresa concreta.
    OPERADOR = "operador"


class Usuario(Base):
    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    # NULL solo para el superadmin de plataforma; todo usuario de empresa lo tiene.
    empresa_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("empresas.id", ondelete="CASCADE"), nullable=True, index=True
    )
    username: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    nombre_completo: Mapped[str] = mapped_column(String(200), nullable=False)
    rol: Mapped[RolUsuario] = mapped_column(Enum(RolUsuario), default=RolUsuario.OPERADOR, nullable=False)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # 2FA (TOTP). El secreto se guarda al iniciar el alta; `totp_enabled` pasa a
    # True solo tras verificar el primer código. El login exige 2FA si está True.
    totp_secret: Mapped[str] = mapped_column(String(64), nullable=True)
    totp_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    fecha_creacion: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
