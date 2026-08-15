"""Tests del 2FA (TOTP): alta, login en dos pasos, desactivación y endurecimiento."""

import pyotp


async def _activar_2fa(client, headers) -> str:
    """Da de alta 2FA para el usuario autenticado y devuelve su secreto TOTP."""
    setup = await client.post("/api/auth/2fa/setup", headers=headers)
    assert setup.status_code == 200, setup.text
    secret = setup.json()["secret"]
    assert setup.json()["otpauth_uri"].startswith("otpauth://totp/")

    code = pyotp.TOTP(secret).now()
    verify = await client.post("/api/auth/2fa/verify", json={"code": code}, headers=headers)
    assert verify.status_code == 200, verify.text
    return secret


async def test_alta_2fa_activa_el_flag(client, empresa_factory):
    headers = await empresa_factory("Acme 2FA", "admin_2fa")

    me_antes = (await client.get("/api/auth/me", headers=headers)).json()
    assert me_antes["totp_enabled"] is False

    await _activar_2fa(client, headers)

    me_despues = (await client.get("/api/auth/me", headers=headers)).json()
    assert me_despues["totp_enabled"] is True


async def test_login_dos_pasos_con_2fa(client, empresa_factory):
    headers = await empresa_factory("Beta 2FA", "admin_beta2fa")
    secret = await _activar_2fa(client, headers)

    # Paso 1: usuario+contraseña ya NO entrega token, pide 2FA.
    paso1 = await client.post("/api/auth/login", json={"username": "admin_beta2fa", "password": "secret123"})
    assert paso1.status_code == 200
    body1 = paso1.json()
    assert body1["twofa_required"] is True
    assert body1["access_token"] is None
    assert body1["twofa_token"]

    # Paso 2 con código incorrecto → 401.
    malo = await client.post("/api/auth/login/2fa", json={"twofa_token": body1["twofa_token"], "code": "000000"})
    assert malo.status_code == 401

    # Paso 2 con código correcto → token de acceso válido.
    code = pyotp.TOTP(secret).now()
    paso2 = await client.post("/api/auth/login/2fa", json={"twofa_token": body1["twofa_token"], "code": code})
    assert paso2.status_code == 200, paso2.text
    access = paso2.json()["access_token"]
    assert access

    me = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {access}"})
    assert me.status_code == 200


async def test_token_intermedio_2fa_no_sirve_como_acceso(client, empresa_factory):
    headers = await empresa_factory("Gamma 2FA", "admin_gamma2fa")
    await _activar_2fa(client, headers)

    paso1 = await client.post("/api/auth/login", json={"username": "admin_gamma2fa", "password": "secret123"})
    twofa_token = paso1.json()["twofa_token"]

    # Intentar usar el token intermedio como credencial de acceso → 401.
    resp = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {twofa_token}"})
    assert resp.status_code == 401


async def test_desactivar_2fa_requiere_codigo(client, empresa_factory):
    headers = await empresa_factory("Delta 2FA", "admin_delta2fa")
    secret = await _activar_2fa(client, headers)

    # Código incorrecto → no desactiva.
    malo = await client.post("/api/auth/2fa/disable", json={"code": "000000"}, headers=headers)
    assert malo.status_code == 400

    # Código correcto → desactiva.
    code = pyotp.TOTP(secret).now()
    ok = await client.post("/api/auth/2fa/disable", json={"code": code}, headers=headers)
    assert ok.status_code == 200

    # Ahora el login vuelve a ser de un solo paso.
    login = await client.post("/api/auth/login", json={"username": "admin_delta2fa", "password": "secret123"})
    assert login.json()["access_token"]
    assert login.json()["twofa_required"] is False


async def test_setup_rechaza_si_ya_esta_activo(client, empresa_factory):
    headers = await empresa_factory("Epsilon 2FA", "admin_eps2fa")
    await _activar_2fa(client, headers)

    resp = await client.post("/api/auth/2fa/setup", headers=headers)
    assert resp.status_code == 400
