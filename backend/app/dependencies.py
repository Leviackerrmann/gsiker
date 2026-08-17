from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.empresa import Empresa
from app.models.platform_admin import PlatformAdmin
from app.models.usuario import Usuario
from app.services import limites as limites_svc
from app.services import permisos as permisos_svc
from app.utils.security import decode_access_token

security_scheme = HTTPBearer()


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
    db: AsyncSession = Depends(get_db),
) -> Usuario:
    payload = decode_access_token(credentials.credentials)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido o expirado")

    # Frontera de scope: un token de plataforma NO es válido en endpoints de tenant.
    if payload.get("scope") == "platform":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token de plataforma no válido acá")

    user_id_raw = payload.get("sub")
    if user_id_raw is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")
    user_id = int(user_id_raw)

    result = await db.execute(select(Usuario).where(Usuario.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or not user.activo:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no encontrado o inactivo")

    # Deja el usuario resuelto para la auditoría (lo lee AuditMiddleware).
    request.state.audit_user_id = user.id
    return user


async def get_platform_admin(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
    db: AsyncSession = Depends(get_db),
) -> PlatformAdmin:
    """Autoriza al superadmin del SaaS. Exige token con `scope=platform`; un token
    de tenant NO sirve acá (frontera separada)."""
    payload = decode_access_token(credentials.credentials)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido o expirado")
    if payload.get("scope") != "platform":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Se requiere token de plataforma")
    admin_id_raw = payload.get("sub")
    if admin_id_raw is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")
    admin = await db.get(PlatformAdmin, int(admin_id_raw))
    if admin is None or not admin.activo:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Admin de plataforma no encontrado o inactivo")
    request.state.audit_platform_admin_id = admin.id
    return admin


async def require_admin(current_user: Usuario = Depends(get_current_user)) -> Usuario:
    if current_user.rol.value != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acceso denegado")
    return current_user


async def get_current_empresa(
    request: Request,
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

    # Defensa en profundidad: fija el tenant activo en la transacción para que
    # la Row-Level Security de PostgreSQL solo exponga/permita filas de esta
    # empresa, aunque un query olvidara filtrar por empresa_id. `is_local=true`
    # limita el efecto a la transacción actual (se resetea al commit/rollback),
    # así no se filtra entre requests que reutilizan la misma conexión del pool.
    # RLS y set_config son exclusivos de PostgreSQL; en otros dialectos (SQLite
    # en tests) se omite y el aislamiento queda solo a nivel de aplicación.
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        await db.execute(
            text("SELECT set_config('app.current_empresa_id', :empresa_id, true)"),
            {"empresa_id": str(empresa.id)},
        )

    # Resuelve la suscripción vigente y su estado EFECTIVO (calculado, sin cron).
    # Deja en request.state si puede escribir: vencida/suspendida ⇒ solo lectura
    # (lo hace cumplir el middleware). Sin suscripción ⇒ no se bloquea (legacy).
    sus = await limites_svc.obtener_suscripcion_vigente(db, empresa.id)
    request.state.suscripcion = sus
    if sus is None:
        request.state.puede_escribir = True
        request.state.estado_suscripcion = None
    else:
        estado = limites_svc.estado_efectivo(sus)
        request.state.estado_suscripcion = estado.value
        request.state.puede_escribir = limites_svc.puede_escribir(estado)

    # Deja la empresa resuelta para la auditoría (la lee AuditMiddleware).
    request.state.audit_empresa_id = empresa.id
    return empresa


def requiere_modulo(modulo: str):
    """Dependency factory: exige que el plan de la empresa incluya `modulo`.
    Punto único de gate por módulo (p. ej. la IA). Fail-closed."""

    async def _dep(
        request: Request,
        empresa: Empresa = Depends(get_current_empresa),
    ) -> Empresa:
        sus = getattr(request.state, "suscripcion", None)
        limites = sus.limites_snapshot if sus else {}
        if not limites_svc.modulo_habilitado(limites, modulo):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Tu plan no incluye el módulo: {modulo}",
            )
        return empresa

    return _dep


def requiere_permiso(modulo: str):
    """Dependency factory: exige que el USUARIO pueda ver `modulo`, componiendo las
    dos capas (entitlement de la empresa + permiso del operador). Punto único de
    autorización por módulo. Fail-closed. Reemplaza a `requiere_modulo` para gatear
    endpoints de tenant (este además chequea el permiso del operador)."""

    async def _dep(
        request: Request,
        current_user: Usuario = Depends(get_current_user),
        empresa: Empresa = Depends(get_current_empresa),
    ) -> Empresa:
        sus = getattr(request.state, "suscripcion", None)
        modulos_emp = permisos_svc.modulos_efectivos_empresa(sus, empresa)
        if modulo not in modulos_emp:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Tu plan no incluye el módulo: {modulo}",
            )
        if not permisos_svc.puede_modulo(modulo, current_user, modulos_emp):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"No tenés permiso para el módulo: {modulo}",
            )
        return empresa

    return _dep


async def require_escritura(request: Request, empresa: Empresa = Depends(get_current_empresa)) -> Empresa:
    """Bloquea escrituras cuando la suscripción está vencida/suspendida (solo
    lectura). Complementa al middleware para endpoints que quieran gatear explícito."""
    if not getattr(request.state, "puede_escribir", True):
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Tu suscripción está inactiva: modo solo lectura. Podés exportar tus datos.",
        )
    return empresa
