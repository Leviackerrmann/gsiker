"""Tests del asistente IA (cableado). El flujo con Claude se prueba en vivo con
API key; aquí verificamos que sin configurar responde de forma clara y segura."""

from app.config import settings


async def test_estado_ia_sin_configurar(client, empresa_factory):
    headers = await empresa_factory("Tienda IA", "cajero_ia")
    r = await client.get("/api/ia/estado", headers=headers)
    assert r.status_code == 200, r.text
    # En tests no hay ANTHROPIC_API_KEY → no disponible.
    assert r.json()["disponible"] is False


async def test_chat_sin_api_key_da_503(client, empresa_factory):
    headers = await empresa_factory("Tienda IA 2", "cajero_ia2")
    r = await client.post("/api/ia/chat", json={"mensaje": "¿Cómo van las ventas hoy?"}, headers=headers)
    assert r.status_code == 503, r.text


async def test_chat_deshabilitado_da_503(client, empresa_factory):
    headers = await empresa_factory("Tienda IA 3", "cajero_ia3")
    settings.IA_ENABLED = False
    try:
        r = await client.post("/api/ia/chat", json={"mensaje": "hola"}, headers=headers)
        assert r.status_code == 503, r.text
    finally:
        settings.IA_ENABLED = True
