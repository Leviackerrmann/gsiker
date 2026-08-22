"""Onboarding por teléfono/WhatsApp y Google (registro sin contraseña)."""
import pytest


async def _send_code(client, cc="+502", num="5555-1234"):
    r = await client.post("/api/auth/phone/send-code", json={"country_code": cc, "phone_number": num})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.mark.asyncio
async def test_send_code_normaliza_y_devuelve_dev_code(client):
    data = await _send_code(client, "+502", "5555-1234")
    # Normaliza a E.164 (sin separadores).
    assert data["phone_number"] == "+50255551234"
    # En modo desarrollo (WhatsApp deshabilitado) devuelve el código para probar.
    assert data["dev_code"] and len(data["dev_code"]) == 6


@pytest.mark.asyncio
async def test_flujo_completo_telefono_crea_usuario_y_negocio(client):
    data = await _send_code(client)
    phone, code = data["phone_number"], data["dev_code"]

    # Verificar el código → crea el usuario y devuelve JWT (aún SIN empresa).
    r = await client.post("/api/auth/phone/verify", json={"phone_number": phone, "code": code})
    assert r.status_code == 200, r.text
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}

    me = (await client.get("/api/auth/me", headers=headers)).json()
    assert me["empresa_id"] is None
    assert me["phone_number"] == phone
    assert me["auth_method"] == "phone"

    # Crear el negocio → asigna trial, guarda categoría y nombre del dueño.
    r = await client.post(
        "/api/businesses",
        json={"nombre": "Tienda Tel", "nombre_usuario": "Ana Ruiz", "categoria": "Tienda de barrio"},
        headers=headers,
    )
    assert r.status_code == 201, r.text
    assert r.json()["nombre"] == "Tienda Tel"
    assert r.json()["tipo_negocio"] == "Tienda de barrio"

    me2 = (await client.get("/api/auth/me", headers=headers)).json()
    assert me2["empresa_id"] is not None
    assert me2["nombre_completo"] == "Ana Ruiz"
    assert "pos" in me2["modulos_visibles"]


@pytest.mark.asyncio
async def test_no_se_puede_crear_dos_negocios(client):
    data = await _send_code(client)
    r = await client.post("/api/auth/phone/verify", json={"phone_number": data["phone_number"], "code": data["dev_code"]})
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    r1 = await client.post("/api/businesses", json={"nombre": "Negocio Uno"}, headers=headers)
    assert r1.status_code == 201
    r2 = await client.post("/api/businesses", json={"nombre": "Negocio Dos"}, headers=headers)
    assert r2.status_code == 400


@pytest.mark.asyncio
async def test_codigo_invalido_rechazado(client):
    data = await _send_code(client)
    malo = f"{(int(data['dev_code']) + 1) % 1_000_000:06d}"
    r = await client.post("/api/auth/phone/verify", json={"phone_number": data["phone_number"], "code": malo})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_reenvio_invalida_codigo_anterior(client):
    d1 = await _send_code(client)
    d2 = await _send_code(client)  # segundo código: invalida el primero
    phone = d1["phone_number"]

    # El primer código ya no sirve.
    r_viejo = await client.post("/api/auth/phone/verify", json={"phone_number": phone, "code": d1["dev_code"]})
    assert r_viejo.status_code == 401

    # El segundo sí (salvo colisión 1/1.000.000 de que sean iguales).
    if d2["dev_code"] != d1["dev_code"]:
        r_nuevo = await client.post("/api/auth/phone/verify", json={"phone_number": phone, "code": d2["dev_code"]})
        assert r_nuevo.status_code == 200


@pytest.mark.asyncio
async def test_agregar_password_de_respaldo_y_loguear(client):
    # Usuario que entró por teléfono agrega usuario+contraseña como respaldo.
    data = await _send_code(client)
    r = await client.post("/api/auth/phone/verify", json={"phone_number": data["phone_number"], "code": data["dev_code"]})
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}

    me = (await client.get("/api/auth/me", headers=headers)).json()
    assert me["has_password"] is False

    r = await client.post("/api/auth/set-password", json={"username": "carlos99", "password": "clave1234"}, headers=headers)
    assert r.status_code == 200, r.text

    # Ahora puede entrar con usuario+contraseña, SIN el teléfono.
    r = await client.post("/api/auth/login", json={"username": "carlos99", "password": "clave1234"})
    assert r.status_code == 200, r.text
    h2 = {"Authorization": f"Bearer {r.json()['access_token']}"}
    me2 = (await client.get("/api/auth/me", headers=h2)).json()
    assert me2["has_password"] is True
    assert me2["username"] == "carlos99"


@pytest.mark.asyncio
async def test_google_deshabilitado_sin_client_id(client):
    # Sin GOOGLE_CLIENT_ID configurado, el endpoint responde 501 (botón "Próximamente").
    r = await client.post("/api/auth/google", json={"token": "lo-que-sea"})
    assert r.status_code == 501
