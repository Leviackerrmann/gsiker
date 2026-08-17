from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_empresa, require_admin
from app.models.empresa import Empresa
from app.models.usuario import RolUsuario, Usuario
from app.schemas.usuario import UsuarioCreate, UsuarioResponse, UsuarioUpdate
from app.services import limites as L
from app.services import permisos as permisos_svc
from app.utils.security import hash_password, validate_password_strength

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


async def _modulos_empresa(db: AsyncSession, empresa: Empresa) -> set[str]:
    """Módulos efectivos de la empresa (para acotar los permisos de operadores)."""
    sus = await L.obtener_suscripcion_vigente(db, empresa.id)
    return permisos_svc.modulos_efectivos_empresa(sus, empresa)


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
    validate_password_strength(body.password)

    # Email vacío → NULL. La columna es UNIQUE y admite múltiples NULL, pero no
    # múltiples cadenas vacías; sin esto, el 2º usuario sin email choca (500).
    email = (body.email or "").strip() or None

    # username y email son únicos globalmente en el esquema actual.
    existing = await db.execute(select(Usuario).where(Usuario.username == body.username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El username ya existe")

    if email:
        email_check = await db.execute(select(Usuario).where(Usuario.email == email))
        if email_check.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El email ya existe")

    rol = _parse_rol_empresa(body.rol)
    # Admin ⇒ todos los módulos (permisos = None). Operador ⇒ solo los pedidos que
    # la empresa tenga (permisos ⊆ entitlements).
    if rol == RolUsuario.ADMIN:
        permisos = None
    else:
        permisos = permisos_svc.sanear_permisos(body.permisos, await _modulos_empresa(db, empresa))

    user = Usuario(
        empresa_id=empresa.id,
        username=body.username,
        email=email,
        password_hash=hash_password(body.password),
        nombre_completo=body.nombre_completo,
        rol=rol,
        permisos=permisos,
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
        nuevo_email = body.email.strip() or None  # vacío → NULL (ver create_usuario)
        if nuevo_email:
            dup = await db.execute(
                select(Usuario).where(Usuario.email == nuevo_email, Usuario.id != user.id)
            )
            if dup.scalar_one_or_none():
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El email ya existe")
        user.email = nuevo_email
    if body.rol is not None:
        user.rol = _parse_rol_empresa(body.rol)
    if body.activo is not None:
        user.activo = body.activo

    # Permisos: admin nunca los usa (None). Para operador, se sanea contra los
    # módulos de la empresa. Un cambio a admin limpia los permisos.
    if user.rol == RolUsuario.ADMIN:
        user.permisos = None
    elif body.permisos is not None:
        user.permisos = permisos_svc.sanear_permisos(body.permisos, await _modulos_empresa(db, empresa))

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
