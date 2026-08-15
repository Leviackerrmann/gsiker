"""rls multi-tenant defensa en profundidad

Revision ID: 7524eaf58688
Revises: db28655363a1
Create Date: 2026-08-12 09:25:49.935538

Activa Row-Level Security (RLS) de PostgreSQL sobre todas las tablas que
llevan `empresa_id` (las raíces del multi-tenant, ver `TenantMixin`). Hasta
ahora el aislamiento entre empresas era solo a nivel de aplicación
(filtrado por `empresa_id` en cada query). RLS lo refuerza en la base de
datos: aunque un query olvidara filtrar, PostgreSQL solo devuelve/permite
filas de la empresa activa.

Mecanismo: cada request fija `app.current_empresa_id` en la transacción
(ver `app.dependencies.get_current_empresa`). La política compara
`empresa_id` contra esa variable. Si no está fijada, `current_setting(..., true)`
devuelve NULL y la política no deja ver ninguna fila (deny por defecto).

Se usa FORCE ROW LEVEL SECURITY porque la app se conecta como dueño de las
tablas, y el dueño normalmente *omite* RLS. Con FORCE, la política aplica
también al dueño. Nota: futuras migraciones de datos que toquen filas por
empresa deben fijar `app.current_empresa_id` o usar un rol con BYPASSRLS.
"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '7524eaf58688'
down_revision: Union[str, None] = 'db28655363a1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Tablas raíz del multi-tenant (todas llevan la columna empresa_id via TenantMixin).
# Las tablas de detalle (items_*) no llevan empresa_id: se aíslan a través de su
# cabecera, que sí está protegida aquí, y sus FKs son ON DELETE CASCADE.
TENANT_TABLES = [
    # Catálogo
    "skus",
    # Inventario
    "bodegas",
    "ubicaciones",
    "lotes",
    "stocks",
    "movimientos_inventario",
    "reservas_stock",
    "inventarios_fisicos",
    # Compras
    "proveedores",
    "precios_proveedor",
    "solicitudes_compra",
    "cotizaciones_compra",
    "propuestas_cotizacion",
    "ordenes_compra",
    "recepciones_compra",
    "devoluciones_compra",
    # Ventas
    "clientes",
    "cotizaciones_venta",
    "pedidos_venta",
    "despachos_venta",
    "facturas_venta",
    "devoluciones_venta",
]

POLICY_NAME = "tenant_isolation"


def upgrade() -> None:
    for table in TENANT_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        # NULLIF(..., '') protege contra un GUC vacío: si `app.current_empresa_id`
        # no está fijado (o quedó en cadena vacía tras un RESET), la expresión da
        # NULL en vez de reventar con "invalid input syntax for integer", y la
        # política no expone ninguna fila (deny por defecto).
        op.execute(
            f"""
            CREATE POLICY {POLICY_NAME} ON {table}
            USING (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::int)
            WITH CHECK (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::int)
            """
        )


def downgrade() -> None:
    for table in TENANT_TABLES:
        op.execute(f"DROP POLICY IF EXISTS {POLICY_NAME} ON {table}")
        op.execute(f"ALTER TABLE {table} NO FORCE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
