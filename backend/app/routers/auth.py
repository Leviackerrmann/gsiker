from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.empresa import Empresa, EstadoSuscripcion, Plan, Suscripcion
from app.models.usuario import RolUsuario, Usuario
from app.schemas.auth import ChangePasswordRequest, LoginRequest, TokenResponse
from app.schemas.empresa import RegistroEmpresaRequest
from app.schemas.usuario import UsuarioResponse
from app.utils.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register-empresa", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register_empresa(body: RegistroEmpresaRequest, db: AsyncSession = Depends(get_db)):
    """Onboarding público: da de alta una empresa nueva con su primer usuario admin.

    Reemplaza el seed hardcodeado admin/admin2026. Deja al admin logueado
    devolviendo su token de acceso.
    """
    dup_empresa = await db.execute(select(Empresa).where(Empresa.nombre == body.empresa_nombre))
    if dup_empresa.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ya existe una empresa con ese nombre")

    dup_user = await db.execute(select(Usuario).where(Usuario.username == body.admin_username))
    if dup_user.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El nombre de usuario ya está en uso")

    # Plan por defecto: el gratuito (menor precio) entre los activos.
    plan_result = await db.execute(
        select(Plan).where(Plan.activo).order_by(Plan.precio_mensual).limit(1)
    )
    plan = plan_result.scalar_one_or_none()

    empresa = Empresa(
        nombre=body.empresa_nombre,
        nit=body.nit,
        telefono=body.telefono,
        regimen_fiscal=body.regimen_fiscal,
        plan_id=plan.id if plan else None,
    )
    db.add(empresa)
    await db.flush()

    if plan is not None:
        db.add(Suscripcion(empresa_id=empresa.id, plan_id=plan.id, estado=EstadoSuscripcion.ACTIVA))

    admin = Usuario(
        empresa_id=empresa.id,
        username=body.admin_username,
        email=body.admin_email,
        password_hash=hash_password(body.admin_password),
        nombre_completo=body.admin_nombre_completo,
        rol=RolUsuario.ADMIN,
    )
    db.add(admin)
    await db.flush()

    token = create_access_token({"sub": admin.id, "empresa_id": admin.empresa_id, "rol": admin.rol.value})
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Usuario).where(Usuario.username == body.username))
    user = result.scalar_one_or_none()

    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales inválidas")

    if not user.activo:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario inactivo")

    token = create_access_token({"sub": user.id, "empresa_id": user.empresa_id, "rol": user.rol.value})
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UsuarioResponse)
async def me(current_user: Usuario = Depends(get_current_user)):
    return current_user


@router.post("/change-password")
async def change_password(
    body: ChangePasswordRequest,
    current_user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Contraseña actual incorrecta")

    current_user.password_hash = hash_password(body.new_password)
    await db.flush()
    return {"message": "Contraseña actualizada"}
