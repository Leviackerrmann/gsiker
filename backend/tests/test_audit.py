"""Tests de la bitácora de auditoría (AuditMiddleware + /api/audit)."""


async def _crear_sku(client, headers, codigo, descripcion="Producto"):
    resp = await client.post("/api/skus", json={"codigo_sku": codigo, "descripcion": descripcion}, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_auditoria_registra_mutaciones_con_usuario_y_empresa(client, empresa_factory):
    headers = await empresa_factory("Acme SA", "admin_acme")
    await _crear_sku(client, headers, "AUD-1")

    audit = (await client.get("/api/audit", headers=headers)).json()

    # La creación de SKU quedó registrada...
    sku_entries = [e for e in audit if e["ruta"] == "/api/skus" and e["metodo"] == "POST"]
    assert sku_entries, f"no se auditó la creación de SKU: {audit}"
    # ...con el usuario y la empresa resueltos.
    assert sku_entries[0]["usuario_id"] is not None
    assert sku_entries[0]["empresa_id"] is not None
    assert sku_entries[0]["status_code"] == 201

    # Nunca se auditan lecturas (GET): solo mutaciones.
    assert all(e["metodo"] in {"POST", "PUT", "PATCH", "DELETE"} for e in audit)


async def test_auditoria_registra_login(client, empresa_factory):
    await empresa_factory("Beta SA", "admin_beta")

    resp = await client.post("/api/auth/login", json={"username": "admin_beta", "password": "secret123"})
    assert resp.status_code == 200
    headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}

    audit = (await client.get("/api/audit", headers=headers)).json()
    login_entries = [e for e in audit if e["accion"] == "login"]
    assert login_entries, f"no se auditó el login: {audit}"
    assert login_entries[0]["usuario_id"] is not None


async def test_audit_solo_visible_para_admin(client, empresa_factory):
    headers_admin = await empresa_factory("Gamma SA", "admin_gamma")

    # Crear un operador en la misma empresa.
    creado = await client.post(
        "/api/usuarios",
        json={"username": "oper1", "password": "secret123", "nombre_completo": "Operador", "rol": "operador"},
        headers=headers_admin,
    )
    assert creado.status_code in (200, 201), creado.text

    login = await client.post("/api/auth/login", json={"username": "oper1", "password": "secret123"})
    op_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    # El operador no puede ver la bitácora.
    resp = await client.get("/api/audit", headers=op_headers)
    assert resp.status_code == 403


async def test_una_empresa_no_ve_la_auditoria_de_otra(client, empresa_factory):
    headers_a = await empresa_factory("Empresa A Audit", "admin_a_audit")
    headers_b = await empresa_factory("Empresa B Audit", "admin_b_audit")

    await _crear_sku(client, headers_a, "SOLO-A")

    audit_b = (await client.get("/api/audit", headers=headers_b)).json()
    # B no debe ver ninguna entrada de la creación de SKU de A.
    assert all(e["ruta"] != "/api/skus" for e in audit_b), f"B vio auditoría de A: {audit_b}"
