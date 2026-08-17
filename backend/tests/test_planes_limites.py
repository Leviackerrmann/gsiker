"""Tests del módulo de planes, suscripciones y límites de consumo.

Cubre §8 del plan: conteo atómico, idempotencia/409, límite 429, vencimiento sin
cron, solo-lectura 402, fail-closed, frontera de tokens platform/tenant,
auditoría, cambiar-plan mid-period, crédito sin uso previo.

La frontera BYPASSRLS a nivel Postgres (rol) se prueba aparte (requiere PG).
"""
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.models.audit import AuditLog
from app.models.consumo import IaUsoContador, IaUsoEvento
from app.models.empresa import Empresa, EstadoSuscripcion, IntervaloPlan, Plan
from app.models.platform_admin import PlatformAdmin
from app.services import limites as L
from app.utils.security import hash_password


# --------------------------------------------------------------------------- #
# Helpers / fixtures
# --------------------------------------------------------------------------- #
async def _empresa_id(maker, nombre) -> int:
    async with maker() as s:
        e = (await s.execute(select(Empresa).where(Empresa.nombre == nombre))).scalar_one()
        return e.id


async def _suscripcion(maker, empresa_id):
    async with maker() as s:
        return await L.obtener_suscripcion_vigente(s, empresa_id)


async def _set_snapshot(maker, empresa_id, limites):
    async with maker() as s:
        sus = await L.obtener_suscripcion_vigente(s, empresa_id)
        sus.limites_snapshot = limites
        await s.commit()


@pytest_asyncio.fixture
async def platform_headers(client, db_sessionmaker):
    async with db_sessionmaker() as s:
        s.add(PlatformAdmin(username="root", email="r@x.com",
                            password_hash=hash_password("clave123"), nombre_completo="Root"))
        await s.commit()
    r = await client.post("/api/platform/auth/login", json={"username": "root", "password": "clave123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def fake_ia(monkeypatch):
    async def _fake(db, empresa_id, nombre, mensaje, historial=None):
        return {"respuesta": "ok", "acciones": [],
                "uso": {"modelo": "test-model", "tokens_in": 10, "tokens_out": 5}}
    monkeypatch.setattr("app.routers.ia.ia_service.chat", _fake)


# --------------------------------------------------------------------------- #
# Conteo atómico + idempotencia (nivel servicio)
# --------------------------------------------------------------------------- #
async def test_conteo_atomico_e_idempotencia(db_sessionmaker, empresa_factory):
    await empresa_factory("Conteo SA", "u_conteo")
    eid = await _empresa_id(db_sessionmaker, "Conteo SA")
    sus = await _suscripcion(db_sessionmaker, eid)
    inicio, fin = L.periodo_vigente(sus)

    async with db_sessionmaker() as s:
        # Misma clave dos veces → 1 evento, contador=1.
        a = await L.registrar_uso_ia(s, eid, None, "test", "m", 10, 5, "k1", inicio, fin)
        b = await L.registrar_uso_ia(s, eid, None, "test", "m", 10, 5, "k1", inicio, fin)
        await s.commit()
    assert a is True and b is False

    async with db_sessionmaker() as s:
        # Clave nueva → contador=2.
        await L.registrar_uso_ia(s, eid, None, "test", "m", 3, 7, "k2", inicio, fin)
        await s.commit()

    async with db_sessionmaker() as s:
        eventos = (await s.execute(select(IaUsoEvento).where(IaUsoEvento.empresa_id == eid))).scalars().all()
        cont = (await s.execute(select(IaUsoContador).where(IaUsoContador.empresa_id == eid))).scalar_one()
    assert len(eventos) == 2
    assert cont.requests_usados == 2
    assert cont.tokens_usados == (10 + 5) + (3 + 7)


# --------------------------------------------------------------------------- #
# Vencimiento sin cron + estado efectivo
# --------------------------------------------------------------------------- #
async def test_vencimiento_sin_cron(db_sessionmaker, empresa_factory):
    await empresa_factory("Vence SA", "u_vence")
    eid = await _empresa_id(db_sessionmaker, "Vence SA")
    async with db_sessionmaker() as s:
        sus = await L.obtener_suscripcion_vigente(s, eid)
        assert L.estado_efectivo(sus) == L.EstadoEfectivo.TRIAL  # trial vigente
        sus.fin_trial = datetime.now(timezone.utc) - timedelta(days=1)
        await s.commit()
    sus = await _suscripcion(db_sessionmaker, eid)
    assert L.estado_efectivo(sus) == L.EstadoEfectivo.VENCIDA  # sin correr ningún job


# --------------------------------------------------------------------------- #
# Solo-lectura (402) cuando la suscripción está vencida
# --------------------------------------------------------------------------- #
async def test_solo_lectura_402(client, db_sessionmaker, empresa_factory):
    headers = await empresa_factory("RO SA", "u_ro")
    eid = await _empresa_id(db_sessionmaker, "RO SA")
    # Lectura permitida antes de vencer.
    assert (await client.get("/api/empresas/mi-empresa", headers=headers)).status_code == 200
    # Vencer la prueba.
    async with db_sessionmaker() as s:
        sus = await L.obtener_suscripcion_vigente(s, eid)
        sus.fin_trial = datetime.now(timezone.utc) - timedelta(days=1)
        await s.commit()
    # Escritura → 402; lectura sigue 200.
    w = await client.post("/api/ventas/clientes", json={"nombre": "X", "nit": "CF"}, headers=headers)
    assert w.status_code == 402, w.text
    assert (await client.get("/api/empresas/mi-empresa", headers=headers)).status_code == 200


# --------------------------------------------------------------------------- #
# IA: fail-closed (módulo), 429 (límite), 409 (idempotencia)
# --------------------------------------------------------------------------- #
async def test_ia_modulo_no_incluido_403(client, db_sessionmaker, empresa_factory, fake_ia):
    headers = await empresa_factory("SinIA SA", "u_sinia")
    eid = await _empresa_id(db_sessionmaker, "SinIA SA")
    # Plan sin IA (sin la llave ia y sin el módulo).
    await _set_snapshot(db_sessionmaker, eid, {"modulos": ["pos"], "umbral_alerta": 0.8})
    r = await client.post("/api/ia/chat", json={"mensaje": "hola"}, headers=headers)
    assert r.status_code == 403, r.text


async def test_ia_limite_429_y_idempotencia_409(client, db_sessionmaker, empresa_factory, fake_ia):
    headers = await empresa_factory("LimIA SA", "u_limia")
    eid = await _empresa_id(db_sessionmaker, "LimIA SA")
    # Plan con IA pero límite de 1 request, política bloquear.
    await _set_snapshot(db_sessionmaker, eid, {
        "modulos": ["ia"],
        "ia": {"requests": {"limite": 1, "al_exceder": "bloquear"},
               "tokens": {"limite": 1_000_000, "al_exceder": "bloquear"}},
        "umbral_alerta": 0.8,
    })
    # 1er envío OK.
    r1 = await client.post("/api/ia/chat", json={"mensaje": "a", "idempotency_key": "kk1"}, headers=headers)
    assert r1.status_code == 200, r1.text
    # Reintento del MISMO envío → 409.
    r_dup = await client.post("/api/ia/chat", json={"mensaje": "a", "idempotency_key": "kk1"}, headers=headers)
    assert r_dup.status_code == 409, r_dup.text
    assert r_dup.json()["detail"]["error"] == "reintento_duplicado"
    # Nuevo envío (clave nueva) → excede el límite → 429.
    r2 = await client.post("/api/ia/chat", json={"mensaje": "b", "idempotency_key": "kk2"}, headers=headers)
    assert r2.status_code == 429, r2.text
    assert r2.json()["detail"]["dimension"] == "ia_requests"


async def test_ia_consumo_estado(client, db_sessionmaker, empresa_factory, fake_ia):
    headers = await empresa_factory("ConsIA SA", "u_consia")
    r = await client.post("/api/ia/chat", json={"mensaje": "a", "idempotency_key": "c1"}, headers=headers)
    assert r.status_code == 200
    c = await client.get("/api/ia/consumo", headers=headers)
    assert c.status_code == 200
    assert c.json()["dimensiones"]["requests"]["usado"] == 1


# --------------------------------------------------------------------------- #
# Frontera de tokens platform ↔ tenant
# --------------------------------------------------------------------------- #
async def test_frontera_tokens(client, platform_headers, empresa_factory):
    tenant_headers = await empresa_factory("Front SA", "u_front")
    # Token de tenant NO entra a /api/platform/*.
    r1 = await client.get("/api/platform/empresas", headers=tenant_headers)
    assert r1.status_code == 403, r1.text
    # Token de plataforma NO entra a endpoints de tenant.
    r2 = await client.get("/api/empresas/mi-empresa", headers=platform_headers)
    assert r2.status_code in (401, 403), r2.text
    # Plataforma SÍ entra a lo suyo.
    r3 = await client.get("/api/platform/empresas", headers=platform_headers)
    assert r3.status_code == 200, r3.text


# --------------------------------------------------------------------------- #
# Acciones de plataforma: registrar-pago, credito-ia, cambiar-plan, auditoría
# --------------------------------------------------------------------------- #
async def test_registrar_pago_saca_de_vencimiento(client, db_sessionmaker, platform_headers, empresa_factory):
    await empresa_factory("Pago SA", "u_pago")
    eid = await _empresa_id(db_sessionmaker, "Pago SA")
    async with db_sessionmaker() as s:
        sus = await L.obtener_suscripcion_vigente(s, eid)
        sus.fin_trial = datetime.now(timezone.utc) - timedelta(days=1)  # vencida
        await s.commit()
    r = await client.post(f"/api/platform/empresas/{eid}/registrar-pago", json={}, headers=platform_headers)
    assert r.status_code == 200, r.text
    assert r.json()["estado_base"] == "activa"
    assert r.json()["estado_efectivo"] == "activa"


async def test_credito_ia_sin_uso_previo(client, db_sessionmaker, platform_headers, empresa_factory):
    await empresa_factory("Cred SA", "u_cred")
    eid = await _empresa_id(db_sessionmaker, "Cred SA")
    # No hay fila de contador todavía. Otorgar crédito debe crearla (UPSERT).
    r = await client.post(f"/api/platform/empresas/{eid}/credito-ia",
                          json={"requests": 100, "tokens": 5000}, headers=platform_headers)
    assert r.status_code == 200, r.text
    async with db_sessionmaker() as s:
        cont = (await s.execute(select(IaUsoContador).where(IaUsoContador.empresa_id == eid))).scalar_one()
    assert cont.credito_extra_requests == 100 and cont.credito_extra_tokens == 5000


async def test_cambiar_plan_downgrade_excedido(client, db_sessionmaker, platform_headers, empresa_factory, fake_ia):
    headers = await empresa_factory("Down SA", "u_down")
    eid = await _empresa_id(db_sessionmaker, "Down SA")
    # Consumir 1 request en el plan actual (límite alto).
    await client.post("/api/ia/chat", json={"mensaje": "a", "idempotency_key": "d1"}, headers=headers)
    # Crear un plan chico (0 requests) y intentar cambiar sin confirmar → 409.
    async with db_sessionmaker() as s:
        chico = Plan(codigo="chico", nombre="Chico", precio=1, moneda="GTQ",
                     intervalo=IntervaloPlan.MENSUAL,
                     limites={"modulos": ["ia"], "ia": {"requests": {"limite": 0, "al_exceder": "bloquear"},
                              "tokens": {"limite": 0, "al_exceder": "bloquear"}}, "umbral_alerta": 0.8})
        s.add(chico)
        await s.commit()
        chico_id = chico.id
    r = await client.post(f"/api/platform/empresas/{eid}/cambiar-plan",
                          json={"plan_id": chico_id}, headers=platform_headers)
    assert r.status_code == 409, r.text
    # Con confirmar=true sí aplica.
    r2 = await client.post(f"/api/platform/empresas/{eid}/cambiar-plan?confirmar=true",
                           json={"plan_id": chico_id}, headers=platform_headers)
    assert r2.status_code == 200, r2.text


async def test_metricas_y_consumo_en_lista(client, db_sessionmaker, platform_headers, empresa_factory, fake_ia):
    headers = await empresa_factory("Metrica SA", "u_metrica")
    # Una consulta de IA para que haya consumo.
    await client.post("/api/ia/chat", json={"mensaje": "a", "idempotency_key": "m1"}, headers=headers)

    m = await client.get("/api/platform/metricas", headers=platform_headers)
    assert m.status_code == 200, m.text
    body = m.json()
    assert body["negocios"]["total"] >= 1
    assert "mrr" in body and "costo_ia_mes_usd" in body

    lst = await client.get("/api/platform/empresas", headers=platform_headers)
    fila = next(e for e in lst.json() if e["nombre"] == "Metrica SA")
    assert fila["consumo_ia"] is not None
    assert fila["consumo_ia"]["usado"] == 1


def test_frontera_platform_engine_aislado():
    """El engine BYPASSRLS de plataforma NO debe ser alcanzable desde los módulos
    de tenant (dependencies/database). Se importa solo en app/platform y services/platform."""
    import inspect

    import app.database as database_mod
    import app.dependencies as deps_mod

    for mod in (database_mod, deps_mod):
        src = inspect.getsource(mod)
        assert "platform_engine" not in src, f"{mod.__name__} referencia el engine de plataforma"
        assert "platform_session" not in src, f"{mod.__name__} referencia la sesión de plataforma"


async def test_auditoria_accion_plataforma(client, db_sessionmaker, platform_headers, empresa_factory):
    await empresa_factory("Audit SA", "u_audit")
    eid = await _empresa_id(db_sessionmaker, "Audit SA")
    await client.post(f"/api/platform/empresas/{eid}/suspender", json={}, headers=platform_headers)
    async with db_sessionmaker() as s:
        entradas = (await s.execute(
            select(AuditLog).where(AuditLog.accion == "suspender", AuditLog.empresa_id == eid)
        )).scalars().all()
    assert len(entradas) >= 1
    e = entradas[0]
    assert e.platform_admin_id is not None
    assert e.usuario_id is None  # nunca ambos actores a la vez
