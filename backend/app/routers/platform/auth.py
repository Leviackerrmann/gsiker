from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_platform_admin
from app.models.platform_admin import PlatformAdmin
from app.utils.security import create_access_token, verify_password

router = APIRouter(prefix="/api/platform/auth", tags=["platform-auth"])


class PlatformLogin(BaseModel):
    username: str
    password: str


class PlatformToken(BaseModel):
    access_token: str
    token_type: str = "bearer"


class PlatformAdminInfo(BaseModel):
    id: int
    username: str
    nombre_completo: str
    email: str | None

    model_config = {"from_attributes": True}


@router.post("/login", response_model=PlatformToken)
async def login(body: PlatformLogin, db: AsyncSession = Depends(get_db)):
    """Login del superadmin del SaaS. Emite token con `scope=platform`, que NO es
    válido en endpoints de tenant (frontera separada)."""
    res = await db.execute(select(PlatformAdmin).where(PlatformAdmin.username == body.username))
    admin = res.scalar_one_or_none()
    if admin is None or not admin.activo or not verify_password(body.password, admin.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales inválidas")
    token = create_access_token({"sub": admin.id}, scope="platform")
    return PlatformToken(access_token=token)


@router.get("/me", response_model=PlatformAdminInfo)
async def me(admin: PlatformAdmin = Depends(get_platform_admin)):
    return admin
