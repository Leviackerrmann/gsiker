"""WP2 multi-moneda: una compra en USD valoriza el inventario en GTQ (base)."""


async def test_recepcion_en_usd_convierte_costo_a_gtq(client, empresa_factory):
    headers = await empresa_factory("Acme SA", "admin_acme")

    # SKU y bodega.
    sku = (await client.post("/api/skus", json={"codigo_sku": "IMP-1", "descripcion": "Importado"}, headers=headers)).json()
    bodega = (await client.post("/api/inventario/bodegas", json={"nombre": "Central"}, headers=headers)).json()

    # Proveedor en USD.
    prov_resp = await client.post("/api/compras/proveedores", json={"codigo": "P-USD", "nombre": "Foreign Co", "moneda": "USD"}, headers=headers)
    assert prov_resp.status_code == 201, prov_resp.text
    prov = prov_resp.json()
    assert prov["moneda"] == "USD"

    # OC: moneda y tipo de cambio se derivan del proveedor y la empresa (7.80 por defecto).
    oc_resp = await client.post("/api/compras/ordenes", json={
        "proveedor_id": prov["id"],
        "items": [{"sku_id": sku["id"], "cantidad_solicitada": 5, "costo_unitario": 10.0}],
    }, headers=headers)
    assert oc_resp.status_code == 201, oc_resp.text
    oc = oc_resp.json()
    assert oc["moneda"] == "USD"
    assert oc["tipo_cambio"] == 7.80
    item_orden_id = oc["items"][0]["id"]

    # Recepción total.
    rec = await client.post(f"/api/compras/ordenes/{oc['id']}/recibir", json={
        "bodega_id": bodega["id"],
        "items": [{"item_orden_id": item_orden_id, "cantidad_recibida": 5}],
    }, headers=headers)
    assert rec.status_code == 201, rec.text

    # El costo del SKU (base GTQ) = 10 USD * 7.80 = 78.00
    sku_after = (await client.get(f"/api/skus/{sku['id']}", headers=headers)).json()
    assert sku_after["costo_unitario"] == 78.0

    # El movimiento de inventario quedó en GTQ.
    movs = (await client.get(f"/api/inventario/movimientos?sku_id={sku['id']}", headers=headers)).json()
    assert len(movs) == 1
    assert movs[0]["costo_unitario"] == 78.0
    assert movs[0]["costo_total"] == 390.0  # 5 * 78


async def test_oc_en_gtq_no_convierte(client, empresa_factory):
    headers = await empresa_factory("Beta SA", "admin_beta")
    sku = (await client.post("/api/skus", json={"codigo_sku": "LOC-1", "descripcion": "Local"}, headers=headers)).json()
    bodega = (await client.post("/api/inventario/bodegas", json={"nombre": "Bodega1"}, headers=headers)).json()
    prov = (await client.post("/api/compras/proveedores", json={"codigo": "P-GTQ", "nombre": "Local Co"}, headers=headers)).json()
    assert prov["moneda"] == "GTQ"

    oc = (await client.post("/api/compras/ordenes", json={
        "proveedor_id": prov["id"],
        "items": [{"sku_id": sku["id"], "cantidad_solicitada": 2, "costo_unitario": 50.0}],
    }, headers=headers)).json()
    assert oc["moneda"] == "GTQ"
    assert oc["tipo_cambio"] == 1.0

    await client.post(f"/api/compras/ordenes/{oc['id']}/recibir", json={
        "bodega_id": bodega["id"],
        "items": [{"item_orden_id": oc["items"][0]["id"], "cantidad_recibida": 2}],
    }, headers=headers)

    sku_after = (await client.get(f"/api/skus/{sku['id']}", headers=headers)).json()
    assert sku_after["costo_unitario"] == 50.0
