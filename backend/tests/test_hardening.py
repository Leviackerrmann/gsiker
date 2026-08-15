"""Tests de endurecimiento de auth: política de contraseñas y rate-limiting."""

from app import ratelimit
from app.config import settings


async def test_registro_rechaza_contrasena_debil(client):
    resp = await client.post("/api/auth/register-empresa", json={
        "empresa_nombre": "Empresa Débil",
        "admin_username": "admin_debil",
        "admin_password": "123",  # muy corta y sin letras
        "admin_nombre_completo": "Admin Débil",
    })
    assert resp.status_code == 400
    assert "contraseña" in resp.json()["detail"].lower()


async def test_registro_acepta_contrasena_fuerte(client):
    resp = await client.post("/api/auth/register-empresa", json={
        "empresa_nombre": "Empresa Fuerte",
        "admin_username": "admin_fuerte",
        "admin_password": "segura123",
        "admin_nombre_completo": "Admin Fuerte",
    })
    assert resp.status_code == 201, resp.text


async def test_crear_usuario_rechaza_contrasena_debil(client, empresa_factory):
    headers = await empresa_factory("Empresa Users", "admin_users")
    resp = await client.post(
        "/api/usuarios",
        json={"username": "oper_debil", "password": "abc", "nombre_completo": "Op", "rol": "operador"},
        headers=headers,
    )
    assert resp.status_code == 400


def test_limitador_ventana_deslizante():
    ratelimit.reset()
    key = "prueba"
    assert ratelimit._allow(key, 3, 100)
    assert ratelimit._allow(key, 3, 100)
    assert ratelimit._allow(key, 3, 100)
    # El 4º supera el límite dentro de la ventana.
    assert not ratelimit._allow(key, 3, 100)
    # Tras reset, vuelve a permitir.
    ratelimit.reset()
    assert ratelimit._allow(key, 3, 100)


async def test_rate_limit_bloquea_fuerza_bruta_en_login(client, empresa_factory):
    await empresa_factory("Empresa RL", "admin_rl")

    ratelimit.reset()
    settings.RATE_LIMIT_ENABLED = True
    settings.LOGIN_MAX_ATTEMPTS = 3
    try:
        # Los primeros 3 intentos fallidos responden 401 (credenciales inválidas).
        for _ in range(3):
            r = await client.post("/api/auth/login", json={"username": "admin_rl", "password": "malamala1"})
            assert r.status_code == 401

        # El 4º intento se bloquea por rate-limiting.
        r = await client.post("/api/auth/login", json={"username": "admin_rl", "password": "malamala1"})
        assert r.status_code == 429
    finally:
        settings.RATE_LIMIT_ENABLED = False
        settings.LOGIN_MAX_ATTEMPTS = 10
        ratelimit.reset()
