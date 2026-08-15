import logging

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app import database
from app.config import settings
from app.models.audit import AuditLog

logger = logging.getLogger("audit")

# Métodos que modifican estado y por tanto se auditan. Los GET no se registran
# (serían ruido y volumen enorme); la auditoría es de cambios y seguridad.
AUDITED_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


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
