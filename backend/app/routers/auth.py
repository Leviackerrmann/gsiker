from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import ratelimit
from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models.empresa import Empresa, EstadoSuscripcion, Plan, Suscripcion
from app.models.usuario import RolUsuario, Usuario
from app.schemas.auth import (
    ChangePasswordRequest,
    LoginRequest,
    LoginResponse,
    TokenResponse,
    TwoFALoginRequest,
    TwoFASetupResponse,
    TwoFAVerifyRequest,
)
from app.schemas.empresa import RegistroEmpresaRequest
from app.schemas.usuario import UsuarioResponse
from app.utils.security import (
    create_access_token,
    create_twofa_token,
    decode_twofa_token,
    generate_totp_secret,
    hash_password,
    totp_provisioning_uri,
    validate_password_strength,
    verify_password,
    verify_totp,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _issue_access_token(user: Usuario) -> str:
    return create_access_token({"sub": user.id, "empresa_id": user.empresa_id, "rol": user.rol.value})


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@router.post("/register-empresa", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register_empresa(body: RegistroEmpresaRequest, db: AsyncSession = Depends(get_db)):
    """Onboarding público: da de alta una empresa nueva con su primer usuario admin.

    Reemplaza el seed hardcodeado admin/admin2026. Deja al admin logueado
    devolviendo su token de acceso.
    """
    validate_password_strength(body.admin_password)

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


@router.post("/login", response_model=LoginResponse)
async def login(request: Request, body: LoginRequest, db: AsyncSession = Depends(get_db)):
    # Anti fuerza bruta: limita intentos por (IP, usuario).
    if settings.RATE_LIMIT_ENABLED:
        ratelimit.enforce(
            f"login:{_client_ip(request)}:{body.username}",
            settings.LOGIN_MAX_ATTEMPTS,
            settings.LOGIN_WINDOW_SECONDS,
        )

    result = await db.execute(select(Usuario).where(Usuario.username == body.username))
    user = result.scalar_one_or_none()

    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales inválidas")

    if not user.activo:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario inactivo")

    request.state.audit_user_id = user.id
    request.state.audit_empresa_id = user.empresa_id

    # Paso 1: contraseña correcta. Si el usuario tiene 2FA, aún no entregamos el
    # token de acceso: devolvemos un token intermedio para el paso 2 (/login/2fa).
    if user.totp_enabled:
        request.state.audit_accion = "login_2fa_challenge"
        return LoginResponse(twofa_required=True, twofa_token=create_twofa_token(user.id))

    request.state.audit_accion = "login"
    return LoginResponse(access_token=_issue_access_token(user))


@router.post("/login/2fa", response_model=LoginResponse)
async def login_2fa(request: Request, body: TwoFALoginRequest, db: AsyncSession = Depends(get_db)):
    """Paso 2 del login para usuarios con 2FA: valida el código TOTP contra el
    token intermedio del paso 1 y entrega el token de acceso."""
    # Anti fuerza bruta del código TOTP: limita intentos por IP.
    if settings.RATE_LIMIT_ENABLED:
        ratelimit.enforce(
            f"login2fa:{_client_ip(request)}",
            settings.LOGIN_MAX_ATTEMPTS,
            settings.LOGIN_WINDOW_SECONDS,
        )

    payload = decode_twofa_token(body.twofa_token)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token 2FA inválido o expirado")

    user = await db.get(Usuario, int(payload["sub"]))
    if user is None or not user.activo or not user.totp_enabled:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No se puede completar el 2FA")

    if not verify_totp(user.totp_secret, body.code):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Código 2FA inválido")

    request.state.audit_user_id = user.id
    request.state.audit_empresa_id = user.empresa_id
    request.state.audit_accion = "login"
    return LoginResponse(access_token=_issue_access_token(user))


@router.post("/2fa/setup", response_model=TwoFASetupResponse)
async def twofa_setup(
    current_user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Inicia el alta de 2FA: genera un secreto y devuelve el URI otpauth:// para
    escanear en la app autenticadora. Aún no queda activo (falta /2fa/verify)."""
    if current_user.totp_enabled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El 2FA ya está activo")

    secret = generate_totp_secret()
    current_user.totp_secret = secret
    await db.flush()
    return TwoFASetupResponse(
        secret=secret,
        otpauth_uri=totp_provisioning_uri(secret, current_user.username),
    )


@router.post("/2fa/verify")
async def twofa_verify(
    body: TwoFAVerifyRequest,
    current_user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Confirma el alta de 2FA verificando el primer código. A partir de aquí el
    login exigirá el segundo factor."""
    if current_user.totp_enabled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El 2FA ya está activo")
    if not current_user.totp_secret:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Primero inicia la configuración de 2FA")
    if not verify_totp(current_user.totp_secret, body.code):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Código inválido")

    current_user.totp_enabled = True
    await db.flush()
    return {"message": "2FA activado"}


@router.post("/2fa/disable")
async def twofa_disable(
    body: TwoFAVerifyRequest,
    current_user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Desactiva el 2FA. Exige un código TOTP válido para evitar que un token
    robado lo apague sin el segundo factor."""
    if not current_user.totp_enabled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El 2FA no está activo")
    if not verify_totp(current_user.totp_secret, body.code):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Código inválido")

    current_user.totp_secret = None
    current_user.totp_enabled = False
    await db.flush()
    return {"message": "2FA desactivado"}


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

    validate_password_strength(body.new_password)
    current_user.password_hash = hash_password(body.new_password)
    await db.flush()
    return {"message": "Contraseña actualizada"}
