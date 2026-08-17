"""Engine EXCLUSIVO de la plataforma (frontera cross-tenant).

Usa un rol Postgres con **BYPASSRLS** para poder cruzar tenants en el panel del
superadmin. Vive en su propio pool y su propio módulo: **no** se importa ni se
inyecta desde ninguna dependency de tenant (`get_db`/`get_current_empresa`), para
que una sesión de tenant jamás obtenga este rol. Ver test de frontera.

En dev/tests cae al rol de migración/DATABASE_URL (SQLite no tiene RLS).
"""
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings

platform_engine = create_async_engine(settings.platform_url, echo=False)
platform_session = async_sessionmaker(platform_engine, class_=AsyncSession, expire_on_commit=False)


async def get_platform_db() -> AsyncSession:
    """Sesión de plataforma. NO fija `app.current_empresa_id`: los cruces
    cross-tenant son explícitos y solo desde `services/platform/*`."""
    async with platform_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
