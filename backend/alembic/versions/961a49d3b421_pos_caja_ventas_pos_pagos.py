"""pos: caja, ventas_pos, pagos

Revision ID: 961a49d3b421
Revises: a599018c873c
Create Date: 2026-08-12 10:52:43.137686

Crea las tablas del punto de venta (POS): turnos de caja, ventas rápidas de
mostrador, sus líneas y los pagos. Activa RLS en las tablas con `empresa_id`
(caja_sesiones, ventas_pos, pagos), como el resto del multi-tenant. La tabla de
líneas `items_venta_pos` no lleva empresa_id: se aísla vía su cabecera.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '961a49d3b421'
down_revision: Union[str, None] = 'a599018c873c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Tablas nuevas con empresa_id: reciben RLS (aislamiento por empresa).
RLS_TABLES = ["caja_sesiones", "ventas_pos", "pagos"]


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
        'caja_sesiones',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('usuario_id', sa.Integer(), nullable=True),
        sa.Column('estado', sa.Enum('ABIERTA', 'CERRADA', name='estadocajasesion'), nullable=False),
        sa.Column('monto_inicial', sa.Float(), nullable=False),
        sa.Column('fecha_apertura', sa.DateTime(timezone=True), nullable=False),
        sa.Column('fecha_cierre', sa.DateTime(timezone=True), nullable=True),
        sa.Column('monto_esperado', sa.Float(), nullable=True),
        sa.Column('monto_final_declarado', sa.Float(), nullable=True),
        sa.Column('diferencia', sa.Float(), nullable=True),
        sa.Column('notas', sa.Text(), nullable=True),
        sa.Column('empresa_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['empresa_id'], ['empresas.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['usuario_id'], ['usuarios.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_caja_sesiones_empresa_id'), 'caja_sesiones', ['empresa_id'], unique=False)
    op.create_index(op.f('ix_caja_sesiones_id'), 'caja_sesiones', ['id'], unique=False)

    op.create_table(
        'ventas_pos',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('numero', sa.String(length=50), nullable=False),
        sa.Column('caja_sesion_id', sa.Integer(), nullable=False),
        sa.Column('bodega_id', sa.Integer(), nullable=False),
        sa.Column('cliente_id', sa.Integer(), nullable=True),
        sa.Column('fecha', sa.DateTime(timezone=True), nullable=False),
        sa.Column('subtotal', sa.Float(), nullable=False),
        sa.Column('impuesto_porcentaje', sa.Float(), nullable=False),
        sa.Column('impuesto_total', sa.Float(), nullable=False),
        sa.Column('total', sa.Float(), nullable=False),
        sa.Column('estado', sa.Enum('COMPLETADA', 'ANULADA', name='estadoventapos'), nullable=False),
        sa.Column('usuario_id', sa.Integer(), nullable=True),
        sa.Column('empresa_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['bodega_id'], ['bodegas.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['caja_sesion_id'], ['caja_sesiones.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['cliente_id'], ['clientes.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['empresa_id'], ['empresas.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['usuario_id'], ['usuarios.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('empresa_id', 'numero'),
    )
    op.create_index(op.f('ix_ventas_pos_caja_sesion_id'), 'ventas_pos', ['caja_sesion_id'], unique=False)
    op.create_index(op.f('ix_ventas_pos_empresa_id'), 'ventas_pos', ['empresa_id'], unique=False)
    op.create_index(op.f('ix_ventas_pos_fecha'), 'ventas_pos', ['fecha'], unique=False)
    op.create_index(op.f('ix_ventas_pos_id'), 'ventas_pos', ['id'], unique=False)
    op.create_index(op.f('ix_ventas_pos_numero'), 'ventas_pos', ['numero'], unique=False)

    op.create_table(
        'items_venta_pos',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('venta_pos_id', sa.Integer(), nullable=False),
        sa.Column('sku_id', sa.Integer(), nullable=False),
        sa.Column('cantidad', sa.Float(), nullable=False),
        sa.Column('precio_unitario', sa.Float(), nullable=False),
        sa.Column('precio_total', sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(['sku_id'], ['skus.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['venta_pos_id'], ['ventas_pos.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_items_venta_pos_id'), 'items_venta_pos', ['id'], unique=False)

    op.create_table(
        'pagos',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('venta_pos_id', sa.Integer(), nullable=False),
        sa.Column('metodo', sa.Enum('EFECTIVO', 'TARJETA', 'TRANSFERENCIA', name='metodopago'), nullable=False),
        sa.Column('monto', sa.Float(), nullable=False),
        sa.Column('monto_recibido', sa.Float(), nullable=True),
        sa.Column('cambio', sa.Float(), nullable=True),
        sa.Column('fecha', sa.DateTime(timezone=True), nullable=False),
        sa.Column('usuario_id', sa.Integer(), nullable=True),
        sa.Column('empresa_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['empresa_id'], ['empresas.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['usuario_id'], ['usuarios.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['venta_pos_id'], ['ventas_pos.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_pagos_empresa_id'), 'pagos', ['empresa_id'], unique=False)
    op.create_index(op.f('ix_pagos_id'), 'pagos', ['id'], unique=False)

    for table in RLS_TABLES:
        _enable_rls(table)


def downgrade() -> None:
    for table in RLS_TABLES:
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")

    op.drop_index(op.f('ix_pagos_id'), table_name='pagos')
    op.drop_index(op.f('ix_pagos_empresa_id'), table_name='pagos')
    op.drop_table('pagos')
    op.drop_index(op.f('ix_items_venta_pos_id'), table_name='items_venta_pos')
    op.drop_table('items_venta_pos')
    op.drop_index(op.f('ix_ventas_pos_numero'), table_name='ventas_pos')
    op.drop_index(op.f('ix_ventas_pos_id'), table_name='ventas_pos')
    op.drop_index(op.f('ix_ventas_pos_fecha'), table_name='ventas_pos')
    op.drop_index(op.f('ix_ventas_pos_empresa_id'), table_name='ventas_pos')
    op.drop_index(op.f('ix_ventas_pos_caja_sesion_id'), table_name='ventas_pos')
    op.drop_table('ventas_pos')
    op.drop_index(op.f('ix_caja_sesiones_id'), table_name='caja_sesiones')
    op.drop_index(op.f('ix_caja_sesiones_empresa_id'), table_name='caja_sesiones')
    op.drop_table('caja_sesiones')

    # Enums creados por las tablas de arriba.
    op.execute("DROP TYPE IF EXISTS metodopago")
    op.execute("DROP TYPE IF EXISTS estadoventapos")
    op.execute("DROP TYPE IF EXISTS estadocajasesion")
