"""permisos de módulo por usuario + override de módulos por empresa

Revision ID: c2d3e4f5a6b7
Revises: b1c2d3e4f5a6
Create Date: 2026-08-16

Autorización de tenant en dos capas:
- `usuarios.permisos` (JSONB): módulos habilitados a un operador (capa 2).
- `empresas.modulos_override` (JSONB): ajuste de módulos por empresa sobre el plan
  (capa 1, control del superadmin).

Backfill: los operadores existentes reciben los módulos que su empresa tiene hoy
(snapshot del plan vigente), para NO perder acceso al activar el control. Los
operadores nuevos nacen sin permisos y el dueño los reparte. Solo aplica en
PostgreSQL; el esquema de tests se crea desde los modelos (SQLite).
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "c2d3e4f5a6b7"
down_revision = "b1c2d3e4f5a6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    op.add_column("usuarios", sa.Column("permisos", postgresql.JSONB(), nullable=True))
    op.add_column("empresas", sa.Column("modulos_override", postgresql.JSONB(), nullable=True))

    # Backfill: operadores existentes conservan lo que su empresa tiene hoy.
    # El enum RolUsuario se persiste por NOMBRE de miembro → 'OPERADOR'.
    op.execute(
        """
        UPDATE usuarios u
        SET permisos = s.limites_snapshot->'modulos'
        FROM suscripciones s
        WHERE s.empresa_id = u.empresa_id
          AND s.fecha_fin IS NULL
          AND u.rol = 'OPERADOR'
          AND jsonb_typeof(s.limites_snapshot->'modulos') = 'array'
        """
    )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    op.drop_column("empresas", "modulos_override")
    op.drop_column("usuarios", "permisos")
