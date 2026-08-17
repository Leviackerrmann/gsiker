"""Lifecycle de suscripciones (acciones de plataforma), con auditoría antes/después.

Reglas clave:
- Los cambios de plan **versionan** (cierran la vigente, insertan una nueva); no mutan.
- El **snapshot** de límites/precio se congela al contratar.
- `empresa.plan_id` es DERIVADO: se recalcula acá, nunca se escribe a mano fuera.
- `vigente_hasta` solo lo empuja `registrar_pago`.
"""
from datetime import datetime, timedelta, timezone

from dateutil.relativedelta import relativedelta
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.consumo import IaUsoContador
from app.models.empresa import Empresa, EstadoSuscripcion, IntervaloPlan, Plan, Suscripcion
from app.services import limites as L
from app.services import permisos as permisos_svc
from app.services.platform.auditoria import registrar_auditoria_plataforma


class DowngradeExcedido(Exception):
    """Cambiar a un plan menor dejaría a la empresa por encima del nuevo límite.
    Requiere confirmación explícita del superadmin."""

    def __init__(self, detalle: dict):
        self.detalle = detalle
        super().__init__("El downgrade deja a la empresa excedida")


def _ahora() -> datetime:
    return datetime.now(timezone.utc)


def _paso(intervalo: IntervaloPlan) -> relativedelta:
    return relativedelta(months=1) if intervalo == IntervaloPlan.MENSUAL else relativedelta(years=1)


def _snapshot(plan: Plan) -> dict:
    return {
        "limites_snapshot": plan.limites,
        "precio_snapshot": plan.precio,
        "moneda_snapshot": plan.moneda,
        "intervalo_snapshot": plan.intervalo,
    }


def _resumen(sus: Suscripcion) -> dict:
    """Snapshot legible para el audit log."""
    return {
        "plan_id": sus.plan_id,
        "estado_base": sus.estado_base.value,
        "fin_trial": sus.fin_trial,
        "vigente_hasta": sus.vigente_hasta,
        "precio": float(sus.precio_snapshot or 0),
    }


async def crear_trial(
    db: AsyncSession, empresa: Empresa, plan: Plan, admin_id: int | None = None
) -> Suscripcion:
    """Alta: primera suscripción en modo prueba. Ancla el ciclo al momento del alta."""
    ahora = _ahora()
    sus = Suscripcion(
        empresa_id=empresa.id,
        plan_id=plan.id,
        estado_base=EstadoSuscripcion.TRIAL,
        fecha_inicio=ahora,
        fin_trial=ahora + timedelta(days=settings.TRIAL_DIAS),
        ancla_facturacion=ahora,
        motivo_cambio="alta",
        creada_por_admin_id=admin_id,
        **_snapshot(plan),
    )
    db.add(sus)
    empresa.plan_id = plan.id  # derivado
    await db.flush()
    if admin_id is not None:
        await registrar_auditoria_plataforma(
            db, admin_id=admin_id, empresa_id=empresa.id, accion="alta",
            despues=_resumen(sus),
        )
    return sus


async def cambiar_plan(
    db: AsyncSession, empresa: Empresa, nuevo_plan: Plan, admin_id: int, confirmar: bool = False
) -> Suscripcion:
    """Versiona la suscripción. Conserva el consumo del período (no toca los
    contadores) y aplica los límites nuevos. Preserva `ancla_facturacion` para no
    recalcular fronteras con un contador en curso. Un downgrade que deje a la
    empresa ya excedida exige `confirmar=True`."""
    ahora = _ahora()
    actual = await L.obtener_suscripcion_vigente(db, empresa.id)
    antes = _resumen(actual) if actual else None

    # Chequeo de downgrade excedido contra el consumo del período vigente.
    if actual is not None and not confirmar:
        inicio, _ = L.periodo_vigente(actual, ahora)
        contador = (await db.execute(
            select(IaUsoContador).where(
                IaUsoContador.empresa_id == empresa.id,
                IaUsoContador.periodo_inicio == inicio,
            )
        )).scalar_one_or_none()
        excedidos = _excedidos_con_nuevos_limites(contador, nuevo_plan.limites)
        if excedidos:
            raise DowngradeExcedido({"excedidos": excedidos})

    if actual is not None:
        actual.fecha_fin = ahora
        ancla = actual.ancla_facturacion
        fin_trial = actual.fin_trial
        vigente_hasta = actual.vigente_hasta
        estado_base = actual.estado_base
    else:
        ancla, fin_trial, vigente_hasta, estado_base = ahora, None, None, EstadoSuscripcion.ACTIVA

    nueva = Suscripcion(
        empresa_id=empresa.id,
        plan_id=nuevo_plan.id,
        estado_base=estado_base,
        fecha_inicio=ahora,
        fin_trial=fin_trial,
        vigente_hasta=vigente_hasta,
        ancla_facturacion=ancla,  # preserva el ciclo de consumo
        motivo_cambio="cambio_plan",
        creada_por_admin_id=admin_id,
        **_snapshot(nuevo_plan),
    )
    db.add(nueva)
    empresa.plan_id = nuevo_plan.id  # derivado
    await db.flush()
    await registrar_auditoria_plataforma(
        db, admin_id=admin_id, empresa_id=empresa.id, accion="cambiar_plan",
        antes=antes, despues=_resumen(nueva),
    )
    return nueva


def _excedidos_con_nuevos_limites(contador, limites: dict) -> list[dict]:
    """Dimensiones de IA que ya estarían excedidas bajo los límites nuevos."""
    if contador is None:
        return []
    out = []
    for dim, usado in (("requests", contador.requests_usados), ("tokens", contador.tokens_usados)):
        limite = L.leer_limite(limites, f"ia.{dim}.limite")
        if limite is not None and usado > int(limite):
            out.append({"dimension": dim, "usado": usado, "nuevo_limite": int(limite)})
    return out


async def registrar_pago(
    db: AsyncSession, empresa: Empresa, admin_id: int, hasta: datetime | None = None
) -> Suscripcion:
    """Marca pagado/renueva: empuja `vigente_hasta` (+1 intervalo o fecha dada) y,
    si venía de trial, pasa a activa. Único escritor de `vigente_hasta`."""
    sus = await L.obtener_suscripcion_vigente(db, empresa.id)
    if sus is None:
        raise ValueError("La empresa no tiene suscripción vigente")
    antes = _resumen(sus)
    base = hasta
    if base is None:
        desde = sus.vigente_hasta if (sus.vigente_hasta and sus.vigente_hasta > _ahora()) else _ahora()
        base = desde + _paso(sus.intervalo_snapshot)
    sus.vigente_hasta = base
    if sus.estado_base in (EstadoSuscripcion.TRIAL, EstadoSuscripcion.SUSPENDIDA):
        sus.estado_base = EstadoSuscripcion.ACTIVA
    await db.flush()
    await registrar_auditoria_plataforma(
        db, admin_id=admin_id, empresa_id=empresa.id, accion="registrar_pago",
        antes=antes, despues=_resumen(sus),
    )
    return sus


async def extender_trial(db: AsyncSession, empresa: Empresa, admin_id: int, dias: int) -> Suscripcion:
    sus = await L.obtener_suscripcion_vigente(db, empresa.id)
    if sus is None:
        raise ValueError("La empresa no tiene suscripción vigente")
    antes = _resumen(sus)
    desde = sus.fin_trial if (sus.fin_trial and sus.fin_trial > _ahora()) else _ahora()
    sus.fin_trial = desde + timedelta(days=dias)
    if sus.estado_base == EstadoSuscripcion.SUSPENDIDA:
        sus.estado_base = EstadoSuscripcion.TRIAL
    await db.flush()
    await registrar_auditoria_plataforma(
        db, admin_id=admin_id, empresa_id=empresa.id, accion="extender_trial",
        antes=antes, despues=_resumen(sus),
    )
    return sus


async def _set_estado(db, empresa, admin_id, estado: EstadoSuscripcion, accion: str) -> Suscripcion:
    sus = await L.obtener_suscripcion_vigente(db, empresa.id)
    if sus is None:
        raise ValueError("La empresa no tiene suscripción vigente")
    antes = _resumen(sus)
    sus.estado_base = estado
    await db.flush()
    await registrar_auditoria_plataforma(
        db, admin_id=admin_id, empresa_id=empresa.id, accion=accion,
        antes=antes, despues=_resumen(sus),
    )
    return sus


async def suspender(db, empresa, admin_id) -> Suscripcion:
    return await _set_estado(db, empresa, admin_id, EstadoSuscripcion.SUSPENDIDA, "suspender")


async def reactivar(db, empresa, admin_id) -> Suscripcion:
    return await _set_estado(db, empresa, admin_id, EstadoSuscripcion.ACTIVA, "reactivar")


async def credito_ia(
    db: AsyncSession, empresa: Empresa, admin_id: int, requests: int = 0, tokens: int = 0
) -> None:
    """Otorga crédito extra de IA en el período vigente. UPSERT como el conteo:
    si la fila del contador no existe aún, la crea con el crédito (no lo pierde).
    Los créditos NO se arrastran al período siguiente (viven en la fila del período)."""
    sus = await L.obtener_suscripcion_vigente(db, empresa.id)
    if sus is None:
        raise ValueError("La empresa no tiene suscripción vigente")
    inicio, fin = L.periodo_vigente(sus)
    ins = pg_insert if db.bind.dialect.name == "postgresql" else sqlite_insert
    stmt = ins(IaUsoContador).values(
        empresa_id=empresa.id,
        periodo_inicio=inicio,
        periodo_fin=fin,
        credito_extra_requests=requests,
        credito_extra_tokens=tokens,
    ).on_conflict_do_update(
        index_elements=["empresa_id", "periodo_inicio"],
        set_={
            "credito_extra_requests": IaUsoContador.__table__.c.credito_extra_requests + requests,
            "credito_extra_tokens": IaUsoContador.__table__.c.credito_extra_tokens + tokens,
        },
    )
    await db.execute(stmt)
    await registrar_auditoria_plataforma(
        db, admin_id=admin_id, empresa_id=empresa.id, accion="credito_ia",
        despues={"credito_requests": requests, "credito_tokens": tokens, "periodo_inicio": inicio},
    )


async def set_modulos(
    db: AsyncSession, empresa: Empresa, admin_id: int, modulos: list[str]
) -> dict:
    """Fija los módulos efectivos de una empresa (capa 1, override del superadmin).

    Recibe el conjunto FINAL deseado y lo guarda como diff contra los módulos del
    plan vigente (`{"add", "remove"}`), para que sobreviva a cambios de plan. Si el
    deseado coincide con el plan, borra el override (vuelve a "tal cual el plan")."""
    sus = await L.obtener_suscripcion_vigente(db, empresa.id)
    if sus is None:
        raise ValueError("La empresa no tiene suscripción vigente")

    plan_mods = set()
    mods_snap = L.leer_limite(sus.limites_snapshot, "modulos")
    if isinstance(mods_snap, list):
        plan_mods = {m for m in mods_snap if isinstance(m, str)}

    deseado = {m for m in modulos if isinstance(m, str)} & permisos_svc.MODULOS_VALIDOS
    add = sorted(deseado - plan_mods)
    remove = sorted(plan_mods - deseado)
    antes = empresa.modulos_override
    empresa.modulos_override = {"add": add, "remove": remove} if (add or remove) else None
    await db.flush()
    await registrar_auditoria_plataforma(
        db, admin_id=admin_id, empresa_id=empresa.id, accion="set_modulos",
        antes={"override": antes}, despues={"override": empresa.modulos_override, "efectivos": sorted(deseado)},
    )
    return {"modulos_efectivos": sorted(deseado), "override": empresa.modulos_override}
