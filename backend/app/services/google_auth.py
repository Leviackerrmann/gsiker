"""Verificación del id_token de Google (Sign-In).

Si `GOOGLE_CLIENT_ID` no está configurado, el registro por Google queda
DESHABILITADO (501): el frontend muestra el botón como "Próximamente". Al poner
el client id (y en el frontend el mismo), el flujo funciona sin más cambios.

Validación vía el endpoint tokeninfo de Google (sin dependencias extra). Para
mayor robustez se puede migrar a `google-auth` (verificación local de firma) sin
cambiar la interfaz.
"""
import logging

from fastapi import HTTPException, status

from app.config import settings

logger = logging.getLogger("app.google_auth")


async def verificar_google_token(token: str) -> dict:
    """Devuelve el perfil {sub, email, name, ...} si el id_token es válido para
    nuestro GOOGLE_CLIENT_ID. Lanza HTTP 401/501 en caso contrario."""
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="El registro con Google no está habilitado todavía.",
        )

    try:
        import httpx
    except ImportError:  # pragma: no cover
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Cliente HTTP no disponible.")

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get("https://oauth2.googleapis.com/tokeninfo", params={"id_token": token})

    if resp.status_code != 200:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token de Google inválido.")

    data = resp.json()
    # El id_token debe estar emitido para NUESTRA app (aud) y por Google (iss).
    if data.get("aud") != settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token de Google no es para esta app.")
    if data.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Emisor de Google inválido.")
    if not data.get("sub"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token de Google sin identidad.")

    return data
