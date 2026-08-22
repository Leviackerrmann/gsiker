"""registro por teléfono/WhatsApp o Google (sin contraseña)

Revision ID: d3e4f5a6b7c8
Revises: c2d3e4f5a6b7
Create Date: 2026-08-22

Onboarding nuevo sin contraseña:
- `usuarios`: se agregan `phone_number` (E.164, único), `google_id` (único) y
  `auth_method` ('phone' | 'google' | 'password'). Se relajan a NULLABLE
  `empresa_id` (el usuario existe antes de crear su negocio), `username` y
  `password_hash` (quien entra por teléfono/Google no tiene ninguno).
- `empresas`: `tipo_negocio` y `ciudad` (datos livianos del alta; NADA fiscal).
- Nueva tabla `verificaciones_telefono`: códigos OTP de 6 dígitos (hash), con
  expiración e intentos, para el flujo de WhatsApp.

Backfill: los usuarios existentes (seed admin/password) quedan con
`auth_method='password'`. Solo aplica en PostgreSQL; el esquema de tests se crea
desde los modelos (SQLite).
"""
from alembic import op
import sqlalchemy as sa

revision = "d3e4f5a6b7c8"
down_revision = "c2d3e4f5a6b7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    # --- usuarios: nuevas identidades sin contraseña ---
    op.add_column("usuarios", sa.Column("phone_number", sa.String(length=20), nullable=True))
    op.add_column("usuarios", sa.Column("google_id", sa.String(length=255), nullable=True))
    op.add_column(
        "usuarios",
        sa.Column("auth_method", sa.String(length=20), nullable=False, server_default="password"),
    )
    op.create_unique_constraint("uq_usuarios_phone_number", "usuarios", ["phone_number"])
    op.create_unique_constraint("uq_usuarios_google_id", "usuarios", ["google_id"])
    op.create_index("ix_usuarios_phone_number", "usuarios", ["phone_number"])

    # El usuario ahora puede existir antes de tener empresa / username / password.
    op.alter_column("usuarios", "empresa_id", existing_type=sa.Integer(), nullable=True)
    op.alter_column("usuarios", "username", existing_type=sa.String(length=100), nullable=True)
    op.alter_column("usuarios", "password_hash", existing_type=sa.String(length=255), nullable=True)
    op.alter_column("usuarios", "nombre_completo", existing_type=sa.String(length=200), nullable=True)

    # server_default solo para backfill de filas viejas; los nuevos lo setea la app.
    op.alter_column("usuarios", "auth_method", server_default=None)

    # --- empresas: datos livianos del alta (nada tributario) ---
    op.add_column("empresas", sa.Column("tipo_negocio", sa.String(length=50), nullable=True))
    op.add_column("empresas", sa.Column("ciudad", sa.String(length=120), nullable=True))

    # --- códigos OTP de verificación por WhatsApp ---
    op.create_table(
        "verificaciones_telefono",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("phone_number", sa.String(length=20), nullable=False, index=True),
        sa.Column("code_hash", sa.String(length=255), nullable=False),
        sa.Column("expira_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("intentos", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("consumido", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("fecha_creacion", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    op.drop_table("verificaciones_telefono")

    op.drop_column("empresas", "ciudad")
    op.drop_column("empresas", "tipo_negocio")

    # Revertir nullabilidad exige que no queden filas incompatibles (no hay en prod).
    op.alter_column("usuarios", "nombre_completo", existing_type=sa.String(length=200), nullable=False)
    op.alter_column("usuarios", "password_hash", existing_type=sa.String(length=255), nullable=False)
    op.alter_column("usuarios", "username", existing_type=sa.String(length=100), nullable=False)
    op.alter_column("usuarios", "empresa_id", existing_type=sa.Integer(), nullable=False)

    op.drop_index("ix_usuarios_phone_number", table_name="usuarios")
    op.drop_constraint("uq_usuarios_google_id", "usuarios", type_="unique")
    op.drop_constraint("uq_usuarios_phone_number", "usuarios", type_="unique")
    op.drop_column("usuarios", "auth_method")
    op.drop_column("usuarios", "google_id")
    op.drop_column("usuarios", "phone_number")
