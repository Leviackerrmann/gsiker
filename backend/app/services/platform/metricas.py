"""Métricas agregadas del SaaS para el dashboard de plataforma.

Los conteos por estado y el MRR salen de tablas NO-RLS (empresas/suscripciones/
planes). El costo de IA es cross-tenant (tablas bajo RLS): se agrega por la vía
explícita fijando el GUC por empresa (mismo criterio que el detalle).
"""
from datetime import datetime, timezone

from dateutil.relativedelta import relativedelta
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.consumo import IaUsoContador
from app.models.empresa import Empresa, IntervaloPlan, Suscripcion
from app.services import limites as L


def _mrr_de(sus: Suscripcion) -> float:
    """Ingreso mensual equivalente de una suscripción (anual → /12)."""
    precio = float(sus.precio_snapshot or 0)
    return precio / 12 if sus.intervalo_snapshot == IntervaloPlan.ANUAL else precio


async def metricas(db: AsyncSession) -> dict:
    ahora = datetime.now(timezone.utc)
    inicio_mes = ahora.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    inicio_mes_prev = inicio_mes - relativedelta(months=1)

    subs = (await db.execute(
        select(Suscripcion).where(Suscripcion.fecha_fin.is_(None))
    )).scalars().all()

    conteo = {"total": 0, "activa": 0, "trial": 0, "vencida": 0, "suspendida": 0, "cancelada": 0}
    mrr = 0.0
    for s in subs:
        est = L.estado_efectivo(s, ahora).value
        conteo["total"] += 1
        conteo[est] = conteo.get(est, 0) + 1
        if est == "activa":
            mrr += _mrr_de(s)

    altas_mes = await db.scalar(
        select(func.count()).select_from(Empresa).where(Empresa.fecha_creacion >= inicio_mes)
    )
    altas_prev = await db.scalar(
        select(func.count()).select_from(Empresa).where(
            Empresa.fecha_creacion >= inicio_mes_prev, Empresa.fecha_creacion < inicio_mes
        )
    )
    delta_pct = None
    if altas_prev:
        delta_pct = round(((altas_mes - altas_prev) / altas_prev) * 100)

    # Costo de IA del período vigente de cada empresa (cross-tenant vía GUC).
    costo_ia = 0.0
    es_pg = db.bind is not None and db.bind.dialect.name == "postgresql"
    for s in subs:
        ini, _ = L.periodo_vigente(s, ahora)
        if es_pg:
            await db.execute(text("SELECT set_config('app.current_empresa_id', :e, true)"),
                             {"e": str(s.empresa_id)})
        c = (await db.execute(
            select(IaUsoContador).where(
                IaUsoContador.empresa_id == s.empresa_id,
                IaUsoContador.periodo_inicio == ini,
            )
        )).scalar_one_or_none()
        if c:
            costo_ia += float(c.costo_acumulado_usd or 0)
    if es_pg:
        await db.execute(text("SELECT set_config('app.current_empresa_id', '', true)"))

    return {
        "negocios": conteo,
        "mrr": round(mrr, 2),
        "moneda": "GTQ",
        "altas_mes": altas_mes or 0,
        "altas_mes_anterior": altas_prev or 0,
        "altas_delta_pct": delta_pct,
        "costo_ia_mes_usd": round(costo_ia, 4),
    }
