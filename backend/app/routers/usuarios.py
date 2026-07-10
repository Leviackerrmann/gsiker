from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_admin
from app.models.usuario import RolUsuario, Usuario
from app.schemas.usuario import UsuarioCreate, UsuarioResponse, UsuarioUpdate
from app.utils.security import hash_password

router = APIRouter(prefix="/api/usuarios", tags=["usuarios"])


@router.get("", response_model=list[UsuarioResponse])
async def list_usuarios(
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(require_admin),
):
    result = await db.execute(select(Usuario).order_by(Usuario.nombre_completo))
    return result.scalars().all()


@router.post("", response_model=UsuarioResponse, status_code=status.HTTP_201_CREATED)
async def create_usuario(
    body: UsuarioCreate,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(require_admin),
):
    existing = await db.execute(select(Usuario).where(Usuario.username == body.username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El username ya existe")

    if body.email:
        email_check = await db.execute(select(Usuario).where(Usuario.email == body.email))
        if email_check.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El email ya existe")

    user = Usuario(
        username=body.username,
        email=body.email,
        password_hash=hash_password(body.password),
        nombre_completo=body.nombre_completo,
    )
    try:
        user.rol = RolUsuario(body.rol)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Rol inválido")

    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


@router.put("/{user_id}", response_model=UsuarioResponse)
async def update_usuario(
    user_id: int,
    body: UsuarioUpdate,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(require_admin),
):
    result = await db.execute(select(Usuario).where(Usuario.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")

    if body.nombre_completo is not None:
        user.nombre_completo = body.nombre_completo
    if body.email is not None:
        user.email = body.email
    if body.rol is not None:
        try:
            user.rol = RolUsuario(body.rol)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Rol inválido")
    if body.activo is not None:
        user.activo = body.activo

    await db.flush()
    await db.refresh(user)
    return user


@router.delete("/{user_id}")
async def delete_usuario(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(require_admin),
):
    result = await db.execute(select(Usuario).where(Usuario.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")

    if user.rol == RolUsuario.SUPERADMIN:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No se puede eliminar al superadmin")

    await db.delete(user)
    await db.flush()
    return {"message": "Usuario eliminado"}
