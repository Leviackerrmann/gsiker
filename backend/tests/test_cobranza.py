"""Tests de cobranza / cuentas por cobrar (fiado): abonos parciales, saldo, aging."""


async def _crear_cliente(client, headers, codigo="CLI-1", nombre="Doña Mari"):
    r = await client.post("/api/ventas/clientes", json={"codigo": codigo, "nombre": nombre}, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _crear_cuenta(client, headers, cliente_id, monto=100.0, **extra):
    r = await client.post("/api/cobranza/cuentas",
                          json={"cliente_id": cliente_id, "monto_total": monto, **extra}, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


async def test_crear_cuenta_arranca_pendiente_con_saldo_total(client, empresa_factory):
    headers = await empresa_factory("Tienda Fiado", "cajero_f1")
    cli = await _crear_cliente(client, headers)
    cuenta = await _crear_cuenta(client, headers, cli, 250.0, concepto="Fiado de la semana")

    assert cuenta["estado"] == "pendiente"
    assert cuenta["monto_total"] == 250.0
    assert cuenta["saldo_pendiente"] == 250.0
    assert cuenta["concepto"] == "Fiado de la semana"


async def test_abono_parcial_baja_saldo_y_marca_parcial(client, empresa_factory):
    headers = await empresa_factory("Tienda Fiado 2", "cajero_f2")
    cli = await _crear_cliente(client, headers)
    cuenta = await _crear_cuenta(client, headers, cli, 100.0)

    r = await client.post(f"/api/cobranza/cuentas/{cuenta['id']}/abonos",
                          json={"monto": 40.0, "metodo": "efectivo"}, headers=headers)
    assert r.status_code == 201, r.text

    det = (await client.get(f"/api/cobranza/cuentas/{cuenta['id']}", headers=headers)).json()
    assert det["estado"] == "parcial"
    assert det["saldo_pendiente"] == 60.0
    assert len(det["abonos"]) == 1
    assert det["abonos"][0]["monto"] == 40.0


async def test_abono_total_marca_pagada(client, empresa_factory):
    headers = await empresa_factory("Tienda Fiado 3", "cajero_f3")
    cli = await _crear_cliente(client, headers)
    cuenta = await _crear_cuenta(client, headers, cli, 80.0)

    await client.post(f"/api/cobranza/cuentas/{cuenta['id']}/abonos", json={"monto": 30.0}, headers=headers)
    await client.post(f"/api/cobranza/cuentas/{cuenta['id']}/abonos", json={"monto": 50.0}, headers=headers)

    det = (await client.get(f"/api/cobranza/cuentas/{cuenta['id']}", headers=headers)).json()
    assert det["estado"] == "pagada"
    assert det["saldo_pendiente"] == 0.0


async def test_abono_excede_saldo_falla(client, empresa_factory):
    headers = await empresa_factory("Tienda Fiado 4", "cajero_f4")
    cli = await _crear_cliente(client, headers)
    cuenta = await _crear_cuenta(client, headers, cli, 50.0)

    r = await client.post(f"/api/cobranza/cuentas/{cuenta['id']}/abonos", json={"monto": 60.0}, headers=headers)
    assert r.status_code == 400


async def test_estado_cuenta_cliente_suma_saldo_y_aging(client, empresa_factory):
    headers = await empresa_factory("Tienda Fiado 5", "cajero_f5")
    cli = await _crear_cliente(client, headers)
    await _crear_cuenta(client, headers, cli, 100.0)
    c2 = await _crear_cuenta(client, headers, cli, 200.0)
    await client.post(f"/api/cobranza/cuentas/{c2['id']}/abonos", json={"monto": 50.0}, headers=headers)

    est = (await client.get(f"/api/cobranza/clientes/{cli}/estado-cuenta", headers=headers)).json()
    # Saldo = 100 + (200 - 50) = 250; cuentas recién creadas → todo "corriente".
    assert est["saldo_total"] == 250.0
    assert est["aging"]["corriente"] == 250.0
    assert len(est["cuentas"]) == 2


async def test_resumen_cobranza(client, empresa_factory):
    headers = await empresa_factory("Tienda Fiado 6", "cajero_f6")
    cli = await _crear_cliente(client, headers)
    await _crear_cuenta(client, headers, cli, 100.0)
    await _crear_cuenta(client, headers, cli, 40.0)

    res = (await client.get("/api/cobranza/resumen", headers=headers)).json()
    assert res["cuentas_abiertas"] == 2
    assert res["por_cobrar"] == 140.0


async def test_una_empresa_no_ve_cuentas_de_otra(client, empresa_factory):
    headers_a = await empresa_factory("Tienda Fiado A", "cajero_fa")
    headers_b = await empresa_factory("Tienda Fiado B", "cajero_fb")

    cli_a = await _crear_cliente(client, headers_a)
    cuenta = await _crear_cuenta(client, headers_a, cli_a, 100.0)

    fuga = await client.get(f"/api/cobranza/cuentas/{cuenta['id']}", headers=headers_b)
    assert fuga.status_code == 404
