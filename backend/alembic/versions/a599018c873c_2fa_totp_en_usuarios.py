"""2fa totp en usuarios

Revision ID: a599018c873c
Revises: 0841865d0ceb
Create Date: 2026-08-12 09:51:27.385524

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a599018c873c'
down_revision: Union[str, None] = '0841865d0ceb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("usuarios", sa.Column("totp_secret", sa.String(length=64), nullable=True))
    op.add_column(
        "usuarios",
        sa.Column("totp_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("usuarios", "totp_enabled")
    op.drop_column("usuarios", "totp_secret")
