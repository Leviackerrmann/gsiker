"""Autorización de tenant en dos capas (entitlements de empresa + permisos de
operador). Ver app.services.permisos y app.dependencies.requiere_permiso."""
import pytest
from sqlalchemy import select

from app.models.empresa import Empresa
from app.services import permisos as P


async def _operador(client, admin_headers, username, permisos):
    """Crea un operador (con permisos) vía el panel del admin y devuelve sus headers."""
    r = await client.post("/api/usuarios", json={
        "username": username, "password": "secret123", "nombre_completo": "Operador",
        "rol": "operador", "permisos": permisos,
    }, headers=admin_headers)
    assert r.status_code == 201, r.text
    r2 = await client.post("/api/auth/login", json={"username": username, "password": "secret123"})
    assert r2.status_code == 200, r2.text
    return {"Authorization": f"Bearer {r2.json()['access_token']}"}, r.json()


@pytest.mark.asyncio
async def test_operador_solo_ve_sus_modulos(client, empresa_factory):
    admin = await empresa_factory("Tienda Perm 1", "adm_perm1")
    op, _ = await _operador(client, admin, "op_ventas", ["ventas"])

    # Tiene "ventas": pasa. No tiene "inventario"/"compras": 403.
    assert (await client.get("/api/ventas/clientes", headers=op)).status_code == 200
    assert (await client.get("/api/inventario/bodegas", headers=op)).status_code == 403
    assert (await client.get("/api/compras/proveedores", headers=op)).status_code == 403


@pytest.mark.asyncio
async def test_admin_ve_todos_los_modulos(client, empresa_factory):
    admin = await empresa_factory("Tienda Perm 2", "adm_perm2")
    for path in ("/api/ventas/clientes", "/api/inventario/bodegas", "/api/compras/proveedores"):
        assert (await client.get(path, headers=admin)).status_code == 200, path


@pytest.mark.asyncio
async def test_permiso_no_alcanza_si_empresa_no_tiene_el_modulo(client, empresa_factory, db_sessionmaker):
    """Capa 2 ⊆ capa 1: aunque el operador tenga el permiso, si la empresa perdió
    el módulo (override), se bloquea. Y también se bloquea al admin."""
    admin = await empresa_factory("Tienda Perm 3", "adm_perm3")
    op, _ = await _operador(client, admin, "op_v3", ["ventas"])

    # El superadmin le quita "ventas" a la empresa (override).
    async with db_sessionmaker() as s:
        emp = (await s.execute(select(Empresa).where(Empresa.nombre == "Tienda Perm 3"))).scalar_one()
        emp.modulos_override = {"add": [], "remove": ["ventas"]}
        await s.commit()

    assert (await client.get("/api/ventas/clientes", headers=op)).status_code == 403
    assert (await client.get("/api/ventas/clientes", headers=admin)).status_code == 403
    # Otros módulos siguen: el admin puede inventario.
    assert (await client.get("/api/inventario/bodegas", headers=admin)).status_code == 200


@pytest.mark.asyncio
async def test_acciones_sensibles_solo_admin(client, empresa_factory):
    """Operador con el módulo puede operar, pero no cerrar caja (acción sensible)."""
    admin = await empresa_factory("Tienda Perm 4", "adm_perm4")
    op, _ = await _operador(client, admin, "op_pos4", ["pos"])

    abrir = await client.post("/api/pos/caja/abrir", json={"monto_inicial": 100}, headers=op)
    assert abrir.status_code == 201, abrir.text
    sesion_id = abrir.json()["id"]

    cerrar = await client.post(f"/api/pos/caja/{sesion_id}/cerrar", json={"monto_final_declarado": 100}, headers=op)
    assert cerrar.status_code == 403, cerrar.text
    # El admin sí puede cerrarla.
    cerrar_admin = await client.post(f"/api/pos/caja/{sesion_id}/cerrar", json={"monto_final_declarado": 100}, headers=admin)
    assert cerrar_admin.status_code == 200, cerrar_admin.text


@pytest.mark.asyncio
async def test_operador_no_ve_costo_en_sku(client, empresa_factory):
    admin = await empresa_factory("Tienda Perm 5", "adm_perm5")
    op, _ = await _operador(client, admin, "op_inv5", ["inventario"])

    crear = await client.post("/api/skus", json={
        "codigo_sku": "SKU-COSTO", "descripcion": "Producto", "costo_unitario": 42.5,
        "precio_referencia": 99.0,
    }, headers=admin)
    assert crear.status_code == 201, crear.text

    # Admin ve el costo; operador lo recibe en null.
    lista_admin = (await client.get("/api/skus", headers=admin)).json()
    assert lista_admin[0]["costo_unitario"] == 42.5
    lista_op = (await client.get("/api/skus", headers=op)).json()
    assert lista_op[0]["costo_unitario"] is None


@pytest.mark.asyncio
async def test_me_expone_modulos_visibles(client, empresa_factory):
    admin = await empresa_factory("Tienda Perm 6", "adm_perm6")
    op, _ = await _operador(client, admin, "op_v6", ["ventas", "pos"])

    me_op = (await client.get("/api/auth/me", headers=op)).json()
    assert me_op["modulos_visibles"] == ["pos", "ventas"]
    # La empresa tiene todos; el operador solo ve los suyos.
    assert set(me_op["modulos_empresa"]) == {"pos", "inventario", "compras", "ventas", "cobranza", "ia"}

    me_admin = (await client.get("/api/auth/me", headers=admin)).json()
    assert set(me_admin["modulos_visibles"]) == set(me_admin["modulos_empresa"])


@pytest.mark.asyncio
async def test_permisos_se_sanean_a_los_de_la_empresa(client, empresa_factory):
    """Pedir un permiso inexistente o fuera del plan no lo concede (permisos ⊆
    entitlements). 'inexistente' se descarta; los válidos quedan."""
    admin = await empresa_factory("Tienda Perm 7", "adm_perm7")
    _, creado = await _operador(client, admin, "op_v7", ["ventas", "inexistente"])
    assert creado["permisos"] == ["ventas"]


def test_override_composicion_unitaria():
    """La capa 1 compone snapshot del plan ± override, acotado a módulos válidos."""
    class _Sus:
        limites_snapshot = {"modulos": ["pos", "ventas", "compras"]}

    class _Emp:
        modulos_override = {"add": ["ia"], "remove": ["compras"]}

    efectivos = P.modulos_efectivos_empresa(_Sus(), _Emp())
    assert efectivos == {"pos", "ventas", "ia"}
