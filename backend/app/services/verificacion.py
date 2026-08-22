"""Verificación de teléfono por WhatsApp (OTP de 6 dígitos).

Flujo del onboarding por teléfono:
1. `crear_codigo(db, phone)` genera un código, lo guarda hasheado y lo devuelve
   en claro SOLO para enviarlo.
2. `enviar_whatsapp(phone, code)` lo manda por WhatsApp; en desarrollo
   (`WHATSAPP_ENABLED=false`) lo loguea en consola y no llama a ningún proveedor.
3. `verificar_codigo(db, phone, code)` valida contra el último código vigente.

No es multi-tenant (ocurre antes de existir la empresa): sin RLS.

Para PRODUCCIÓN, poné `WHATSAPP_ENABLED=true` y las credenciales del proveedor:
- Twilio:  WHATSAPP_PROVIDER=twilio, WHATSAPP_ACCOUNT_SID, WHATSAPP_AUTH_TOKEN,
           WHATSAPP_FROM="whatsapp:+14155238886".
- Meta Cloud API: WHATSAPP_PROVIDER=meta, WHATSAPP_META_TOKEN,
           WHATSAPP_FROM=<phone_number_id>.
"""
import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.usuario import VerificacionTelefono
from app.utils.security import hash_password, verify_password

logger = logging.getLogger("app.verificacion")


def normalizar_telefono(country_code: str, phone_number: str) -> str:
    """Combina código de país + número local en E.164 (ej: +50212345678).

    Normalización básica sin dependencias externas: para validación estricta por
    país se puede migrar a la librería `phonenumbers` sin cambiar la interfaz.
    """
    cc = (country_code or "").strip()
    cc = "+" + cc.lstrip("+")
    local = "".join(ch for ch in (phone_number or "") if ch.isdigit())
    e164 = cc + local
    total = len(e164.lstrip("+"))
    if total < 8 or total > 15:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Número de teléfono inválido.",
        )
    return e164


def _ahora() -> datetime:
    return datetime.now(timezone.utc)


async def crear_codigo(db: AsyncSession, phone: str) -> str:
    """Genera y persiste un OTP de 6 dígitos para `phone`. Invalida los códigos
    previos aún vigentes de ese número (solo el último sirve). Devuelve el código
    en claro para enviarlo (nunca se guarda sin hashear)."""
    # Invalida códigos anteriores no consumidos del mismo número.
    previos = await db.execute(
        select(VerificacionTelefono).where(
            VerificacionTelefono.phone_number == phone,
            VerificacionTelefono.consumido.is_(False),
        )
    )
    for v in previos.scalars():
        v.consumido = True

    code = f"{secrets.randbelow(1_000_000):06d}"
    registro = VerificacionTelefono(
        phone_number=phone,
        code_hash=hash_password(code),
        expira_at=_ahora() + timedelta(seconds=settings.OTP_TTL_SECONDS),
    )
    db.add(registro)
    await db.flush()
    return code


async def verificar_codigo(db: AsyncSession, phone: str, code: str) -> bool:
    """Valida `code` contra el último OTP vigente de `phone`. Cuenta intentos y
    consume el código (éxito, expiración o exceso de intentos)."""
    result = await db.execute(
        select(VerificacionTelefono)
        .where(
            VerificacionTelefono.phone_number == phone,
            VerificacionTelefono.consumido.is_(False),
        )
        .order_by(VerificacionTelefono.id.desc())
        .limit(1)
    )
    registro = result.scalar_one_or_none()
    if registro is None:
        return False

    # Vencido: se consume y falla.
    expira = registro.expira_at
    if expira.tzinfo is None:
        expira = expira.replace(tzinfo=timezone.utc)
    if expira < _ahora():
        registro.consumido = True
        await db.flush()
        return False

    registro.intentos += 1
    if registro.intentos > settings.OTP_MAX_ATTEMPTS:
        registro.consumido = True
        await db.flush()
        return False

    if verify_password(code.strip(), registro.code_hash):
        registro.consumido = True
        await db.flush()
        return True

    await db.flush()
    return False


async def enviar_whatsapp(phone: str, code: str) -> None:
    """Envía el código por WhatsApp. En desarrollo (WHATSAPP_ENABLED=false) solo
    loguea; no contacta a ningún proveedor."""
    mensaje = f"Tu código de verificación de gsiker es: {code}"
    if not settings.WHATSAPP_ENABLED:
        logger.warning("[DEV] Código WhatsApp para %s: %s", phone, code)
        return

    try:
        import httpx
    except ImportError:  # pragma: no cover - solo si falta la dependencia
        logger.error("httpx no disponible; no se pudo enviar WhatsApp a %s", phone)
        return

    if settings.WHATSAPP_PROVIDER == "twilio":
        url = f"https://api.twilio.com/2010-04-01/Accounts/{settings.WHATSAPP_ACCOUNT_SID}/Messages.json"
        data = {"From": settings.WHATSAPP_FROM, "To": f"whatsapp:{phone}", "Body": mensaje}
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                url, data=data,
                auth=(settings.WHATSAPP_ACCOUNT_SID or "", settings.WHATSAPP_AUTH_TOKEN or ""),
            )
    else:  # meta (WhatsApp Cloud API)
        url = f"https://graph.facebook.com/v20.0/{settings.WHATSAPP_FROM}/messages"
        headers = {"Authorization": f"Bearer {settings.WHATSAPP_META_TOKEN}"}
        payload = {
            "messaging_product": "whatsapp",
            "to": phone.lstrip("+"),
            "type": "text",
            "text": {"body": mensaje},
        }
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(url, json=payload, headers=headers)

    if resp.status_code >= 400:
        logger.error("Fallo al enviar WhatsApp a %s: %s %s", phone, resp.status_code, resp.text)
