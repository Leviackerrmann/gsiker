"""Script de siembra de datos para pruebas del ERP minisap."""
import asyncio
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, text

from app.config import settings
from app.database import async_session, engine
from app.models.base import Base
from app.models.compras import (
    EstadoOrden,
    ItemCotizacion,
    ItemOrdenCompra,
    ItemSolicitudCompra,
    OrdenCompra,
    PrecioProveedor,
    PropuestaCotizacion,
    ItemPropuesta,
    Proveedor,
    SolicitudCompra,
    CotizacionCompra,
)
from app.models.inventario import (
    Bodega,
    ItemInventarioFisico,
    InventarioFisico,
    Lote,
    MotivoMovimiento,
    MovimientoInventario,
    Stock,
    TipoMovimiento,
    Ubicacion,
)
from app.models.sku import SKU
from app.models.usuario import RolUsuario, Usuario
from app.services.inventario import actualizar_stock
from app.services.valorizacion import calcular_pmp_entrada


def ahora():
    return datetime.now(timezone.utc)


async def seed():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as db:
        # ═══════════════════════════════════════════════════════════
        # USUARIOS
        # ═══════════════════════════════════════════════════════════
        admin = Usuario(username="admin", email="admin@minisap.local", password_hash="$2b$12$LJ3m4ys3GZeqDmUe0UyfUuUj5Lx0H5vO5Uq5Pq5Oq5Oq5Oq5Oq5Oq", nombre_completo="Administrador", rol=RolUsuario.SUPERADMIN)
        from app.utils.security import hash_password
        admin.password_hash = hash_password("admin2026")
        op1 = Usuario(username="operador1", password_hash=hash_password("operador123"), nombre_completo="Juan Pérez", rol=RolUsuario.OPERADOR)
        op2 = Usuario(username="operador2", password_hash=hash_password("operador123"), nombre_completo="María López", rol=RolUsuario.OPERADOR)
        admin2 = Usuario(username="admin2", password_hash=hash_password("admin123"), nombre_completo="Carlos Admin", rol=RolUsuario.ADMIN)
        db.add_all([admin, op1, op2, admin2])
        await db.flush()
        print(f"✅ {4} usuarios creados")

        # ═══════════════════════════════════════════════════════════
        # BODEGAS + UBICACIONES
        # ═══════════════════════════════════════════════════════════
        b1 = Bodega(nombre="Bodega Central", ubicacion="Av. Principal #100", capacidad=25000, encargado="Carlos Muñoz")
        b2 = Bodega(nombre="Bodega Materia Prima", ubicacion="Zona Industrial", capacidad=20000, encargado="María López")
        b3 = Bodega(nombre="Bodega Producto Terminado", ubicacion="Centro de Distribución", capacidad=15000, encargado="Pedro Soto")
        db.add_all([b1, b2, b3])
        await db.flush()

        ubicaciones = []
        for b, codigos in [(b1, ["A-01", "A-02", "B-01", "B-02"]), (b2, ["MP-01", "MP-02"]), (b3, ["PT-01", "PT-02", "PT-03"])]:
            for cod in codigos:
                ubicaciones.append(Ubicacion(bodega_id=b.id, codigo=cod, descripcion=f"Estante {cod}"))
        db.add_all(ubicaciones)
        await db.flush()
        print(f"✅ {3} bodegas, {len(ubicaciones)} ubicaciones creadas")

        # ═══════════════════════════════════════════════════════════
        # SKUs
        # ═══════════════════════════════════════════════════════════
        skus_data = [
            ("MP-00001", "Acero laminado en frío", "KG", 5.50, "MP", "Metales", True),
            ("MP-00002", "Resina poliéster", "KG", 12.00, "MP", "Químicos", True),
            ("MP-00003", "Pigmento blanco", "KG", 8.75, "MP", "Químicos", False),
            ("MP-00004", "Tornillos M8x30", "UNIDAD", 0.15, "MP", "Fijaciones", False),
            ("MP-00005", "Empaque de caucho", "UNIDAD", 0.45, "MP", "Sellos", False),
            ("PT-00001", "Panel metálico 2x1m", "UNIDAD", 85.00, "PT", "Paneles", False),
            ("PT-00002", "Estructura tubular 3m", "UNIDAD", 120.00, "PT", "Estructuras", False),
            ("PT-00003", "Cubierta plástica reforzada", "UNIDAD", 45.00, "PT", "Cubiertas", False),
            ("PT-00004", "Kit de ensamblaje básico", "UNIDAD", 25.00, "PT", "Kits", False),
            ("INS-00001", "Guantes industriales", "PAR", 3.50, "INS", "EPP", False),
            ("INS-00002", "Lubricante multiuso 5L", "UNIDAD", 18.00, "INS", "Mantenimiento", False),
            ("INS-00003", "Cinta adhesiva industrial", "ROLLO", 6.00, "INS", "Suministros", False),
            ("SER-00001", "Servicio de calibración", "SERVICIO", 200.00, "SER", "Técnico", False),
            ("SER-00002", "Mantenimiento preventivo mensual", "SERVICIO", 350.00, "SER", "Técnico", False),
            ("ACC-00001", "Filtro de aire industrial", "UNIDAD", 22.00, "ACC", "Repuestos", False),
        ]
        skus_created = []
        for cod, desc, um, costo, cat, sub, lotes in skus_data:
            s = SKU(codigo_sku=cod, descripcion=desc, unidad_medida=um, costo_unitario=costo, precio_referencia=costo * 1.3, categoria=cat, subcategoria=sub, maneja_lotes=lotes)
            db.add(s)
            skus_created.append(s)
        await db.flush()
        print(f"✅ {len(skus_created)} SKUs creados")

        # ═══════════════════════════════════════════════════════════
        # LOTES
        # ═══════════════════════════════════════════════════════════
        l1 = Lote(sku_id=skus_created[0].id, numero_lote="LOT-2026-001", fecha_fabricacion=ahora() - timedelta(days=60), fecha_vencimiento=ahora() + timedelta(days=15))
        l2 = Lote(sku_id=skus_created[0].id, numero_lote="LOT-2026-002", fecha_fabricacion=ahora() - timedelta(days=10), fecha_vencimiento=ahora() + timedelta(days=120))
        l3 = Lote(sku_id=skus_created[1].id, numero_lote="LOT-2026-R1", fecha_fabricacion=ahora() - timedelta(days=30), fecha_vencimiento=ahora() + timedelta(days=90))
        db.add_all([l1, l2, l3])
        await db.flush()
        print(f"✅ {3} lotes creados (1 próximo a vencer)")

        # ═══════════════════════════════════════════════════════════
        # PROVEEDORES + PRECIOS
        # ═══════════════════════════════════════════════════════════
        p1 = Proveedor(codigo="PROV-01", nombre="Aceros del Norte S.A.", documento="123456789", telefono="555-0100", email="ventas@acerosnorte.com")
        p2 = Proveedor(codigo="PROV-02", nombre="Distribuidora Química Global", documento="987654321", telefono="555-0200", email="info@quimicaglobal.com")
        p3 = Proveedor(codigo="PROV-03", nombre="Suministros Industriales Ltda.", documento="456789123", telefono="555-0300")
        db.add_all([p1, p2, p3])
        await db.flush()

        precios = [
            PrecioProveedor(proveedor_id=p1.id, sku_id=skus_created[0].id, costo_unitario=5.20),
            PrecioProveedor(proveedor_id=p2.id, sku_id=skus_created[0].id, costo_unitario=5.50),
            PrecioProveedor(proveedor_id=p1.id, sku_id=skus_created[1].id, costo_unitario=11.50),
            PrecioProveedor(proveedor_id=p2.id, sku_id=skus_created[1].id, costo_unitario=12.00),
            PrecioProveedor(proveedor_id=p3.id, sku_id=skus_created[3].id, costo_unitario=0.14),
            PrecioProveedor(proveedor_id=p3.id, sku_id=skus_created[4].id, costo_unitario=0.42),
        ]
        db.add_all(precios)
        await db.flush()
        print(f"✅ {3} proveedores, {len(precios)} precios registrados")

        # ═══════════════════════════════════════════════════════════
        # MOVIMIENTOS INICIALES (STOCK)
        # ═══════════════════════════════════════════════════════════
        stock_entries = [
            (0, b1.id, 500.0, 5.50, l1.id),   # Acero lote1 en Central
            (0, b2.id, 300.0, 5.50, l2.id),   # Acero lote2 en MP
            (0, b2.id, 200.0, 5.50, l1.id),   # Acero lote1 en MP
            (1, b2.id, 150.0, 12.00, l3.id),  # Resina en MP
            (2, b2.id, 80.0, 8.75, None),      # Pigmento
            (3, b1.id, 10000.0, 0.15, None),   # Tornillos
            (4, b1.id, 500.0, 0.45, None),     # Empaques
            (5, b3.id, 25.0, 85.00, None),     # Panel
            (6, b3.id, 15.0, 120.00, None),    # Estructura
            (7, b3.id, 40.0, 45.00, None),     # Cubierta
            (8, b3.id, 30.0, 25.00, None),     # Kit
            (9, b1.id, 200.0, 3.50, None),     # Guantes
            (10, b1.id, 50.0, 18.00, None),    # Lubricante
            (11, b1.id, 30.0, 6.00, None),     # Cinta
            (14, b1.id, 25.0, 22.00, None),    # Filtro
        ]

        for idx, bodega_id, cant, costo, lote_id in stock_entries:
            sku = skus_created[idx]
            costo_total = round(cant * costo, 2)

            mov = MovimientoInventario(
                tipo=TipoMovimiento.ENTRADA,
                motivo=MotivoMovimiento.STOCK_INICIAL,
                sku_id=sku.id,
                bodega_id=bodega_id,
                lote_id=lote_id,
                cantidad=cant,
                costo_unitario=costo,
                costo_total=costo_total,
                referencia="Stock inicial seed",
                usuario_id=admin.id,
            )
            db.add(mov)

            sku.costo_unitario = await calcular_pmp_entrada(db, sku, cant, costo)
            await actualizar_stock(db, sku.id, bodega_id, cant, TipoMovimiento.ENTRADA, lote_id=lote_id)

        await db.flush()
        print(f"✅ {len(stock_entries)} movimientos iniciales (stock poblado)")

        # Configurar min/max para algunos stocks
        stock_rows = (await db.execute(select(Stock))).scalars().all()
        for s in stock_rows[:5]:
            s.cantidad_minima = 50.0
            s.cantidad_maxima = 1000.0
        await db.flush()
        print("✅ Límites min/max configurados en 5 stocks")

        # ═══════════════════════════════════════════════════════════
        # SOLICITUD DE COMPRA
        # ═══════════════════════════════════════════════════════════
        sol = SolicitudCompra(numero="SC-000001", usuario_id=op1.id, estado="aprobada", notas="Reposición de insumos críticos")
        db.add(sol)
        await db.flush()

        sol_items_data = [(2, 40, "Stock bajo de pigmento"), (11, 15, "Consumo mensual estimado")]
        for sku_idx, cant, just in sol_items_data:
            it = ItemSolicitudCompra(solicitud_id=sol.id, sku_id=skus_created[sku_idx].id, cantidad=cant, justificacion=just)
            db.add(it)

        sol2 = SolicitudCompra(numero="SC-000002", usuario_id=op2.id, estado="pendiente", notas="Necesidad urgente de empaques")
        db.add(sol2)
        await db.flush()
        db.add(ItemSolicitudCompra(solicitud_id=sol2.id, sku_id=skus_created[4].id, cantidad=500, justificacion="Línea de producción parada"))
        await db.flush()
        print("✅ 2 solicitudes de compra (1 aprobada, 1 pendiente)")

        # ═══════════════════════════════════════════════════════════
        # COTIZACIÓN + ADJUDICACIÓN
        # ═══════════════════════════════════════════════════════════
        cot = CotizacionCompra(numero="COT-000001", usuario_id=admin.id, estado="en_proceso", notas="Cotización para reposición trimestral")
        db.add(cot)
        await db.flush()

        cot_items = [(0, 200), (3, 5000), (9, 100)]
        cot_items_created = []
        for sku_idx, cant in cot_items:
            ci = ItemCotizacion(cotizacion_id=cot.id, sku_id=skus_created[sku_idx].id, cantidad=cant)
            db.add(ci)
            cot_items_created.append(ci)
        await db.flush()

        # Propuesta de PROV-01
        prop1 = PropuestaCotizacion(cotizacion_id=cot.id, proveedor_id=p1.id, notas="Entrega en 5 días hábiles")
        db.add(prop1)
        await db.flush()
        for ci, costo in zip(cot_items_created, [5.20, 0.14, 3.30]):
            db.add(ItemPropuesta(propuesta_id=prop1.id, item_cotizacion_id=ci.id, costo_unitario=costo))

        # Propuesta de PROV-03 (más barata en tornillos)
        prop2 = PropuestaCotizacion(cotizacion_id=cot.id, proveedor_id=p3.id, notas="Entrega en 3 días, descuento por volumen")
        db.add(prop2)
        await db.flush()
        for ci, costo in zip(cot_items_created, [5.35, 0.12, 3.45]):
            db.add(ItemPropuesta(propuesta_id=prop2.id, item_cotizacion_id=ci.id, costo_unitario=costo))
        await db.flush()
        print("✅ 1 cotización con 2 propuestas")

        # ═══════════════════════════════════════════════════════════
        # ÓRDENES DE COMPRA + RECEPCIONES
        # ═══════════════════════════════════════════════════════════
        # OC 1: Acero y resina (recibida completa)
        oc1 = OrdenCompra(numero_oc="OC-000001", proveedor_id=p1.id, estado=EstadoOrden.COMPLETA, usuario_id=admin.id)
        db.add(oc1)
        await db.flush()
        ioc1 = ItemOrdenCompra(orden_id=oc1.id, sku_id=skus_created[0].id, cantidad_solicitada=200, cantidad_recibida=200, costo_unitario=5.20, costo_total=1040.0)
        ioc2 = ItemOrdenCompra(orden_id=oc1.id, sku_id=skus_created[1].id, cantidad_solicitada=100, cantidad_recibida=100, costo_unitario=11.50, costo_total=1150.0)
        db.add_all([ioc1, ioc2])

        # Recepción OC1
        mov_rec1 = MovimientoInventario(tipo=TipoMovimiento.ENTRADA, motivo=MotivoMovimiento.COMPRA, sku_id=skus_created[0].id, bodega_id=b1.id, cantidad=200, costo_unitario=5.20, costo_total=1040.0, referencia="Recepción OC-000001", usuario_id=admin.id)
        mov_rec2 = MovimientoInventario(tipo=TipoMovimiento.ENTRADA, motivo=MotivoMovimiento.COMPRA, sku_id=skus_created[1].id, bodega_id=b2.id, cantidad=100, costo_unitario=11.50, costo_total=1150.0, referencia="Recepción OC-000001", usuario_id=admin.id)
        db.add_all([mov_rec1, mov_rec2])
        skus_created[0].costo_unitario = await calcular_pmp_entrada(db, skus_created[0], 200, 5.20)
        skus_created[1].costo_unitario = await calcular_pmp_entrada(db, skus_created[1], 100, 11.50)
        await actualizar_stock(db, skus_created[0].id, b1.id, 200, TipoMovimiento.ENTRADA)
        await actualizar_stock(db, skus_created[1].id, b2.id, 100, TipoMovimiento.ENTRADA)

        # OC 2: Tornillos (parcial)
        oc2 = OrdenCompra(numero_oc="OC-000002", proveedor_id=p3.id, estado=EstadoOrden.PARCIAL, usuario_id=admin.id)
        db.add(oc2)
        await db.flush()
        ioc3 = ItemOrdenCompra(orden_id=oc2.id, sku_id=skus_created[3].id, cantidad_solicitada=8000, cantidad_recibida=5000, costo_unitario=0.14, costo_total=700.0)
        ioc4 = ItemOrdenCompra(orden_id=oc2.id, sku_id=skus_created[4].id, cantidad_solicitada=1000, cantidad_recibida=1000, costo_unitario=0.42, costo_total=420.0)
        db.add_all([ioc3, ioc4])

        mov_rec3 = MovimientoInventario(tipo=TipoMovimiento.ENTRADA, motivo=MotivoMovimiento.COMPRA, sku_id=skus_created[3].id, bodega_id=b1.id, cantidad=5000, costo_unitario=0.14, costo_total=700.0, referencia="Recepción OC-000002 (parcial)", usuario_id=admin.id)
        mov_rec4 = MovimientoInventario(tipo=TipoMovimiento.ENTRADA, motivo=MotivoMovimiento.COMPRA, sku_id=skus_created[4].id, bodega_id=b1.id, cantidad=1000, costo_unitario=0.42, costo_total=420.0, referencia="Recepción OC-000002", usuario_id=admin.id)
        db.add_all([mov_rec3, mov_rec4])
        await actualizar_stock(db, skus_created[3].id, b1.id, 5000, TipoMovimiento.ENTRADA)
        await actualizar_stock(db, skus_created[4].id, b1.id, 1000, TipoMovimiento.ENTRADA)

        # OC 3: Pendiente sin recibir
        oc3 = OrdenCompra(numero_oc="OC-000003", proveedor_id=p2.id, estado=EstadoOrden.PENDIENTE, usuario_id=admin.id)
        db.add(oc3)
        await db.flush()
        db.add(ItemOrdenCompra(orden_id=oc3.id, sku_id=skus_created[2].id, cantidad_solicitada=150, cantidad_recibida=0, costo_unitario=8.50))
        await db.flush()
        print("✅ 3 OCs (1 completa, 1 parcial, 1 pendiente)")

        # ═══════════════════════════════════════════════════════════
        # ALGUNOS MOVIMIENTOS ADICIONALES DE EJEMPLO
        # ═══════════════════════════════════════════════════════════
        mov_cons = MovimientoInventario(tipo=TipoMovimiento.SALIDA, motivo=MotivoMovimiento.CONSUMO_INTERNO, sku_id=skus_created[3].id, bodega_id=b1.id, cantidad=500, costo_unitario=0.15, costo_total=75.0, referencia="Mantenimiento mensual", usuario_id=op1.id)
        mov_merma = MovimientoInventario(tipo=TipoMovimiento.SALIDA, motivo=MotivoMovimiento.MERMA, sku_id=skus_created[1].id, bodega_id=b2.id, cantidad=5, costo_unitario=12.00, costo_total=60.0, referencia="Derrame accidental", usuario_id=op2.id)
        mov_transf = MovimientoInventario(tipo=TipoMovimiento.SALIDA, motivo=MotivoMovimiento.TRANSFERENCIA_SALIDA, sku_id=skus_created[0].id, bodega_id=b1.id, lote_id=l1.id, cantidad=100, costo_unitario=5.50, costo_total=550.0, referencia="Transferencia a MP", usuario_id=admin.id)
        mov_transf_in = MovimientoInventario(tipo=TipoMovimiento.ENTRADA, motivo=MotivoMovimiento.TRANSFERENCIA_ENTRADA, sku_id=skus_created[0].id, bodega_id=b2.id, lote_id=l1.id, cantidad=100, costo_unitario=5.50, costo_total=550.0, referencia="Transferencia desde Central", usuario_id=admin.id)
        db.add_all([mov_cons, mov_merma, mov_transf, mov_transf_in])
        await actualizar_stock(db, skus_created[3].id, b1.id, 500, TipoMovimiento.SALIDA)
        await actualizar_stock(db, skus_created[1].id, b2.id, 5, TipoMovimiento.SALIDA)
        await actualizar_stock(db, skus_created[0].id, b1.id, 100, TipoMovimiento.SALIDA, lote_id=l1.id)
        await actualizar_stock(db, skus_created[0].id, b2.id, 100, TipoMovimiento.ENTRADA, lote_id=l1.id)
        await db.flush()
        print("✅ +4 movimientos extra (consumo, merma, transferencia)")

        # ═══════════════════════════════════════════════════════════
        # CONTEO FÍSICO (ABIERTO)
        # ═══════════════════════════════════════════════════════════
        conteo = InventarioFisico(bodega_id=b2.id, usuario_id=op2.id)
        db.add(conteo)
        await db.flush()
        stocks_b2 = (await db.execute(select(Stock).where(Stock.bodega_id == b2.id))).scalars().all()
        for s in stocks_b2:
            db.add(ItemInventarioFisico(inventario_id=conteo.id, sku_id=s.sku_id, lote_id=s.lote_id, cantidad_esperada=s.cantidad))
        await db.flush()
        print(f"✅ 1 conteo físico abierto en Bodega MP (con {len(stocks_b2)} items)")

        await db.commit()

    print("\n" + "=" * 55)
    print("🌱 SEED COMPLETADO - Base de datos poblada")
    print("=" * 55)
    print("Credenciales:")
    print("  admin / admin2026     (superadmin)")
    print("  operador1 / operador123 (operador)")
    print("  operador2 / operador123 (operador)")
    print("  admin2 / admin123      (admin)")
    print()
    print("Datos creados:")
    print(f"  {4} usuarios, {3} bodegas, {len(ubicaciones)} ubicaciones")
    print(f"  {len(skus_created)} SKUs, {3} lotes, {3} proveedores")
    print(f"  {len(stock_entries)+6} movimientos, 2 solicitudes")
    print(f"  3 OCs, 1 cotización, 1 conteo abierto")
    print("=" * 55)


if __name__ == "__main__":
    asyncio.run(seed())
