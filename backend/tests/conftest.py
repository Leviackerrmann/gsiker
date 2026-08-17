import httpx
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app import database, ratelimit
from app.config import settings
from app.database import get_db
from app.main import app
from app.models import Base, Plan

# Por defecto el rate-limiting se desactiva en tests para no acumular estado
# entre casos; el test dedicado lo activa explícitamente.
settings.RATE_LIMIT_ENABLED = False
# El onboarding público está cerrado en prod; en tests lo habilitamos para poder
# crear empresas de prueba vía register-empresa.
settings.REGISTRATION_ENABLED = True

# Plan de prueba por defecto: incluye IA con límites generosos (para no gatear
# los tests que no son de límites). Los tests de límites crean su propio plan.
LIMITES_TEST = {
    "usuarios": None,
    "registros": {"skus": None, "clientes": None},
    "modulos": ["pos", "inventario", "compras", "ventas", "cobranza", "ia"],
    "ia": {
        "requests": {"limite": 1000, "al_exceder": "bloquear"},
        "tokens": {"limite": 10_000_000, "al_exceder": "bloquear"},
    },
    "umbral_alerta": 0.8,
}


@pytest_asyncio.fixture
async def db_sessionmaker():
    """Motor SQLite in-memory compartido; crea el esquema desde los modelos."""
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    # Sembrar un plan por defecto (el onboarding lo asigna).
    async with maker() as session:
        session.add(Plan(
            codigo="basico", nombre="Básico", precio=0.0, moneda="GTQ",
            limites=LIMITES_TEST, activo=True,
        ))
        await session.commit()

    yield maker
    await engine.dispose()


@pytest_asyncio.fixture
async def client(db_sessionmaker):
    """Cliente HTTP contra la app con get_db apuntando al SQLite de prueba."""
    async def _get_db_override():
        async with db_sessionmaker() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = _get_db_override
    # El AuditMiddleware abre su propia sesión vía database.async_session;
    # apúntala a la BD de prueba para que la auditoría escriba ahí y sea
    # verificable (en vez de intentar el Postgres real).
    original_session = database.async_session
    database.async_session = db_sessionmaker
    ratelimit.reset()

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c

    database.async_session = original_session
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def empresa_factory(client):
    """Crea una empresa + admin vía onboarding y devuelve headers autenticados."""
    async def _crear(nombre: str, username: str):
        resp = await client.post("/api/auth/register-empresa", json={
            "empresa_nombre": nombre,
            "admin_username": username,
            "admin_password": "secret123",
            "admin_nombre_completo": f"Admin {nombre}",
        })
        assert resp.status_code == 201, resp.text
        token = resp.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}

    return _crear
