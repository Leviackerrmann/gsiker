import enum
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

# Lista de módulos habilitados por usuario (permisos de operador). JSON portable
# (JSONB en Postgres). Ver app.services.permisos.
PermisosJSON = JSON().with_variant(JSONB, "postgresql")


class RolUsuario(str, enum.Enum):
    # Admin de una empresa concreta.
    ADMIN = "admin"
    # Operador de una empresa concreta.
    OPERADOR = "operador"


class AuthMethod(str, enum.Enum):
    # Alta clásica username + contraseña (usuarios legacy y operadores creados por el admin).
    PASSWORD = "password"
    # Alta por número de teléfono verificado vía WhatsApp (sin contraseña).
    PHONE = "phone"
    # Alta/vínculo con cuenta de Google (sin contraseña).
    GOOGLE = "google"


class Usuario(Base):
    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    # El usuario puede existir ANTES de tener empresa: en el onboarding por
    # teléfono/Google se crea la cuenta primero y el negocio en el paso 2.
    # NULL = todavía no creó su negocio. El dueño de la plataforma NO es un
    # Usuario: vive en `platform_admins` (identidad separada).
    empresa_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("empresas.id", ondelete="CASCADE"), nullable=True, index=True
    )
    # Identificadores: al menos uno de username / phone_number / google_id según auth_method.
    username: Mapped[str | None] = mapped_column(String(100), unique=True, nullable=True, index=True)
    phone_number: Mapped[str | None] = mapped_column(String(20), unique=True, nullable=True, index=True)
    google_id: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    # Cómo se autentica este usuario. Ver AuthMethod.
    auth_method: Mapped[str] = mapped_column(String(20), default=AuthMethod.PASSWORD.value, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=True)
    # NULL para usuarios por teléfono/Google (no tienen contraseña propia).
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    nombre_completo: Mapped[str | None] = mapped_column(String(200), nullable=True)
    rol: Mapped[RolUsuario] = mapped_column(Enum(RolUsuario), default=RolUsuario.OPERADOR, nullable=False)
    # Permisos de módulo (capa 2). Solo aplica a OPERADOR: lista de módulos que el
    # dueño le habilitó, SIEMPRE acotada a los módulos que la empresa tiene (capa 1).
    # ADMIN ignora este campo (tiene todos). NULL = sin permisos asignados aún.
    permisos: Mapped[list | None] = mapped_column(PermisosJSON, nullable=True)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # 2FA (TOTP). El secreto se guarda al iniciar el alta; `totp_enabled` pasa a
    # True solo tras verificar el primer código. El login exige 2FA si está True.
    totp_secret: Mapped[str] = mapped_column(String(64), nullable=True)
    totp_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    fecha_creacion: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class VerificacionTelefono(Base):
    """Código OTP de 6 dígitos para verificar un teléfono vía WhatsApp.

    No es multi-tenant (ocurre antes de tener empresa): NO usa TenantMixin ni RLS.
    El código se guarda hasheado; se valida por (phone_number, no consumido, no
    vencido) y se limita el número de intentos.
    """

    __tablename__ = "verificaciones_telefono"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    phone_number: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    code_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    expira_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    intentos: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    consumido: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    fecha_creacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
