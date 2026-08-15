from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.config import settings
from app.database import async_session
from app.middleware import AuditMiddleware
from app.models import Plan, RolUsuario, Usuario
from app.routers import audit, auth, empresas, inventario, pos, skus, usuarios, compras, dashboard, ventas, cobranza, ia
from app.utils.security import hash_password

# Planes por defecto del SaaS (GTQ/mes). El primero (gratis) es el que se
# asigna en el onboarding de una empresa nueva.
PLANES_DEFAULT = [
    {"nombre": "Emprendedor", "descripcion": "Gratis para empezar", "precio_mensual": 0.0,
     "max_usuarios": 2, "max_skus": 100},
    {"nombre": "Pyme", "descripcion": "Para negocios en crecimiento", "precio_mensual": 199.0,
     "max_usuarios": 10, "max_skus": 5000},
    {"nombre": "Pro", "descripcion": "Sin límites", "precio_mensual": 499.0,
     "max_usuarios": None, "max_skus": None},
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    # El esquema lo gestiona Alembic (alembic upgrade head), no create_all.
    async with async_session() as session:
        # Sembrar los planes por defecto si no existen.
        for datos in PLANES_DEFAULT:
            existe = await session.execute(select(Plan).where(Plan.nombre == datos["nombre"]))
            if existe.scalar_one_or_none() is None:
                session.add(Plan(**datos))

        # Superadmin de PLATAFORMA (sin empresa): administra el SaaS, no datos de
        # ninguna empresa. Las empresas se crean vía /api/auth/register-empresa.
        result = await session.execute(select(Usuario).where(Usuario.username == "superadmin"))
        if result.scalar_one_or_none() is None:
            session.add(
                Usuario(
                    empresa_id=None,
                    username="superadmin",
                    email="superadmin@minisap.local",
                    password_hash=hash_password("admin2026"),
                    nombre_completo="Superadmin Plataforma",
                    rol=RolUsuario.SUPERADMIN,
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


@app.get("/api/health")
async def health():
    return {"status": "ok"}
