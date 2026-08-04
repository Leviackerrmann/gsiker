"""Tests de aislamiento multi-tenant: la empresa A no ve datos de la empresa B."""


async def _crear_sku(client, headers, codigo, descripcion="Producto"):
    resp = await client.post("/api/skus", json={"codigo_sku": codigo, "descripcion": descripcion}, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_onboarding_crea_empresa_y_admin(client, empresa_factory):
    headers = await empresa_factory("Acme SA", "admin_acme")
    me = await client.get("/api/auth/me", headers=headers)
    assert me.status_code == 200
    data = me.json()
    assert data["rol"] == "admin"
    assert data["empresa_id"] is not None


async def test_empresa_no_ve_skus_de_otra(client, empresa_factory):
    headers_a = await empresa_factory("Empresa A", "admin_a")
    headers_b = await empresa_factory("Empresa B", "admin_b")

    # Cada empresa crea un SKU con EL MISMO código (único por empresa, no global).
    sku_a = await _crear_sku(client, headers_a, "PROD-1", "Producto de A")
    sku_b = await _crear_sku(client, headers_b, "PROD-1", "Producto de B")

    # A solo ve el suyo.
    lista_a = (await client.get("/api/skus", headers=headers_a)).json()
    assert [s["codigo_sku"] for s in lista_a] == ["PROD-1"]
    assert lista_a[0]["descripcion"] == "Producto de A"

    # B solo ve el suyo.
    lista_b = (await client.get("/api/skus", headers=headers_b)).json()
    assert [s["id"] for s in lista_b] == [sku_b["id"]]

    # B NO puede acceder al SKU de A por id directo.
    fuga = await client.get(f"/api/skus/{sku_a['id']}", headers=headers_b)
    assert fuga.status_code == 404


async def test_codigo_sku_unico_por_empresa_pero_repetible_entre_empresas(client, empresa_factory):
    headers_a = await empresa_factory("Empresa A", "admin_a")
    headers_b = await empresa_factory("Empresa B", "admin_b")

    await _crear_sku(client, headers_a, "REP-1")
    # Mismo código en la misma empresa -> conflicto.
    dup = await client.post("/api/skus", json={"codigo_sku": "REP-1", "descripcion": "x"}, headers=headers_a)
    assert dup.status_code == 400
    # Mismo código en otra empresa -> permitido.
    ok = await client.post("/api/skus", json={"codigo_sku": "REP-1", "descripcion": "x"}, headers=headers_b)
    assert ok.status_code == 201


async def test_sin_token_no_autorizado(client):
    resp = await client.get("/api/skus")
    assert resp.status_code in (401, 403)


async def test_dashboard_aislado(client, empresa_factory):
    headers_a = await empresa_factory("Empresa A", "admin_a")
    headers_b = await empresa_factory("Empresa B", "admin_b")
    await _crear_sku(client, headers_a, "D-1")
    await _crear_sku(client, headers_a, "D-2")

    dash_a = (await client.get("/api/dashboard", headers=headers_a)).json()
    dash_b = (await client.get("/api/dashboard", headers=headers_b)).json()
    assert dash_a["sku_count"] == 2
    assert dash_b["sku_count"] == 0
