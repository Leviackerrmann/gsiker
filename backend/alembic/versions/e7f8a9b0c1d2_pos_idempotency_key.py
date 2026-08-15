"""pos: idempotency_key en ventas_pos

Revision ID: e7f8a9b0c1d2
Revises: c4b1a2d3e5f6
Create Date: 2026-08-13

Añade una clave de idempotencia a las ventas POS para evitar duplicados por
doble-clic o reintento de red. El constraint único (empresa_id, idempotency_key)
garantiza que una misma clave nunca cree dos ventas; los NULL no chocan entre sí.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'e7f8a9b0c1d2'
down_revision: Union[str, None] = 'c4b1a2d3e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('ventas_pos', sa.Column('idempotency_key', sa.String(length=64), nullable=True))
    op.create_unique_constraint('uq_ventas_pos_empresa_idem', 'ventas_pos', ['empresa_id', 'idempotency_key'])


def downgrade() -> None:
    op.drop_constraint('uq_ventas_pos_empresa_idem', 'ventas_pos', type_='unique')
    op.drop_column('ventas_pos', 'idempotency_key')
