from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.database import async_session, engine
from app.models import Base, Usuario
from app.routers import auth, empresas, inventario, skus, usuarios, compras, dashboard, ventas
from app.utils.security import hash_password


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as session:
        result = await session.execute(select(Usuario).where(Usuario.username == "admin"))
        if result.scalar_one_or_none() is None:
            admin = Usuario(
                username="admin",
                email="admin@minisap.local",
                password_hash=hash_password("admin2026"),
                nombre_completo="Administrador",
                rol="superadmin",
            )
            session.add(admin)
            await session.commit()

    yield


app = FastAPI(
    title="minisap API",
    description="ERP - Sistema de Gestión Empresarial",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(usuarios.router)
app.include_router(empresas.router)
app.include_router(skus.router)
app.include_router(inventario.router)
app.include_router(compras.router)
app.include_router(ventas.router)
app.include_router(dashboard.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
