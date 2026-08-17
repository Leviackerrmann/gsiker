import logging

from sqlalchemy import select
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app import database
from app.config import settings
from app.models.audit import AuditLog
from app.models.usuario import Usuario
from app.services import limites as limites_svc
from app.utils.security import decode_access_token

logger = logging.getLogger("audit")

# Métodos que modifican estado y por tanto se auditan. Los GET no se registran
# (serían ruido y volumen enorme); la auditoría es de cambios y seguridad.
AUDITED_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
# Prefijos exentos del bloqueo de solo-lectura: auth (login/logout/2fa), la
# plataforma (otra frontera) y cualquier export (el cliente SIEMPRE puede
# exportar sus datos, aun con la suscripción vencida).
SOLO_LECTURA_EXENTOS = ("/api/auth", "/api/platform", "/docs", "/openapi", "/api/export")


class SoloLecturaMiddleware(BaseHTTPMiddleware):
    """Cuando la suscripción de la empresa está vencida/suspendida, bloquea las
    ESCRITURAS de tenant (POST/PUT/PATCH/DELETE) con 402, dejando lecturas y
    export intactos. Punto único: chequea aquí, antes de ejecutar el endpoint,
    en vez de sembrar el chequeo por cada endpoint.
    """

    async def dispatch(self, request: Request, call_next):
        if request.method not in WRITE_METHODS or any(
            request.url.path.startswith(p) for p in SOLO_LECTURA_EXENTOS
        ):
            return await call_next(request)

        auth = request.headers.get("authorization", "")
        if auth.lower().startswith("bearer "):
            payload = decode_access_token(auth[7:].strip())
            if payload and payload.get("scope") != "platform" and payload.get("sub"):
                bloqueado = await self._suscripcion_inactiva(int(payload["sub"]))
                if bloqueado:
                    return JSONResponse(
                        status_code=402,
                        content={
                            "detail": "Tu suscripción está inactiva: modo solo lectura. "
                            "Podés exportar tus datos.",
                            "estado": bloqueado,
                        },
                    )
        return await call_next(request)

    async def _suscripcion_inactiva(self, user_id: int) -> str | None:
        """Devuelve el estado efectivo si la empresa NO puede escribir, si no None.
        Sesión propia (no fija RLS): suscripciones/usuarios no están bajo RLS."""
        try:
            async with database.async_session() as session:
                user = (
                    await session.execute(select(Usuario).where(Usuario.id == user_id))
                ).scalar_one_or_none()
                if user is None:
                    return None
                sus = await limites_svc.obtener_suscripcion_vigente(session, user.empresa_id)
                if sus is None:
                    return None
                estado = limites_svc.estado_efectivo(sus)
                return None if limites_svc.puede_escribir(estado) else estado.value
        except Exception:  # pragma: no cover - defensivo: nunca tumbar la request
            logger.exception("Fallo el chequeo de solo-lectura")
            return None


def _client_ip(request: Request) -> str | None:
    """IP del cliente, respetando X-Forwarded-For si hay proxy/ingress delante."""
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else None


class AuditMiddleware(BaseHTTPMiddleware):
    """Registra en `audit_log` cada petición que modifica datos.

    El usuario y la empresa los dejan las dependencias `get_current_user` /
    `get_current_empresa` en `request.state` durante el manejo de la petición;
    aquí se leen ya resueltos. Si algo falla al auditar, se traga el error: la
    auditoría nunca debe tumbar la operación del usuario.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)

        if settings.AUDIT_ENABLED and request.method in AUDITED_METHODS:
            try:
                await self._record(request, response)
            except Exception:  # pragma: no cover - defensivo
                logger.exception("No se pudo registrar la auditoría de %s %s", request.method, request.url.path)

        return response

    async def _record(self, request: Request, response: Response) -> None:
        state = request.state
        entry = AuditLog(
            empresa_id=getattr(state, "audit_empresa_id", None),
            usuario_id=getattr(state, "audit_user_id", None),
            platform_admin_id=getattr(state, "audit_platform_admin_id", None),
            accion=getattr(state, "audit_accion", None),
            metodo=request.method,
            ruta=request.url.path,
            status_code=response.status_code,
            ip=_client_ip(request),
        )
        # Se referencia vía el módulo (no un nombre importado) para que los
        # tests puedan sustituir la fábrica de sesión por la de su BD de prueba.
        async with database.async_session() as session:
            session.add(entry)
            await session.commit()
