"""Bot de Telegram — canal de chat para el asistente IA.

Worker independiente (long-polling): recibe mensajes de Telegram, los pasa al
mismo cerebro `app.services.ia` (acotado a una empresa) y responde. Es el canal
de pruebas gratis; WhatsApp reusará este mismo servicio cambiando sólo el
adaptador de entrada/salida.

Ejecutar:  python -m app.telegram_bot   (o el servicio `telegram` de compose).

Nota multi-tenant: en pruebas responde para `TELEGRAM_EMPRESA_ID`. La
vinculación real por chat (cada usuario/negocio a su empresa) queda de follow-up.
"""
import asyncio
import logging

import httpx
from sqlalchemy import select, text

from app import database
from app.config import settings
from app.models.consumo import IaUsoEvento
from app.services import ia as ia_service
from app.services import limites as L

logging.basicConfig(level=logging.INFO, format="%(asctime)s [telegram] %(message)s")
log = logging.getLogger("telegram")

_API = "https://api.telegram.org/bot{token}/{method}"
_MAX_TG = 4000  # límite práctico de Telegram (~4096)
_HIST_MAX = 12  # mensajes de contexto por chat (6 turnos)

# Historial en memoria por chat (suficiente para pruebas).
_historiales: dict[int, list[dict]] = {}

_BIENVENIDA = (
    "👋 Soy el asistente de tu negocio. Pregúntame en lenguaje natural, por ejemplo:\n"
    "• ¿Cómo van las ventas de hoy?\n"
    "• ¿Qué productos están por agotarse?\n"
    "• ¿Cuánto me deben en fiado?\n\n"
    "Usa /reset para empezar de cero."
)


async def _empresa_nombre(empresa_id: int) -> str:
    async with database.async_session() as db:
        result = await db.execute(text("SELECT nombre FROM empresas WHERE id = :id"), {"id": empresa_id})
        row = result.first()
        return row[0] if row else "el negocio"


async def _responder_ia(empresa_id: int, empresa_nombre: str, chat_id: int, texto: str, idem: str) -> str:
    historial = _historiales.get(chat_id, [])
    async with database.async_session() as db:
        # RLS: fijar la empresa en la transacción para que las tools vean datos.
        if db.bind is not None and db.bind.dialect.name == "postgresql":
            await db.execute(
                text("SELECT set_config('app.current_empresa_id', :e, true)"),
                {"e": str(empresa_id)},
            )
        sus = await L.obtener_suscripcion_vigente(db, empresa_id)
        if sus is not None:
            estado = L.estado_efectivo(sus)
            if not L.puede_escribir(estado):
                return "⚠️ Tu suscripción está inactiva. Renová tu plan para seguir usando el asistente."
            if not L.modulo_habilitado(sus.limites_snapshot, "ia"):
                return "⚠️ Tu plan no incluye el asistente con IA. Actualizá a Pro para activarlo."
            for dim in ("requests", "tokens"):
                r = await L.verificar_limite_ia(db, sus, dim)
                if r.estado == L.EstadoLimite.EXCEDIDO and r.politica == "bloquear":
                    return f"⚠️ Alcanzaste el límite de IA ({dim}) de tu plan este período. Renová o esperá al próximo ciclo."
            ya = await db.execute(
                select(IaUsoEvento.id).where(
                    IaUsoEvento.empresa_id == empresa_id, IaUsoEvento.idempotency_key == idem
                )
            )
            if ya.scalar_one_or_none() is not None:
                return "⚠️ Ese mensaje ya fue procesado."

        resultado = await ia_service.chat(db, empresa_id, empresa_nombre, texto, historial=historial)

        if sus is not None:
            inicio, fin = L.periodo_vigente(sus)
            uso = resultado.get("uso") or {}
            await L.registrar_uso_ia(
                db, empresa_id=empresa_id, usuario_id=None, feature="telegram",
                modelo=uso.get("modelo"), tokens_in=uso.get("tokens_in", 0),
                tokens_out=uso.get("tokens_out", 0), idempotency_key=idem,
                periodo_inicio=inicio, periodo_fin=fin,
            )
        await db.commit()

    respuesta = resultado.get("respuesta") or "(sin respuesta)"
    # Guardar contexto (recortado). Sin reintento automático: cada mensaje de
    # Telegram tiene su propia clave de idempotencia.
    nuevo = historial + [{"role": "user", "content": texto}, {"role": "assistant", "content": respuesta}]
    _historiales[chat_id] = nuevo[-_HIST_MAX:]
    return respuesta


async def _send(http: httpx.AsyncClient, token: str, chat_id: int, text_msg: str) -> None:
    await http.post(
        _API.format(token=token, method="sendMessage"),
        json={"chat_id": chat_id, "text": text_msg[:_MAX_TG]},
    )


async def _procesar_update(http: httpx.AsyncClient, token: str, empresa_id: int, empresa_nombre: str, upd: dict) -> None:
    msg = upd.get("message") or upd.get("edited_message")
    if not msg:
        return
    chat_id = msg["chat"]["id"]
    texto = (msg.get("text") or "").strip()
    if not texto:
        return

    if texto.startswith("/start") or texto.startswith("/help"):
        await _send(http, token, chat_id, _BIENVENIDA)
        return
    if texto.startswith("/reset"):
        _historiales.pop(chat_id, None)
        await _send(http, token, chat_id, "🧹 Listo, empezamos de cero.")
        return

    # Clave de idempotencia por mensaje de Telegram (id único por chat).
    idem = f"tg-{chat_id}-{msg.get('message_id')}"
    try:
        respuesta = await _responder_ia(empresa_id, empresa_nombre, chat_id, texto, idem)
    except ia_service.IANoConfigurada as exc:
        respuesta = f"⚠️ El asistente aún no está configurado: {exc}"
    except Exception as exc:  # noqa: BLE001
        log.exception("error procesando mensaje")
        respuesta = f"⚠️ Ocurrió un error: {exc}"
    await _send(http, token, chat_id, respuesta)


async def run() -> None:
    token = settings.TELEGRAM_BOT_TOKEN
    if not settings.TELEGRAM_ENABLED or not token:
        log.info("Telegram deshabilitado o sin TELEGRAM_BOT_TOKEN; el worker no arranca.")
        return

    empresa_id = settings.TELEGRAM_EMPRESA_ID
    empresa_nombre = await _empresa_nombre(empresa_id)
    log.info("Bot iniciado para empresa %s (%s). Proveedor IA: %s",
             empresa_id, empresa_nombre, ia_service.estado().get("proveedor"))

    offset: int | None = None
    async with httpx.AsyncClient(timeout=40.0) as http:
        while True:
            try:
                params = {"timeout": 30}
                if offset is not None:
                    params["offset"] = offset
                r = await http.get(_API.format(token=token, method="getUpdates"), params=params)
                data = r.json()
                if not data.get("ok"):
                    log.warning("getUpdates no ok: %s", data)
                    await asyncio.sleep(3)
                    continue
                for upd in data.get("result", []):
                    offset = upd["update_id"] + 1
                    await _procesar_update(http, token, empresa_id, empresa_nombre, upd)
            except httpx.HTTPError as exc:
                log.warning("error de red con Telegram: %s", exc)
                await asyncio.sleep(3)
            except Exception as exc:  # noqa: BLE001
                log.exception("error en el loop: %s", exc)
                await asyncio.sleep(3)


if __name__ == "__main__":
    asyncio.run(run())
