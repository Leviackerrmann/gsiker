"""audit_log bitacora de auditoria

Revision ID: 0841865d0ceb
Revises: 7524eaf58688
Create Date: 2026-08-12 09:40:56.559632

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0841865d0ceb'
down_revision: Union[str, None] = '7524eaf58688'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "audit_log",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("fecha", sa.DateTime(timezone=True), nullable=False),
        sa.Column("empresa_id", sa.Integer(), sa.ForeignKey("empresas.id", ondelete="SET NULL"), nullable=True),
        sa.Column("usuario_id", sa.Integer(), sa.ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True),
        sa.Column("accion", sa.String(length=50), nullable=True),
        sa.Column("metodo", sa.String(length=10), nullable=False),
        sa.Column("ruta", sa.String(length=255), nullable=False),
        sa.Column("status_code", sa.Integer(), nullable=True),
        sa.Column("ip", sa.String(length=45), nullable=True),
        sa.Column("detalle", sa.Text(), nullable=True),
    )
    op.create_index("ix_audit_log_fecha", "audit_log", ["fecha"])
    op.create_index("ix_audit_log_empresa_id", "audit_log", ["empresa_id"])
    op.create_index("ix_audit_log_usuario_id", "audit_log", ["usuario_id"])


def downgrade() -> None:
    op.drop_index("ix_audit_log_usuario_id", table_name="audit_log")
    op.drop_index("ix_audit_log_empresa_id", table_name="audit_log")
    op.drop_index("ix_audit_log_fecha", table_name="audit_log")
    op.drop_table("audit_log")
