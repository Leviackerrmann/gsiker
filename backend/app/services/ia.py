"""Asistente IA — "el administrador que actúa".

Un agente que responde en lenguaje natural y consulta el core (inventario,
ventas, cobranza) mediante *tools*, siempre acotado a la empresa del usuario.

El **proveedor de IA es configurable** (`IA_PROVIDER`): por defecto Groq (gratis
y compatible con la API de OpenAI); se migra a Claude de pago cambiando sólo el
proveedor y la API key. El canal (web / Telegram / WhatsApp) va encima de esto.
"""
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.services.ia_tools import TOOLS, ejecutar_tool

# SDKs opcionales (import perezoso). openai sirve para Groq/Gemini/OpenRouter/Ollama.
try:  # pragma: no cover - depende del entorno
    import openai
except ImportError:  # pragma: no cover
    openai = None
try:  # pragma: no cover
    import anthropic
except ImportError:  # pragma: no cover
    anthropic = None


class IAError(RuntimeError):
    """Error del asistente IA (se traduce a HTTP en el router)."""


class IANoConfigurada(IAError):
    """Falta configuración (SDK o API key) → 503."""


# Endpoints y modelos por defecto de cada proveedor compatible con OpenAI.
_OPENAI_COMPAT = {
    "groq": ("https://api.groq.com/openai/v1", "openai/gpt-oss-120b", "GROQ_API_KEY"),
    "gemini": ("https://generativelanguage.googleapis.com/v1beta/openai/", "gemini-2.0-flash", "GEMINI_API_KEY"),
    "openrouter": ("https://openrouter.ai/api/v1", "meta-llama/llama-3.3-70b-instruct:free", "OPENROUTER_API_KEY"),
    "ollama": ("http://localhost:11434/v1", "llama3.1", None),  # local, sin key
    "openai": (None, "gpt-4o-mini", "OPENAI_API_KEY"),
}


@dataclass
class ProveedorConfig:
    provider: str
    base_url: str | None
    api_key: str | None
    model: str
    disponible: bool
    motivo: str = ""


def resolver_proveedor() -> ProveedorConfig:
    """Determina proveedor/endpoint/modelo/estado a partir de la config."""
    prov = (settings.IA_PROVIDER or "groq").lower()

    if prov == "anthropic":
        modelo = settings.IA_MODEL or "claude-opus-4-8"
        key = settings.ANTHROPIC_API_KEY
        if anthropic is None:
            return ProveedorConfig(prov, None, key, modelo, False, "SDK anthropic no instalado")
        if not key:
            return ProveedorConfig(prov, None, key, modelo, False, "falta ANTHROPIC_API_KEY")
        return ProveedorConfig(prov, None, key, modelo, True)

    if prov not in _OPENAI_COMPAT:
        return ProveedorConfig(prov, None, None, settings.IA_MODEL, False, f"proveedor desconocido: {prov}")

    base_def, model_def, key_attr = _OPENAI_COMPAT[prov]
    base_url = settings.IA_BASE_URL or base_def
    modelo = settings.IA_MODEL or model_def
    key = getattr(settings, key_attr) if key_attr else "ollama"  # Ollama no requiere key real
    if openai is None:
        return ProveedorConfig(prov, base_url, key, modelo, False, "SDK openai no instalado")
    if key_attr and not key:
        return ProveedorConfig(prov, base_url, key, modelo, False, f"falta {key_attr}")
    return ProveedorConfig(prov, base_url, key, modelo, True)


def estado() -> dict:
    cfg = resolver_proveedor()
    disponible = settings.IA_ENABLED and cfg.disponible
    # No exponemos proveedor ni modelo: el cliente solo necesita saber si la IA
    # está disponible (y, si no, el motivo). Qué modelo/proveedor usamos es interno.
    return {
        "disponible": disponible,
        "motivo": None if disponible else cfg.motivo,
    }


def _system_prompt(empresa_nombre: str) -> str:
    return (
        f"Eres el asistente de administración de '{empresa_nombre}', un pequeño negocio "
        "en Guatemala que usa este sistema (POS, inventario y cobranza). "
        "Ayudas al dueño/cajero en español claro y breve. "
        "Cuando necesites datos reales del negocio (ventas del día, stock, cartera por cobrar, "
        "precios), USA las herramientas disponibles en vez de inventar. "
        "Los montos están en quetzales (Q) e incluyen IVA. "
        "Si una herramienta devuelve un error o no hay datos, dilo con honestidad. "
        "No inventes cifras ni prometas acciones que no puedes ejecutar todavía."
    )


async def chat(
    db: AsyncSession,
    empresa_id: int,
    empresa_nombre: str,
    mensaje: str,
    historial: list[dict] | None = None,
) -> dict:
    """Procesa un turno de chat. Devuelve {respuesta, acciones}."""
    cfg = resolver_proveedor()
    if not settings.IA_ENABLED or not cfg.disponible:
        raise IANoConfigurada(cfg.motivo or "Asistente IA no configurado")

    if cfg.provider == "anthropic":
        return await _chat_anthropic(db, empresa_id, empresa_nombre, mensaje, historial, cfg)
    return await _chat_openai(db, empresa_id, empresa_nombre, mensaje, historial, cfg)


# --- Proveedores compatibles con OpenAI (Groq, Gemini, OpenRouter, Ollama, OpenAI) ---

def _tools_openai() -> list[dict]:
    return [
        {"type": "function", "function": {
            "name": t["name"], "description": t["description"], "parameters": t["input_schema"],
        }}
        for t in TOOLS
    ]


async def _chat_openai(db, empresa_id, empresa_nombre, mensaje, historial, cfg: ProveedorConfig) -> dict:
    client = openai.AsyncOpenAI(base_url=cfg.base_url, api_key=cfg.api_key)
    messages: list[dict] = [{"role": "system", "content": _system_prompt(empresa_nombre)}]
    messages += list(historial or [])
    messages.append({"role": "user", "content": mensaje})
    tools = _tools_openai()
    acciones: list[dict] = []
    uso = {"modelo": cfg.model, "tokens_in": 0, "tokens_out": 0}

    for _ in range(settings.IA_MAX_ITERS):
        try:
            resp = await client.chat.completions.create(
                model=cfg.model, max_tokens=settings.IA_MAX_TOKENS,
                messages=messages, tools=tools, tool_choice="auto",
            )
        except Exception as exc:  # noqa: BLE001
            raise IAError(f"Error del proveedor de IA ({cfg.provider}): {exc}")

        u = getattr(resp, "usage", None)
        if u:
            uso["tokens_in"] += getattr(u, "prompt_tokens", 0) or 0
            uso["tokens_out"] += getattr(u, "completion_tokens", 0) or 0

        msg = resp.choices[0].message
        if not msg.tool_calls:
            return {"respuesta": (msg.content or "").strip(), "acciones": acciones, "uso": uso}

        import json
        messages.append({
            "role": "assistant",
            "content": msg.content or "",
            "tool_calls": [
                {"id": tc.id, "type": "function",
                 "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
                for tc in msg.tool_calls
            ],
        })
        for tc in msg.tool_calls:
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {}
            if not isinstance(args, dict):  # algunos modelos mandan "null" o un escalar
                args = {}
            acciones.append({"herramienta": tc.function.name, "input": args})
            salida = await ejecutar_tool(db, empresa_id, tc.function.name, args)
            messages.append({"role": "tool", "tool_call_id": tc.id, "content": salida})

    raise IAError("El asistente no pudo completar la respuesta (demasiadas iteraciones).")


# --- Proveedor Anthropic (Claude, de pago) ---

async def _chat_anthropic(db, empresa_id, empresa_nombre, mensaje, historial, cfg: ProveedorConfig) -> dict:
    client = anthropic.AsyncAnthropic(api_key=cfg.api_key)
    messages: list[dict] = list(historial or [])
    messages.append({"role": "user", "content": mensaje})
    acciones: list[dict] = []
    uso = {"modelo": cfg.model, "tokens_in": 0, "tokens_out": 0}

    for _ in range(settings.IA_MAX_ITERS):
        resp = await client.messages.create(
            model=cfg.model, max_tokens=settings.IA_MAX_TOKENS,
            system=_system_prompt(empresa_nombre), tools=TOOLS, messages=messages,
        )
        u = getattr(resp, "usage", None)
        if u:
            uso["tokens_in"] += getattr(u, "input_tokens", 0) or 0
            uso["tokens_out"] += getattr(u, "output_tokens", 0) or 0
        if resp.stop_reason == "refusal":
            return {"respuesta": "No puedo ayudar con esa solicitud.", "acciones": acciones, "uso": uso}
        messages.append({"role": "assistant", "content": resp.content})
        if resp.stop_reason != "tool_use":
            texto = "".join(b.text for b in resp.content if getattr(b, "type", None) == "text")
            return {"respuesta": texto.strip(), "acciones": acciones, "uso": uso}
        resultados = []
        for bloque in resp.content:
            if getattr(bloque, "type", None) != "tool_use":
                continue
            acciones.append({"herramienta": bloque.name, "input": bloque.input})
            salida = await ejecutar_tool(db, empresa_id, bloque.name, bloque.input or {})
            resultados.append({"type": "tool_result", "tool_use_id": bloque.id, "content": salida})
        messages.append({"role": "user", "content": resultados})

    raise IAError("El asistente no pudo completar la respuesta (demasiadas iteraciones).")
