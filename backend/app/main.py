from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.config import settings
from app.database import async_session
from app.middleware import AuditMiddleware, SoloLecturaMiddleware
from app.models import Plan, PlatformAdmin
from app.models.empresa import IntervaloPlan
from app.routers import audit, auth, empresas, inventario, pos, skus, usuarios, compras, dashboard, ventas, cobranza, ia
from app.routers.platform import auth as platform_auth, planes as platform_planes, empresas as platform_empresas
from app.utils.security import hash_password

# Planes por defecto del SaaS. Límites como DATOS (JSONB), no código.
# Básico = sin IA; Pro = con IA. Precios en GTQ/mes.
PLANES_DEFAULT = [
    {
        "codigo": "basico", "nombre": "Básico", "descripcion": "Gestión completa sin IA",
        "precio": 99.0, "moneda": "GTQ", "intervalo": IntervaloPlan.MENSUAL,
        "limites": {
            "usuarios": 3,
            "registros": {"skus": 300, "clientes": 500},
            "modulos": ["pos", "inventario", "compras", "ventas", "cobranza"],
            "ia": None,
            "umbral_alerta": 0.8,
        },
    },
    {
        "codigo": "pro", "nombre": "Pro", "descripcion": "Todo + asistente con IA",
        "precio": 299.0, "moneda": "GTQ", "intervalo": IntervaloPlan.MENSUAL,
        "limites": {
            "usuarios": None,
            "registros": {"skus": None, "clientes": None},
            "modulos": ["pos", "inventario", "compras", "ventas", "cobranza", "ia"],
            "ia": {
                "requests": {"limite": 2000, "al_exceder": "bloquear"},
                "tokens": {"limite": 5_000_000, "al_exceder": "degradar"},
            },
            "umbral_alerta": 0.8,
        },
    },
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    # El esquema lo gestiona Alembic (alembic upgrade head), no create_all.
    async with async_session() as session:
        # Sembrar los planes por defecto si no existen (por código estable).
        for datos in PLANES_DEFAULT:
            existe = await session.execute(select(Plan).where(Plan.codigo == datos["codigo"]))
            if existe.scalar_one_or_none() is None:
                session.add(Plan(**datos))

        # Admin de PLATAFORMA (tabla/identidad separada de los usuarios de tenant).
        result = await session.execute(
            select(PlatformAdmin).where(PlatformAdmin.username == "superadmin")
        )
        if result.scalar_one_or_none() is None:
            session.add(
                PlatformAdmin(
                    username="superadmin",
                    email="superadmin@gsiker.local",
                    password_hash=hash_password(settings.PLATFORM_ADMIN_PASSWORD),
                    nombre_completo="Superadmin Plataforma",
                )
            )
        await session.commit()

    yield


app = FastAPI(
    title="gsiker API",
    description="ERP - Sistema de Gestión Empresarial",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Auditoría transversal: registra las peticiones que modifican datos.
app.add_middleware(AuditMiddleware)
# Solo-lectura si la suscripción está inactiva (bloquea escrituras de tenant).
app.add_middleware(SoloLecturaMiddleware)

app.include_router(auth.router)
app.include_router(audit.router)
app.include_router(usuarios.router)
app.include_router(empresas.router)
app.include_router(skus.router)
app.include_router(inventario.router)
app.include_router(compras.router)
app.include_router(ventas.router)
app.include_router(pos.router)
app.include_router(cobranza.router)
app.include_router(ia.router)
app.include_router(dashboard.router)
# Plataforma (superadmin del SaaS) — frontera separada bajo /api/platform/*.
app.include_router(platform_auth.router)
app.include_router(platform_planes.router)
app.include_router(platform_empresas.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
