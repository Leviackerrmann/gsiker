from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.empresa import Empresa
from app.models.usuario import Usuario
from app.utils.security import decode_access_token

security_scheme = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
    db: AsyncSession = Depends(get_db),
) -> Usuario:
    payload = decode_access_token(credentials.credentials)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido o expirado")

    user_id_raw = payload.get("sub")
    if user_id_raw is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")
    user_id = int(user_id_raw)

    result = await db.execute(select(Usuario).where(Usuario.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or not user.activo:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no encontrado o inactivo")

    return user


async def require_admin(current_user: Usuario = Depends(get_current_user)) -> Usuario:
    if current_user.rol.value not in ("superadmin", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acceso denegado")
    return current_user


async def require_superadmin(current_user: Usuario = Depends(get_current_user)) -> Usuario:
    if current_user.rol.value != "superadmin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo superadmin puede realizar esta acción")
    return current_user


async def get_current_empresa(
    current_user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Empresa:
    """Empresa (tenant) del usuario autenticado. Base del aislamiento multi-tenant.

    Todo endpoint de negocio depende de esto y filtra sus queries por
    `Empresa.id`. El superadmin de plataforma no tiene empresa: para operar
    datos de una empresa concreta debe usar un usuario de esa empresa.
    """
    if current_user.empresa_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="El usuario no pertenece a ninguna empresa",
        )
    empresa = await db.get(Empresa, current_user.empresa_id)
    if empresa is None or not empresa.activa:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Empresa no encontrada o inactiva",
        )
    return empresa
