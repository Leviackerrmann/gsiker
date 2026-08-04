from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column


class TenantMixin:
    """Añade `empresa_id` a una tabla para aislarla por empresa (multi-tenancy).

    Se aplica a las tablas "raíz"/documento de cada módulo. Las tablas de
    detalle (items) no lo llevan: se acceden siempre a través de su cabecera,
    que sí está aislada. El filtrado por `empresa_id` se hace a nivel de
    aplicación (ver `app.dependencies.get_current_empresa`); a futuro se puede
    reforzar con PostgreSQL Row-Level Security como defensa en profundidad.
    """

    empresa_id: Mapped[int] = mapped_column(
        ForeignKey("empresas.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
