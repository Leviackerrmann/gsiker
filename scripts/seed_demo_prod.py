#!/usr/bin/env python3
"""Puebla la empresa DEMO de producción (gsiker) con data abundante y realista
vía la API pública. Todo pasa por la lógica de negocio (RLS, stock, IVA, cobranza).

Uso:
    python3 seed_demo_prod.py

No borra nada: crea SKUs, bodegas, stock, proveedores, clientes, ventas POS
(contado y fiado), abonos y órdenes de compra. Es tolerante a errores: si algo
ya existe o falla, lo salta y continúa.
"""
import json
import random
import time
import urllib.error
import urllib.request

BASE = "https://161.153.59.104.sslip.io/api"
USER, PWD = "demo", "demo1234"
random.seed(42)

TOKEN = None


def call(method, path, body=None, auth=True):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if auth and TOKEN:
        req.add_header("Authorization", f"Bearer {TOKEN}")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read().decode()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            detail = json.loads(raw).get("detail", raw)
        except Exception:
            detail = raw
        return e.code, detail
    except Exception as e:
        return 0, str(e)


def login():
    global TOKEN
    st, body = call("POST", "/auth/login", {"username": USER, "password": PWD}, auth=False)
    assert st == 200 and body.get("access_token"), f"login falló: {st} {body}"
    TOKEN = body["access_token"]
    print("✔ login OK")


# ─────────────────────────── Catálogo realista ───────────────────────────
# (descripcion, categoria, unidad, precio_venta_IVA_incl, costo)
PRODUCTOS = [
    ("Arroz Blanco 1 lb", "Abarrotes", "LIBRA", 7.50, 5.20),
    ("Frijol Negro 1 lb", "Abarrotes", "LIBRA", 9.00, 6.30),
    ("Azúcar Blanca 1 lb", "Abarrotes", "LIBRA", 6.00, 4.10),
    ("Sal Refinada 1 lb", "Abarrotes", "LIBRA", 3.50, 2.00),
    ("Aceite Vegetal 800ml", "Abarrotes", "UNIDAD", 22.00, 16.50),
    ("Harina de Maíz 1 kg", "Abarrotes", "UNIDAD", 11.00, 7.80),
    ("Pasta Espagueti 200g", "Abarrotes", "UNIDAD", 5.50, 3.40),
    ("Café Molido 100g", "Abarrotes", "UNIDAD", 14.00, 9.50),
    ("Consomé de Pollo 12u", "Abarrotes", "CAJA", 8.00, 5.50),
    ("Salsa de Tomate 215g", "Enlatados", "UNIDAD", 6.50, 4.20),
    ("Frijoles Molidos 220g", "Enlatados", "UNIDAD", 7.00, 4.80),
    ("Atún en Agua 140g", "Enlatados", "UNIDAD", 12.00, 8.60),
    ("Sardina en Tomate 155g", "Enlatados", "UNIDAD", 9.50, 6.40),
    ("Maíz Dulce Lata 220g", "Enlatados", "UNIDAD", 10.00, 6.90),
    ("Coca-Cola 600ml", "Bebidas", "UNIDAD", 8.00, 5.50),
    ("Agua Pura 600ml", "Bebidas", "UNIDAD", 4.00, 2.30),
    ("Jugo de Naranja 1L", "Bebidas", "UNIDAD", 13.00, 9.00),
    ("Gaseosa Grande 2.5L", "Bebidas", "UNIDAD", 18.00, 12.50),
    ("Cerveza Lata 350ml", "Bebidas", "UNIDAD", 10.00, 7.20),
    ("Energizante 250ml", "Bebidas", "UNIDAD", 12.00, 8.00),
    ("Leche Entera 1L", "Lácteos", "UNIDAD", 12.50, 9.20),
    ("Queso Fresco 1 lb", "Lácteos", "LIBRA", 22.00, 16.00),
    ("Crema 200ml", "Lácteos", "UNIDAD", 9.00, 6.10),
    ("Yogurt Bebible 200ml", "Lácteos", "UNIDAD", 6.00, 3.90),
    ("Huevos Cartón 30u", "Lácteos", "CARTON", 42.00, 33.00),
    ("Mantequilla 200g", "Lácteos", "UNIDAD", 15.00, 10.50),
    ("Pan Molde Blanco", "Panadería", "UNIDAD", 16.00, 11.00),
    ("Pan Dulce 6u", "Panadería", "PAQUETE", 12.00, 7.50),
    ("Tortillas 20u", "Panadería", "PAQUETE", 8.00, 5.00),
    ("Galletas Saladas 200g", "Snacks", "UNIDAD", 7.50, 4.80),
    ("Papas Fritas 45g", "Snacks", "UNIDAD", 6.00, 3.80),
    ("Churros de Maíz 40g", "Snacks", "UNIDAD", 5.00, 3.00),
    ("Chocolate Barra 40g", "Snacks", "UNIDAD", 6.50, 4.10),
    ("Chicle Paquete", "Snacks", "UNIDAD", 3.00, 1.60),
    ("Maní Salado 100g", "Snacks", "UNIDAD", 8.00, 5.20),
    ("Jabón de Baño 110g", "Cuidado Personal", "UNIDAD", 6.50, 4.10),
    ("Shampoo Sachet", "Cuidado Personal", "UNIDAD", 2.50, 1.30),
    ("Pasta Dental 75ml", "Cuidado Personal", "UNIDAD", 14.00, 9.80),
    ("Papel Higiénico 4u", "Cuidado Personal", "PAQUETE", 18.00, 13.00),
    ("Desodorante 50ml", "Cuidado Personal", "UNIDAD", 22.00, 15.50),
    ("Toallas Sanitarias 10u", "Cuidado Personal", "PAQUETE", 12.00, 8.20),
    ("Detergente 1 kg", "Limpieza", "UNIDAD", 24.00, 17.00),
    ("Jabón de Lavar Barra", "Limpieza", "UNIDAD", 5.00, 3.10),
    ("Cloro 1L", "Limpieza", "UNIDAD", 10.00, 6.50),
    ("Lavaplatos 500g", "Limpieza", "UNIDAD", 13.00, 9.00),
    ("Desinfectante 1L", "Limpieza", "UNIDAD", 16.00, 11.20),
    ("Esponja Multiuso 2u", "Limpieza", "PAQUETE", 7.00, 4.30),
    ("Bolsas Basura 10u", "Limpieza", "PAQUETE", 11.00, 7.40),
    ("Fósforos Caja", "Abarrotes", "UNIDAD", 2.00, 1.00),
    ("Vela Blanca 4u", "Abarrotes", "PAQUETE", 6.00, 3.60),
]

NOMBRES = [
    "María López", "Juan Pérez", "Ana García", "Carlos Ramírez", "Lucía Morales",
    "José Hernández", "Sofía Castillo", "Pedro Gómez", "Elena Ruiz", "Miguel Torres",
    "Rosa Díaz", "Luis Mendoza", "Carmen Flores", "Jorge Vásquez", "Patricia Cruz",
    "Roberto Aguilar", "Andrea Sánchez", "Fernando Reyes", "Gabriela Ortiz", "Diego Molina",
    "Verónica Chávez", "Ricardo Estrada", "Isabel Guzmán", "Marco Herrera", "Silvia Ramos",
    "Óscar Interiano", "Claudia Pineda", "Byron Alvarado", "Wendy Marroquín", "Estuardo Coc",
]

PROVEEDORES = [
    ("Distribuidora La Económica", "Abarrotes al por mayor"),
    ("Embotelladora Central S.A.", "Bebidas y gaseosas"),
    ("Lácteos del Valle", "Leche, queso y crema"),
    ("Panificadora San José", "Pan y repostería"),
    ("Productos de Limpieza Brillo", "Limpieza y hogar"),
    ("Snacks y Golosinas GT", "Snacks y dulces"),
    ("Higiene Personal Total", "Cuidado personal"),
    ("Enlatados del Pacífico", "Conservas y enlatados"),
    ("Comercial El Mayoreo", "Varios abarrotes"),
    ("Granos y Cereales Xela", "Arroz, frijol, azúcar"),
]


def main():
    login()

    # ── Bodegas ──
    print("\n▶ Bodegas")
    bod_ids = {}
    for nombre, ubic, enc in [
        ("Bodega Central", "Zona 12, Ciudad", "Byron Alvarado"),
        ("Tienda / Mostrador", "Local principal", "Wendy Marroquín"),
    ]:
        st, b = call("POST", "/inventario/bodegas", {"nombre": nombre, "ubicacion": ubic, "encargado": enc})
        if st == 201:
            bod_ids[nombre] = b["id"]
            print(f"  ✔ {nombre} (id {b['id']})")
        else:
            print(f"  ✖ {nombre}: {st} {b}")
    central = bod_ids.get("Bodega Central")
    tienda = bod_ids.get("Tienda / Mostrador")

    # ── SKUs ──
    print("\n▶ SKUs")
    skus = []  # (id, precio_venta)
    cat_prefix = {}
    for desc, cat, um, precio, costo in PRODUCTOS:
        pref = "".join([w[0] for w in cat.split()][:3]).upper()
        n = cat_prefix.get(pref, 0) + 1
        cat_prefix[pref] = n
        codigo = f"{pref}-{n:03d}"
        st, s = call("POST", "/skus", {
            "codigo_sku": codigo, "descripcion": desc, "unidad_medida": um,
            "precio_referencia": precio, "costo_unitario": costo,
            "categoria": cat,
        })
        if st == 201:
            skus.append((s["id"], precio))
        else:
            print(f"  ✖ {codigo} {desc}: {st} {s}")
    print(f"  ✔ {len(skus)} SKUs creados")

    # ── Stock inicial (entrada) ──
    print("\n▶ Stock inicial")
    n_ok = 0
    for sid, precio in skus:
        costo = next(c for _, _, _, p, c in PRODUCTOS if abs(p - precio) < 1e-9) if False else 0
        # Mucho stock en Tienda (para vender) y algo en Central.
        for bod, cant in ((tienda, random.randint(300, 600)), (central, random.randint(80, 200))):
            if not bod:
                continue
            st, _ = call("POST", "/inventario/movimientos", {
                "tipo": "entrada", "motivo": "stock_inicial",
                "sku_id": sid, "bodega_id": bod, "cantidad": cant,
                "referencia": "Carga inicial demo",
            })
            if st == 201:
                n_ok += 1
    print(f"  ✔ {n_ok} entradas de stock")

    # ── Proveedores ──
    print("\n▶ Proveedores")
    for i, (nombre, giro) in enumerate(PROVEEDORES, 1):
        st, _ = call("POST", "/compras/proveedores", {
            "codigo": f"PROV-{i:03d}", "nombre": nombre,
            "documento": f"{random.randint(1000000, 9999999)}-{random.randint(0,9)}",
            "telefono": f"5{random.randint(1000,8999)}-{random.randint(1000,9999)}",
            "email": f"ventas{i}@proveedor.com",
        })
        if st != 201:
            print(f"  ✖ {nombre}: {st}")
    print(f"  ✔ {len(PROVEEDORES)} proveedores")

    # ── Clientes ──
    print("\n▶ Clientes")
    cli_ids = []
    for i, nombre in enumerate(NOMBRES, 1):
        st, c = call("POST", "/ventas/clientes", {
            "codigo": f"CLI-{i:03d}", "nombre": nombre,
            "documento": f"{random.randint(1000000000000, 2999999999999)}",
            "telefono": f"4{random.randint(1000,8999)}-{random.randint(1000,9999)}",
            "email": f"{nombre.split()[0].lower()}{i}@correo.com",
            "direccion": f"Colonia {random.choice(['El Rosario','Las Flores','San Antonio','El Prado'])}, casa {random.randint(1,80)}",
        })
        if st == 201:
            cli_ids.append(c["id"])
        else:
            print(f"  ✖ {nombre}: {st} {c}")
    print(f"  ✔ {len(cli_ids)} clientes")

    # ── Caja ──
    print("\n▶ Caja")
    st, caja = call("POST", "/pos/caja/abrir", {"monto_inicial": 500.0})
    if st == 201:
        caja_id = caja["id"]
        print(f"  ✔ caja abierta (id {caja_id})")
    else:
        # Quizá ya hay una abierta
        st2, actual = call("GET", "/pos/caja/actual")
        caja_id = actual["id"] if actual else None
        print(f"  ⚠ usando caja existente: {caja_id} ({st} {caja})")
    assert caja_id, "no hay caja"

    # ── Ventas POS (contado + fiado) ──
    print("\n▶ Ventas POS")
    metodos = ["efectivo", "efectivo", "efectivo", "tarjeta", "transferencia"]
    n_contado = n_credito = 0
    cuentas_credito = []
    N_VENTAS = 140
    for v in range(N_VENTAS):
        n_items = random.randint(1, 5)
        elegidos = random.sample(skus, n_items)
        items, total = [], 0.0
        for sid, precio in elegidos:
            cant = random.randint(1, 4)
            items.append({"sku_id": sid, "cantidad": cant, "precio_unitario": precio})
            total += precio * cant
        total = round(total, 2)

        a_credito = random.random() < 0.28 and cli_ids
        payload = {
            "caja_sesion_id": caja_id, "bodega_id": tienda,
            "items": items, "a_credito": bool(a_credito),
        }
        if a_credito:
            payload["cliente_id"] = random.choice(cli_ids)
            # A veces abona una parte al momento, a veces 0 (fiado total)
            if random.random() < 0.5:
                parcial = round(total * random.choice([0.3, 0.5]), 2)
                payload["pagos"] = [{"metodo": "efectivo", "monto": parcial, "monto_recibido": parcial}]
            else:
                payload["pagos"] = []
        else:
            m = random.choice(metodos)
            pago = {"metodo": m, "monto": total}
            if m == "efectivo":
                pago["monto_recibido"] = float(int(total) + random.choice([1, 5, 10, 20]))
            payload["pagos"] = [pago]

        st, r = call("POST", "/pos/ventas", payload)
        if st == 201:
            if a_credito:
                n_credito += 1
                if payload.get("cliente_id"):
                    cuentas_credito.append((payload["cliente_id"], r["id"]))
            else:
                n_contado += 1
        else:
            print(f"  ✖ venta {v}: {st} {r}")
    print(f"  ✔ {n_contado} contado + {n_credito} fiado = {n_contado+n_credito} ventas")

    # ── Abonos a cuentas por cobrar ──
    print("\n▶ Abonos a cobranza")
    st, cuentas = call("GET", "/cobranza/cuentas")
    n_abonos = 0
    if st == 200 and isinstance(cuentas, list):
        abiertas = [c for c in cuentas if c.get("saldo_pendiente", 0) > 1]
        for c in random.sample(abiertas, k=min(len(abiertas), int(len(abiertas) * 0.45))):
            monto = round(c["saldo_pendiente"] * random.choice([0.25, 0.5, 0.7]), 2)
            if monto < 1:
                continue
            stx, _ = call("POST", f"/cobranza/cuentas/{c['id']}/abonos", {
                "monto": monto, "metodo": random.choice(["efectivo", "transferencia"]),
                "notas": "Abono parcial",
            })
            if stx == 201:
                n_abonos += 1
    print(f"  ✔ {n_abonos} abonos aplicados")

    # ── Órdenes de compra pendientes ──
    print("\n▶ Órdenes de compra")
    st, provs = call("GET", "/compras/proveedores")
    n_oc = 0
    if st == 200 and provs:
        for _ in range(6):
            prov = random.choice(provs)
            elegidos = random.sample(skus, random.randint(2, 5))
            items = [{"sku_id": sid, "cantidad_solicitada": random.randint(20, 100),
                      "costo_unitario": round(precio * 0.7, 2)} for sid, precio in elegidos]
            stx, _ = call("POST", "/compras/ordenes", {
                "proveedor_id": prov["id"], "items": items,
                "nota": "Reabastecimiento mensual",
            })
            if stx == 201:
                n_oc += 1
    print(f"  ✔ {n_oc} órdenes de compra (pendientes)")

    # ── Resumen ──
    print("\n════════ RESUMEN FINAL ════════")
    st, dash = call("GET", "/dashboard")
    if st == 200:
        print(f"  SKUs:          {dash['sku_count']}")
        print(f"  Valor stock:   Q{dash['valor_stock']:,.2f}")
        print(f"  Alertas stock: {dash['alertas_count']}")
        print(f"  OC pendientes: {dash['oc_pendientes_count']}")
        print(f"  Movs hoy:      {dash['movs_hoy_count']}")
    st, res = call("GET", "/pos/resumen/hoy")
    if st == 200:
        print(f"  Ventas hoy:    {res['num_ventas']}  →  Q{res['total']:,.2f}")
        print(f"  Por método:    {res['por_metodo']}")
    st, cob = call("GET", "/cobranza/resumen")
    if st == 200:
        print(f"  Cuentas x cobrar abiertas: {cob['cuentas_abiertas']}")
        print(f"  Por cobrar (fiado):        Q{cob['por_cobrar']:,.2f}")
    print("\n✅ Seed completado.")


if __name__ == "__main__":
    t0 = time.time()
    main()
    print(f"⏱  {time.time()-t0:.1f}s")
