"""Descuento a nivel de venta POS (trazabilidad: % y monto).

Revision ID: e4f5a6b7c8d9
Revises: d3e4f5a6b7c8
Create Date: 2026-08-22
"""
from alembic import op
import sqlalchemy as sa

revision = "e4f5a6b7c8d9"
down_revision = "d3e4f5a6b7c8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    op.add_column("ventas_pos", sa.Column("descuento_porcentaje", sa.Float(), nullable=False, server_default="0"))
    op.add_column("ventas_pos", sa.Column("descuento_monto", sa.Float(), nullable=False, server_default="0"))
    # Quitar el server_default: el valor lo fija la app en cada venta.
    op.alter_column("ventas_pos", "descuento_porcentaje", server_default=None)
    op.alter_column("ventas_pos", "descuento_monto", server_default=None)


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    op.drop_column("ventas_pos", "descuento_monto")
    op.drop_column("ventas_pos", "descuento_porcentaje")
