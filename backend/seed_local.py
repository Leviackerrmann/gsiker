"""Sembrado ADITIVO de datos de prueba para el entorno local.

A diferencia de `seed.py` (que hace drop_all y precede a la capa multi-tenant),
este script NO borra nada: se apoya en la empresa ya existente y agrega datos
realistas (clientes, catálogo de SKU, bodegas, stock y cuentas por cobrar con
estados variados) para poder probar los paneles rediseñados.

Es idempotente: se detecta por un cliente centinela (CLI-1001). Si ya existe,
no vuelve a insertar. Correr:

    docker compose exec backend python seed_local.py
"""
import asyncio
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, text

from app.database import async_session
from app.models.cobranza import MetodoAbono, OrigenCxC
from app.models.empresa import Empresa
from app.models.inventario import (
    Bodega,
    MotivoMovimiento,
    MovimientoInventario,
    TipoMovimiento,
)
from app.models.sku import SKU
from app.models.usuario import Usuario
from app.models.ventas import Cliente
from app.services.cobranza import crear_cuenta, registrar_abono
from app.services.inventario import actualizar_stock


def ahora():
    return datetime.now(timezone.utc)


# ── Datos ──────────────────────────────────────────────────────────────
CLIENTES = [
    ("CLI-1001", "Abarrotería La Esquina", "Comercio", "2233-4455", "abarroteria@correo.gt"),
    ("CLI-1002", "Comedor Doña Rosa", "Comercio", "5566-7788", "comedor.rosa@correo.gt"),
    ("CLI-1003", "Ferretería El Tornillo", "Comercio", "3344-5566", "ferreteria@correo.gt"),
    ("CLI-1004", "Panadería San José", "Comercio", "4455-6677", None),
    ("CLI-1005", "Carlos Estrada", "Consumidor", "5555-1212", "carlos.estrada@correo.gt"),
    ("CLI-1006", "Distribuidora El Progreso", "Mayorista", "2211-9988", "ventas@progreso.gt"),
    ("CLI-1007", "María Fernanda Gómez", "Consumidor", "4141-2323", None),
]

# codigo, descripcion, unidad, costo, categoria, subcategoria, precio_venta
SKUS = [
    ("SKU-B001", "Coca-Cola 600ml", "unidad", 4.50, "Bebidas", "Gaseosas", 7.00),
    ("SKU-B002", "Agua pura Salvavidas 1L", "unidad", 2.80, "Bebidas", "Agua", 5.00),
    ("SKU-B003", "Jugo del Valle 500ml", "unidad", 3.90, "Bebidas", "Jugos", 6.50),
    ("SKU-A001", "Arroz Blanco 1lb", "libra", 3.20, "Abarrotes", "Granos", 5.50),
    ("SKU-A002", "Frijol Negro 1lb", "libra", 4.10, "Abarrotes", "Granos", 6.50),
    ("SKU-A003", "Aceite Ideal 750ml", "unidad", 12.50, "Abarrotes", "Aceites", 18.00),
    ("SKU-A004", "Azúcar blanca 2lb", "unidad", 6.00, "Abarrotes", "Endulzantes", 9.50),
    ("SKU-L001", "Leche Dos Pinos 1L", "unidad", 9.20, "Lácteos", "Leche", 13.50),
    ("SKU-L002", "Queso fresco 1lb", "libra", 18.00, "Lácteos", "Quesos", 27.00),
    ("SKU-S001", "Jabón de baño Protex", "unidad", 5.30, "Cuidado personal", "Higiene", 8.50),
    ("SKU-S002", "Papel higiénico 4 rollos", "paquete", 11.00, "Cuidado personal", "Papelería", 16.00),
    ("SKU-P001", "Detergente Ariel 1kg", "unidad", 22.00, "Limpieza", "Detergentes", 32.00),
]

BODEGAS = [
    ("Bodega Central", "Zona 1, Ciudad", 15000, "Luis Donis"),
    ("Sucursal Zona 10", "Zona 10, Ciudad", 6000, "Ana García"),
]


async def seed_local():
    async with async_session() as db:
        # Empresa objetivo: la primera existente (multi-tenant ya inicializado).
        empresa = (await db.execute(select(Empresa).order_by(Empresa.id))).scalars().first()
        if empresa is None:
            print("❌ No hay ninguna empresa. Registrá una desde la app primero.")
            return
        eid = empresa.id
        moneda = empresa.moneda or "GTQ"
        print(f"🏢 Empresa objetivo: #{eid} {empresa.nombre} ({moneda})")

        # Fija el contexto de tenant para pasar las políticas RLS de PostgreSQL
        # (a nivel de sesión, para que persista durante todos los inserts).
        await db.execute(
            text("SELECT set_config('app.current_empresa_id', :e, false)"), {"e": str(eid)}
        )

        # Usuario admin de la empresa (para atribuir movimientos/abonos).
        admin = (
            await db.execute(
                select(Usuario).where(Usuario.empresa_id == eid).order_by(Usuario.id)
            )
        ).scalars().first()
        uid = admin.id if admin else None

        # Centinela de idempotencia.
        existe = (
            await db.execute(
                select(Cliente).where(Cliente.empresa_id == eid, Cliente.codigo == "CLI-1001")
            )
        ).scalar_one_or_none()
        if existe:
            print("ℹ️  Ya sembrado (existe CLI-1001). No se hace nada.")
            return

        # ── Clientes ──────────────────────────────────────────────────
        clientes: dict[str, Cliente] = {}
        for cod, nombre, doc, tel, email in CLIENTES:
            c = Cliente(empresa_id=eid, codigo=cod, nombre=nombre, documento=doc,
                        telefono=tel, email=email, moneda=moneda, activo=True)
            db.add(c)
            clientes[cod] = c
        await db.flush()
        print(f"✅ {len(clientes)} clientes")

        # ── Bodegas (evita duplicar por nombre) ──────────────────────
        bod_existentes = {
            b.nombre: b
            for b in (await db.execute(select(Bodega).where(Bodega.empresa_id == eid))).scalars()
        }
        bodegas: list[Bodega] = []
        for nombre, ubic, cap, enc in BODEGAS:
            if nombre in bod_existentes:
                bodegas.append(bod_existentes[nombre])
                continue
            b = Bodega(empresa_id=eid, nombre=nombre, ubicacion=ubic, capacidad=cap, encargado=enc)
            db.add(b)
            bodegas.append(b)
        await db.flush()
        # Garantiza al menos una bodega
        if not bodegas:
            bodegas = list((await db.execute(select(Bodega).where(Bodega.empresa_id == eid))).scalars())
        print(f"✅ {len(bodegas)} bodegas disponibles")

        # ── SKUs + stock ─────────────────────────────────────────────
        skus: list[SKU] = []
        for cod, desc, um, costo, cat, sub, precio in SKUS:
            s = SKU(empresa_id=eid, codigo_sku=cod, descripcion=desc, unidad_medida=um,
                    costo_unitario=costo, precio_referencia=precio, categoria=cat,
                    subcategoria=sub, maneja_lotes=False)
            db.add(s)
            skus.append(s)
        await db.flush()

        # Cantidades variadas: normal, alto, bajo (1), sin stock (0).
        cantidades = [120, 300, 60, 250, 180, 40, 90, 1, 0, 210, 75, 15]
        movs = 0
        for i, s in enumerate(skus):
            bod = bodegas[0]
            cant = cantidades[i % len(cantidades)]
            if cant > 0:
                db.add(MovimientoInventario(
                    empresa_id=eid, tipo=TipoMovimiento.ENTRADA, motivo=MotivoMovimiento.COMPRA,
                    sku_id=s.id, bodega_id=bod.id, cantidad=cant,
                    costo_unitario=s.costo_unitario, costo_total=s.costo_unitario * cant,
                    referencia="Stock inicial (seed)", usuario_id=uid,
                ))
                await actualizar_stock(db, eid, s.id, bod.id, cant, TipoMovimiento.ENTRADA)
                movs += 1
            # Un poco de stock también en la 2da bodega para algunos SKUs.
            if len(bodegas) > 1 and i % 3 == 0 and cant > 0:
                extra = max(int(cant / 3), 5)
                db.add(MovimientoInventario(
                    empresa_id=eid, tipo=TipoMovimiento.ENTRADA, motivo=MotivoMovimiento.COMPRA,
                    sku_id=s.id, bodega_id=bodegas[1].id, cantidad=extra,
                    costo_unitario=s.costo_unitario, costo_total=s.costo_unitario * extra,
                    referencia="Stock inicial (seed)", usuario_id=uid,
                ))
                await actualizar_stock(db, eid, s.id, bodegas[1].id, extra, TipoMovimiento.ENTRADA)
                movs += 1
        await db.flush()
        print(f"✅ {len(skus)} SKUs, {movs} movimientos de stock inicial")

        # ── Cuentas por cobrar (fiado) con estados variados ──────────
        # (concepto, cliente, monto, dias_emision_atras, dias_venc_desde_emision, abonos[(monto,metodo)])
        plan = [
            ("Fiado de la semana", "CLI-1001", 340.00, 5, 15, []),                       # pendiente al día
            ("Compra de abarrotes", "CLI-1002", 520.50, 20, 15, [(200, "efectivo")]),   # parcial
            ("Pedido mensual", "CLI-1006", 1850.00, 40, 30, [(1000, "transferencia"), (450, "efectivo")]),  # parcial vencida
            ("Materiales ferretería", "CLI-1003", 780.00, 50, 20, [(780, "tarjeta")]),  # pagada
            ("Consumo mostrador", "CLI-1005", 95.00, 8, 30, []),                        # pendiente al día
            ("Insumos panadería", "CLI-1004", 430.00, 35, 20, [(150, "efectivo")]),     # parcial vencida
            ("Compra al crédito", "CLI-1007", 260.00, 12, 5, []),                       # pendiente vencida
            ("Reposición inventario", "CLI-1006", 640.00, 3, 30, []),                   # pendiente al día
        ]
        n_cuentas = 0
        n_abonos = 0
        for concepto, cli_cod, monto, dias_atras, dias_venc, abonos in plan:
            cli = clientes[cli_cod]
            emision = ahora() - timedelta(days=dias_atras)
            venc = emision + timedelta(days=dias_venc)
            cuenta = await crear_cuenta(
                db, eid, cliente_id=cli.id, monto_total=monto, concepto=concepto,
                moneda=moneda, origen=OrigenCxC.MANUAL, fecha_vencimiento=venc, usuario_id=uid,
            )
            # Backdatear la emisión para que "vencido" tenga sentido.
            cuenta.fecha = emision
            n_cuentas += 1
            for j, (m, met) in enumerate(abonos):
                abono = await registrar_abono(
                    db, eid, cuenta_id=cuenta.id, monto=m,
                    metodo=MetodoAbono(met), usuario_id=uid,
                )
                abono.fecha = emision + timedelta(days=2 + j * 3)
                n_abonos += 1
        await db.flush()
        await db.commit()
        print(f"✅ {n_cuentas} cuentas por cobrar, {n_abonos} abonos")

    print("\n" + "=" * 55)
    print("🌱 SEED LOCAL COMPLETADO (aditivo)")
    print("=" * 55)


if __name__ == "__main__":
    asyncio.run(seed_local())
