from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_empresa, require_admin
from app.models.empresa import Empresa
from app.models.usuario import RolUsuario, Usuario
from app.schemas.usuario import UsuarioCreate, UsuarioResponse, UsuarioUpdate
from app.utils.security import hash_password

router = APIRouter(prefix="/api/usuarios", tags=["usuarios"])

# Roles que un admin de empresa puede asignar (no puede crear superadmins de plataforma).
ROLES_EMPRESA = {RolUsuario.ADMIN, RolUsuario.OPERADOR}


def _parse_rol_empresa(rol: str) -> RolUsuario:
    try:
        parsed = RolUsuario(rol)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Rol inválido")
    if parsed not in ROLES_EMPRESA:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Rol no permitido para una empresa")
    return parsed


@router.get("", response_model=list[UsuarioResponse])
async def list_usuarios(
    db: AsyncSession = Depends(get_db),
    empresa: Empresa = Depends(get_current_empresa),
    _: Usuario = Depends(require_admin),
):
    result = await db.execute(
        select(Usuario).where(Usuario.empresa_id == empresa.id).order_by(Usuario.nombre_completo)
    )
    return result.scalars().all()


@router.post("", response_model=UsuarioResponse, status_code=status.HTTP_201_CREATED)
async def create_usuario(
    body: UsuarioCreate,
    db: AsyncSession = Depends(get_db),
    empresa: Empresa = Depends(get_current_empresa),
    _: Usuario = Depends(require_admin),
):
    # username y email son únicos globalmente en el esquema actual.
    existing = await db.execute(select(Usuario).where(Usuario.username == body.username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El username ya existe")

    if body.email:
        email_check = await db.execute(select(Usuario).where(Usuario.email == body.email))
        if email_check.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El email ya existe")

    user = Usuario(
        empresa_id=empresa.id,
        username=body.username,
        email=body.email,
        password_hash=hash_password(body.password),
        nombre_completo=body.nombre_completo,
        rol=_parse_rol_empresa(body.rol),
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


@router.put("/{user_id}", response_model=UsuarioResponse)
async def update_usuario(
    user_id: int,
    body: UsuarioUpdate,
    db: AsyncSession = Depends(get_db),
    empresa: Empresa = Depends(get_current_empresa),
    _: Usuario = Depends(require_admin),
):
    result = await db.execute(
        select(Usuario).where(Usuario.id == user_id, Usuario.empresa_id == empresa.id)
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")

    if body.nombre_completo is not None:
        user.nombre_completo = body.nombre_completo
    if body.email is not None:
        user.email = body.email
    if body.rol is not None:
        user.rol = _parse_rol_empresa(body.rol)
    if body.activo is not None:
        user.activo = body.activo

    await db.flush()
    await db.refresh(user)
    return user


@router.delete("/{user_id}")
async def delete_usuario(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    empresa: Empresa = Depends(get_current_empresa),
    _: Usuario = Depends(require_admin),
):
    result = await db.execute(
        select(Usuario).where(Usuario.id == user_id, Usuario.empresa_id == empresa.id)
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")

    await db.delete(user)
    await db.flush()
    return {"message": "Usuario eliminado"}
