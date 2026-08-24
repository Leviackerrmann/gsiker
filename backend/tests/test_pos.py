"""Tests del punto de venta (POS): venta rápida, arqueo de caja, IVA incluido."""


async def _crear_bodega(client, headers, nombre="Principal"):
    r = await client.post("/api/inventario/bodegas", json={"nombre": nombre}, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _crear_sku(client, headers, codigo, costo=5.0):
    r = await client.post(
        "/api/skus",
        json={"codigo_sku": codigo, "descripcion": "Producto", "costo_unitario": costo},
        headers=headers,
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _entrada_stock(client, headers, sku_id, bodega_id, cantidad):
    r = await client.post(
        "/api/inventario/movimientos",
        json={"tipo": "entrada", "motivo": "stock_inicial", "sku_id": sku_id,
              "bodega_id": bodega_id, "cantidad": cantidad, "costo_unitario": 5.0},
        headers=headers,
    )
    assert r.status_code == 201, r.text


async def _setup_tienda(client, headers, stock=100.0):
    bodega_id = await _crear_bodega(client, headers)
    sku_id = await _crear_sku(client, headers, "POS-SKU-1")
    await _entrada_stock(client, headers, sku_id, bodega_id, stock)
    caja = await client.post("/api/pos/caja/abrir", json={"monto_inicial": 100.0}, headers=headers)
    assert caja.status_code == 201, caja.text
    return bodega_id, sku_id, caja.json()["id"]


async def test_venta_pos_descuenta_stock_y_desglosa_iva(client, empresa_factory):
    headers = await empresa_factory("Tienda A", "cajero_a")
    bodega_id, sku_id, caja_id = await _setup_tienda(client, headers)

    # Vende 2 unidades a Q56 c/u (IVA incluido) = Q112. Paga con Q120 en efectivo.
    venta = await client.post("/api/pos/ventas", json={
        "caja_sesion_id": caja_id,
        "bodega_id": bodega_id,
        "items": [{"sku_id": sku_id, "cantidad": 2, "precio_unitario": 56.0}],
        "pagos": [{"metodo": "efectivo", "monto": 112.0, "monto_recibido": 120.0}],
    }, headers=headers)
    assert venta.status_code == 201, venta.text
    v = venta.json()

    # IVA (12%) incluido en el precio: total 112 = subtotal 100 + IVA 12.
    assert v["total"] == 112.0
    assert v["subtotal"] == 100.0
    assert v["impuesto_total"] == 12.0
    # Cambio de efectivo: 120 - 112 = 8.
    assert v["pagos"][0]["cambio"] == 8.0
    assert v["numero"].startswith("POS-")

    # El stock bajó de 100 a 98.
    stock = (await client.get("/api/inventario/stock", headers=headers)).json()
    fila = next(s for s in stock if s["sku_id"] == sku_id)
    assert fila["cantidad"] == 98.0


async def test_venta_pos_con_descuento_trazable(client, empresa_factory):
    headers = await empresa_factory("Tienda D", "cajero_d")
    bodega_id, sku_id, caja_id = await _setup_tienda(client, headers)

    # 2 × Q56 = Q112 bruto. Descuento 10% → Q11.20 → total Q100.80. Se paga exacto.
    venta = await client.post("/api/pos/ventas", json={
        "caja_sesion_id": caja_id,
        "bodega_id": bodega_id,
        "items": [{"sku_id": sku_id, "cantidad": 2, "precio_unitario": 56.0}],
        "descuento_porcentaje": 10,
        "pagos": [{"metodo": "efectivo", "monto": 100.80, "monto_recibido": 100.80}],
    }, headers=headers)
    assert venta.status_code == 201, venta.text
    v = venta.json()

    # Trazabilidad: se registra el % y el monto del descuento.
    assert v["descuento_porcentaje"] == 10.0
    assert v["descuento_monto"] == 11.2
    # El total ya rebajado; IVA (12%) incluido: 100.80 = 90 + 10.80.
    assert v["total"] == 100.8
    assert v["subtotal"] == 90.0
    assert v["impuesto_total"] == 10.8
    # Los ítems conservan su precio pleno (no se pierde el margen de línea).
    assert v["items"][0]["precio_unitario"] == 56.0
    assert v["items"][0]["precio_total"] == 112.0


async def test_venta_falla_si_pagos_no_cubren_total(client, empresa_factory):
    headers = await empresa_factory("Tienda B", "cajero_b")
    bodega_id, sku_id, caja_id = await _setup_tienda(client, headers)

    r = await client.post("/api/pos/ventas", json={
        "caja_sesion_id": caja_id,
        "bodega_id": bodega_id,
        "items": [{"sku_id": sku_id, "cantidad": 1, "precio_unitario": 100.0}],
        "pagos": [{"metodo": "efectivo", "monto": 50.0}],
    }, headers=headers)
    assert r.status_code == 400


async def test_venta_falla_por_stock_insuficiente(client, empresa_factory):
    headers = await empresa_factory("Tienda C", "cajero_c")
    bodega_id, sku_id, caja_id = await _setup_tienda(client, headers, stock=1.0)

    r = await client.post("/api/pos/ventas", json={
        "caja_sesion_id": caja_id,
        "bodega_id": bodega_id,
        "items": [{"sku_id": sku_id, "cantidad": 5, "precio_unitario": 10.0}],
        "pagos": [{"metodo": "efectivo", "monto": 50.0}],
    }, headers=headers)
    assert r.status_code == 400


async def test_no_se_puede_abrir_dos_cajas(client, empresa_factory):
    headers = await empresa_factory("Tienda D", "cajero_d")
    await client.post("/api/pos/caja/abrir", json={"monto_inicial": 0.0}, headers=headers)
    r = await client.post("/api/pos/caja/abrir", json={"monto_inicial": 0.0}, headers=headers)
    assert r.status_code == 400


async def test_arqueo_al_cerrar_caja(client, empresa_factory):
    headers = await empresa_factory("Tienda E", "cajero_e")
    bodega_id, sku_id, caja_id = await _setup_tienda(client, headers)

    # Una venta de Q112 en efectivo.
    await client.post("/api/pos/ventas", json={
        "caja_sesion_id": caja_id,
        "bodega_id": bodega_id,
        "items": [{"sku_id": sku_id, "cantidad": 2, "precio_unitario": 56.0}],
        "pagos": [{"metodo": "efectivo", "monto": 112.0}],
    }, headers=headers)

    # Esperado = 100 inicial + 112 efectivo = 212. Cajero declara 208 → falta 4.
    cierre = await client.post(f"/api/pos/caja/{caja_id}/cerrar",
                               json={"monto_final_declarado": 208.0}, headers=headers)
    assert cierre.status_code == 200, cierre.text
    c = cierre.json()
    assert c["estado"] == "cerrada"
    assert c["monto_esperado"] == 212.0
    assert c["diferencia"] == -4.0


async def test_resumen_del_dia(client, empresa_factory):
    headers = await empresa_factory("Tienda F", "cajero_f")
    bodega_id, sku_id, caja_id = await _setup_tienda(client, headers)

    await client.post("/api/pos/ventas", json={
        "caja_sesion_id": caja_id,
        "bodega_id": bodega_id,
        "items": [{"sku_id": sku_id, "cantidad": 1, "precio_unitario": 50.0}],
        "pagos": [{"metodo": "tarjeta", "monto": 50.0}],
    }, headers=headers)

    resumen = (await client.get("/api/pos/resumen/hoy", headers=headers)).json()
    assert resumen["num_ventas"] == 1
    assert resumen["total"] == 50.0
    assert resumen["por_metodo"].get("tarjeta") == 50.0


async def _crear_cliente(client, headers, codigo="CLI-POS", nombre="Cliente Fiado"):
    r = await client.post("/api/ventas/clientes", json={"codigo": codigo, "nombre": nombre}, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def test_venta_a_credito_genera_cuenta_por_cobrar(client, empresa_factory):
    headers = await empresa_factory("Tienda Credito", "cajero_cr")
    bodega_id, sku_id, caja_id = await _setup_tienda(client, headers)
    cli = await _crear_cliente(client, headers)

    # Venta de Q100 totalmente al fiado (sin pagos).
    venta = await client.post("/api/pos/ventas", json={
        "caja_sesion_id": caja_id,
        "bodega_id": bodega_id,
        "cliente_id": cli,
        "items": [{"sku_id": sku_id, "cantidad": 1, "precio_unitario": 100.0}],
        "pagos": [],
        "a_credito": True,
    }, headers=headers)
    assert venta.status_code == 201, venta.text
    assert venta.json()["total"] == 100.0

    # Se creó una cuenta por cobrar con saldo = total.
    res = (await client.get("/api/cobranza/resumen", headers=headers)).json()
    assert res["por_cobrar"] == 100.0
    est = (await client.get(f"/api/cobranza/clientes/{cli}/estado-cuenta", headers=headers)).json()
    assert est["saldo_total"] == 100.0
    assert est["cuentas"][0]["origen"] == "venta_pos"


async def test_venta_a_credito_con_abono_parcial(client, empresa_factory):
    headers = await empresa_factory("Tienda Credito 2", "cajero_cr2")
    bodega_id, sku_id, caja_id = await _setup_tienda(client, headers)
    cli = await _crear_cliente(client, headers)

    # Venta Q100: paga Q30 en efectivo, Q70 quedan al fiado.
    venta = await client.post("/api/pos/ventas", json={
        "caja_sesion_id": caja_id,
        "bodega_id": bodega_id,
        "cliente_id": cli,
        "items": [{"sku_id": sku_id, "cantidad": 1, "precio_unitario": 100.0}],
        "pagos": [{"metodo": "efectivo", "monto": 30.0}],
        "a_credito": True,
    }, headers=headers)
    assert venta.status_code == 201, venta.text

    res = (await client.get("/api/cobranza/resumen", headers=headers)).json()
    assert res["por_cobrar"] == 70.0


async def test_venta_a_credito_sin_cliente_falla(client, empresa_factory):
    headers = await empresa_factory("Tienda Credito 3", "cajero_cr3")
    bodega_id, sku_id, caja_id = await _setup_tienda(client, headers)

    r = await client.post("/api/pos/ventas", json={
        "caja_sesion_id": caja_id,
        "bodega_id": bodega_id,
        "items": [{"sku_id": sku_id, "cantidad": 1, "precio_unitario": 100.0}],
        "pagos": [],
        "a_credito": True,
    }, headers=headers)
    assert r.status_code == 400


async def test_idempotencia_evita_venta_duplicada(client, empresa_factory):
    headers = await empresa_factory("Tienda Idem", "cajero_idem")
    bodega_id, sku_id, caja_id = await _setup_tienda(client, headers, stock=100.0)

    body = {
        "caja_sesion_id": caja_id,
        "bodega_id": bodega_id,
        "items": [{"sku_id": sku_id, "cantidad": 2, "precio_unitario": 10.0}],
        "pagos": [{"metodo": "efectivo", "monto": 20.0}],
        "idempotency_key": "clave-fija-123",
    }
    v1 = await client.post("/api/pos/ventas", json=body, headers=headers)
    v2 = await client.post("/api/pos/ventas", json=body, headers=headers)
    assert v1.status_code == 201 and v2.status_code == 201, (v1.text, v2.text)
    # Misma venta devuelta, no una nueva.
    assert v1.json()["id"] == v2.json()["id"]
    assert v1.json()["numero"] == v2.json()["numero"]

    # Solo se registró una venta y el stock bajó una sola vez (100 - 2 = 98).
    ventas = (await client.get("/api/pos/ventas", headers=headers)).json()
    assert len(ventas) == 1
    stock = (await client.get("/api/inventario/stock", headers=headers)).json()
    fila = next(s for s in stock if s["sku_id"] == sku_id)
    assert fila["cantidad"] == 98.0


async def test_una_tienda_no_ve_ventas_de_otra(client, empresa_factory):
    headers_a = await empresa_factory("Tienda G", "cajero_g")
    headers_b = await empresa_factory("Tienda H", "cajero_h")

    bodega_id, sku_id, caja_id = await _setup_tienda(client, headers_a)
    venta = await client.post("/api/pos/ventas", json={
        "caja_sesion_id": caja_id,
        "bodega_id": bodega_id,
        "items": [{"sku_id": sku_id, "cantidad": 1, "precio_unitario": 10.0}],
        "pagos": [{"metodo": "efectivo", "monto": 10.0}],
    }, headers=headers_a)
    venta_id = venta.json()["id"]

    # B no puede ver la venta de A.
    fuga = await client.get(f"/api/pos/ventas/{venta_id}", headers=headers_b)
    assert fuga.status_code == 404
