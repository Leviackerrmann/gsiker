"""cobranza: cuentas_por_cobrar, abonos_cxc

Revision ID: c4b1a2d3e5f6
Revises: 961a49d3b421
Create Date: 2026-08-13

Crea las tablas de cobranza / cuentas por cobrar ("fiado digital"): la cuenta
con su saldo pendiente y los abonos parciales. Ambas llevan `empresa_id`, así
que reciben RLS como el resto del multi-tenant.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'c4b1a2d3e5f6'
down_revision: Union[str, None] = '961a49d3b421'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

RLS_TABLES = ["cuentas_por_cobrar", "abonos_cxc"]


def _enable_rls(table: str) -> None:
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
    op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY tenant_isolation ON {table}
        USING (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::int)
        WITH CHECK (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::int)
        """
    )


def upgrade() -> None:
    op.create_table(
        'cuentas_por_cobrar',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('cliente_id', sa.Integer(), nullable=False),
        sa.Column('origen', sa.Enum('VENTA_POS', 'FACTURA', 'MANUAL', name='origencxc'), nullable=False),
        sa.Column('origen_id', sa.Integer(), nullable=True),
        sa.Column('concepto', sa.String(length=200), nullable=True),
        sa.Column('moneda', sa.String(length=3), nullable=False),
        sa.Column('monto_total', sa.Float(), nullable=False),
        sa.Column('saldo_pendiente', sa.Float(), nullable=False),
        sa.Column('estado', sa.Enum('PENDIENTE', 'PARCIAL', 'PAGADA', 'ANULADA', name='estadocxc'), nullable=False),
        sa.Column('fecha', sa.DateTime(timezone=True), nullable=False),
        sa.Column('fecha_vencimiento', sa.DateTime(timezone=True), nullable=True),
        sa.Column('notas', sa.Text(), nullable=True),
        sa.Column('usuario_id', sa.Integer(), nullable=True),
        sa.Column('empresa_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['cliente_id'], ['clientes.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['empresa_id'], ['empresas.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['usuario_id'], ['usuarios.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_cuentas_por_cobrar_id'), 'cuentas_por_cobrar', ['id'], unique=False)
    op.create_index(op.f('ix_cuentas_por_cobrar_empresa_id'), 'cuentas_por_cobrar', ['empresa_id'], unique=False)
    op.create_index(op.f('ix_cuentas_por_cobrar_cliente_id'), 'cuentas_por_cobrar', ['cliente_id'], unique=False)
    op.create_index(op.f('ix_cuentas_por_cobrar_fecha'), 'cuentas_por_cobrar', ['fecha'], unique=False)

    op.create_table(
        'abonos_cxc',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('cuenta_id', sa.Integer(), nullable=False),
        sa.Column('monto', sa.Float(), nullable=False),
        sa.Column('metodo', sa.Enum('EFECTIVO', 'TARJETA', 'TRANSFERENCIA', name='metodoabono'), nullable=False),
        sa.Column('fecha', sa.DateTime(timezone=True), nullable=False),
        sa.Column('notas', sa.Text(), nullable=True),
        sa.Column('usuario_id', sa.Integer(), nullable=True),
        sa.Column('empresa_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['cuenta_id'], ['cuentas_por_cobrar.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['empresa_id'], ['empresas.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['usuario_id'], ['usuarios.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_abonos_cxc_id'), 'abonos_cxc', ['id'], unique=False)
    op.create_index(op.f('ix_abonos_cxc_empresa_id'), 'abonos_cxc', ['empresa_id'], unique=False)
    op.create_index(op.f('ix_abonos_cxc_cuenta_id'), 'abonos_cxc', ['cuenta_id'], unique=False)
    op.create_index(op.f('ix_abonos_cxc_fecha'), 'abonos_cxc', ['fecha'], unique=False)

    for table in RLS_TABLES:
        _enable_rls(table)


def downgrade() -> None:
    for table in RLS_TABLES:
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")

    op.drop_index(op.f('ix_abonos_cxc_fecha'), table_name='abonos_cxc')
    op.drop_index(op.f('ix_abonos_cxc_cuenta_id'), table_name='abonos_cxc')
    op.drop_index(op.f('ix_abonos_cxc_empresa_id'), table_name='abonos_cxc')
    op.drop_index(op.f('ix_abonos_cxc_id'), table_name='abonos_cxc')
    op.drop_table('abonos_cxc')

    op.drop_index(op.f('ix_cuentas_por_cobrar_fecha'), table_name='cuentas_por_cobrar')
    op.drop_index(op.f('ix_cuentas_por_cobrar_cliente_id'), table_name='cuentas_por_cobrar')
    op.drop_index(op.f('ix_cuentas_por_cobrar_empresa_id'), table_name='cuentas_por_cobrar')
    op.drop_index(op.f('ix_cuentas_por_cobrar_id'), table_name='cuentas_por_cobrar')
    op.drop_table('cuentas_por_cobrar')

    op.execute("DROP TYPE IF EXISTS metodoabono")
    op.execute("DROP TYPE IF EXISTS estadocxc")
    op.execute("DROP TYPE IF EXISTS origencxc")
