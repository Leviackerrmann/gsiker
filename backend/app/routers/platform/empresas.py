from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_platform_admin
from app.models.consumo import IaUsoContador
from app.models.empresa import Empresa, Plan, Suscripcion
from app.models.platform_admin import PlatformAdmin
from app.services import limites as L
from app.services import permisos as permisos_svc
from app.services.platform import metricas as M
from app.services.platform import suscripciones as S

router = APIRouter(prefix="/api/platform", tags=["platform-empresas"])


# ----------------------------- Request bodies ------------------------------ #
class CambiarPlan(BaseModel):
    plan_id: int


class RegistrarPago(BaseModel):
    hasta: str | None = None  # ISO datetime opcional; si no, +1 intervalo


class ExtenderTrial(BaseModel):
    dias: int = 15


class CreditoIA(BaseModel):
    requests: int = 0
    tokens: int = 0


class SetModulos(BaseModel):
    modulos: list[str]  # conjunto final deseado de módulos para la empresa


# ------------------------------- Helpers ----------------------------------- #
async def _empresa(db: AsyncSession, empresa_id: int) -> Empresa:
    emp = await db.get(Empresa, empresa_id)
    if emp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa no encontrada")
    return emp


def _resumen_suscripcion(sus: Suscripcion | None) -> dict | None:
    if sus is None:
        return None
    estado = L.estado_efectivo(sus)
    return {
        "plan_id": sus.plan_id,
        "estado_base": sus.estado_base.value,
        "estado_efectivo": estado.value,
        "fin_trial": sus.fin_trial,
        "vigente_hasta": sus.vigente_hasta,
        "precio": float(sus.precio_snapshot or 0),
        "moneda": sus.moneda_snapshot,
        "intervalo": sus.intervalo_snapshot.value,
    }


# ------------------------------ Endpoints ---------------------------------- #
@router.get("/metricas")
async def metricas(db: AsyncSession = Depends(get_db), _: PlatformAdmin = Depends(get_platform_admin)):
    """KPIs del SaaS para el dashboard: conteos por estado, MRR, altas del mes,
    costo de IA agregado."""
    return await M.metricas(db)


async def _consumo_ia_resumen(db: AsyncSession, sus: Suscripcion | None, es_pg: bool) -> dict | None:
    """Resumen de consumo de requests IA de la empresa (para la tabla). None si el
    plan no incluye IA. Cross-tenant → fija el GUC de esa empresa."""
    if sus is None or not L.modulo_habilitado(sus.limites_snapshot, "ia"):
        return None
    r = await L.verificar_limite_ia(db, sus, "requests")
    pct = None
    if r.limite:
        pct = min(100, round((r.usado / r.limite) * 100))
    return {"usado": r.usado, "limite": r.limite, "pct": pct, "estado": r.estado.value}


@router.get("/empresas")
async def listar_empresas(
    db: AsyncSession = Depends(get_db), _: PlatformAdmin = Depends(get_platform_admin)
):
    """Lista de empresas con plan vigente, estado efectivo y consumo de IA."""
    empresas = (await db.execute(select(Empresa).order_by(Empresa.nombre))).scalars().all()
    es_pg = db.bind is not None and db.bind.dialect.name == "postgresql"
    out = []
    for emp in empresas:
        sus = await L.obtener_suscripcion_vigente(db, emp.id)
        plan = await db.get(Plan, sus.plan_id) if sus else None
        if es_pg:
            await db.execute(text("SELECT set_config('app.current_empresa_id', :e, true)"), {"e": str(emp.id)})
        consumo = await _consumo_ia_resumen(db, sus, es_pg)
        out.append({
            "id": emp.id,
            "nombre": emp.nombre,
            "activa": emp.activa,
            "plan": plan.nombre if plan else None,
            "suscripcion": _resumen_suscripcion(sus),
            "consumo_ia": consumo,
        })
    if es_pg:
        await db.execute(text("SELECT set_config('app.current_empresa_id', '', true)"))
    return out


@router.get("/empresas/{empresa_id}")
async def detalle_empresa(
    empresa_id: int,
    db: AsyncSession = Depends(get_db),
    _: PlatformAdmin = Depends(get_platform_admin),
):
    """Detalle: plan, estado, consumo del período vigente vs límites, histórico."""
    emp = await _empresa(db, empresa_id)
    sus = await L.obtener_suscripcion_vigente(db, emp.id)

    # Consumo: tablas de uso bajo RLS. Vía explícita para UNA empresa = fijar su
    # GUC (queda acotado a esta empresa). En SQLite (tests) no hay RLS.
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        await db.execute(
            text("SELECT set_config('app.current_empresa_id', :e, true)"), {"e": str(emp.id)}
        )
    contadores = (await db.execute(
        select(IaUsoContador)
        .where(IaUsoContador.empresa_id == emp.id)
        .order_by(IaUsoContador.periodo_inicio.desc())
    )).scalars().all()

    consumo_vigente = None
    historico = []
    if sus is not None:
        inicio, _fin = L.periodo_vigente(sus)
        for c in contadores:
            fila = {
                "periodo_inicio": c.periodo_inicio,
                "periodo_fin": c.periodo_fin,
                "requests_usados": c.requests_usados,
                "tokens_usados": c.tokens_usados,
                "costo_usd": float(c.costo_acumulado_usd or 0),
                "credito_extra_requests": c.credito_extra_requests,
                "credito_extra_tokens": c.credito_extra_tokens,
            }
            c_inicio = c.periodo_inicio.replace(tzinfo=inicio.tzinfo) if c.periodo_inicio.tzinfo is None else c.periodo_inicio
            if c_inicio == inicio:
                consumo_vigente = fila
            else:
                historico.append(fila)

    limites = sus.limites_snapshot if sus else {}
    return {
        "id": emp.id,
        "nombre": emp.nombre,
        "activa": emp.activa,
        "suscripcion": _resumen_suscripcion(sus),
        "limites": limites,
        "consumo_vigente": consumo_vigente,
        "historico": historico,
        # Módulos (capa 1): catálogo, efectivos de la empresa y override actual.
        "modulos_disponibles": sorted(permisos_svc.MODULOS_VALIDOS),
        "modulos_efectivos": sorted(permisos_svc.modulos_efectivos_empresa(sus, emp)),
        "modulos_override": emp.modulos_override,
    }


@router.get("/vencimientos")
async def vencimientos(
    dias: int = Query(7, ge=0, le=365),
    db: AsyncSession = Depends(get_db),
    _: PlatformAdmin = Depends(get_platform_admin),
):
    """Empresas cuya prueba/suscripción vence dentro de N días (o ya vencidas).
    Imprescindible con cobro manual. Calculado con estado_efectivo, sin cron."""
    from datetime import datetime, timezone

    ahora = datetime.now(timezone.utc)
    limite = ahora + timedelta(days=dias)
    subs = (await db.execute(
        select(Suscripcion).where(Suscripcion.fecha_fin.is_(None))
    )).scalars().all()
    out = []
    for sus in subs:
        estado = L.estado_efectivo(sus)
        fecha_ref = sus.fin_trial if sus.estado_base.value == "trial" else sus.vigente_hasta
        if fecha_ref is None:
            continue
        ref = fecha_ref.replace(tzinfo=timezone.utc) if fecha_ref.tzinfo is None else fecha_ref
        if ref <= limite:
            emp = await db.get(Empresa, sus.empresa_id)
            out.append({
                "empresa_id": sus.empresa_id,
                "empresa": emp.nombre if emp else None,
                "estado_efectivo": estado.value,
                "vence": ref,
                "vencida": estado.value == "vencida",
            })
    out.sort(key=lambda x: x["vence"])
    return out


# ------------------------------- Acciones ---------------------------------- #
@router.post("/empresas/{empresa_id}/cambiar-plan")
async def cambiar_plan(
    empresa_id: int,
    body: CambiarPlan,
    confirmar: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    admin: PlatformAdmin = Depends(get_platform_admin),
):
    emp = await _empresa(db, empresa_id)
    plan = await db.get(Plan, body.plan_id)
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan no encontrado")
    try:
        sus = await S.cambiar_plan(db, emp, plan, admin.id, confirmar=confirmar)
    except S.DowngradeExcedido as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error": "downgrade_excedido", **exc.detalle,
                    "mensaje": "El plan nuevo deja a la empresa excedida. Reenviá con confirmar=true."},
        )
    return _resumen_suscripcion(sus)


@router.post("/empresas/{empresa_id}/registrar-pago")
async def registrar_pago(
    empresa_id: int,
    body: RegistrarPago,
    db: AsyncSession = Depends(get_db),
    admin: PlatformAdmin = Depends(get_platform_admin),
):
    emp = await _empresa(db, empresa_id)
    hasta = None
    if body.hasta:
        from datetime import datetime
        hasta = datetime.fromisoformat(body.hasta)
    try:
        sus = await S.registrar_pago(db, emp, admin.id, hasta=hasta)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return _resumen_suscripcion(sus)


@router.post("/empresas/{empresa_id}/extender-trial")
async def extender_trial(
    empresa_id: int,
    body: ExtenderTrial,
    db: AsyncSession = Depends(get_db),
    admin: PlatformAdmin = Depends(get_platform_admin),
):
    emp = await _empresa(db, empresa_id)
    try:
        sus = await S.extender_trial(db, emp, admin.id, body.dias)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return _resumen_suscripcion(sus)


@router.post("/empresas/{empresa_id}/suspender")
async def suspender(
    empresa_id: int,
    db: AsyncSession = Depends(get_db),
    admin: PlatformAdmin = Depends(get_platform_admin),
):
    emp = await _empresa(db, empresa_id)
    try:
        sus = await S.suspender(db, emp, admin.id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return _resumen_suscripcion(sus)


@router.post("/empresas/{empresa_id}/reactivar")
async def reactivar(
    empresa_id: int,
    db: AsyncSession = Depends(get_db),
    admin: PlatformAdmin = Depends(get_platform_admin),
):
    emp = await _empresa(db, empresa_id)
    try:
        sus = await S.reactivar(db, emp, admin.id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return _resumen_suscripcion(sus)


@router.post("/empresas/{empresa_id}/credito-ia")
async def credito_ia(
    empresa_id: int,
    body: CreditoIA,
    db: AsyncSession = Depends(get_db),
    admin: PlatformAdmin = Depends(get_platform_admin),
):
    emp = await _empresa(db, empresa_id)
    try:
        await S.credito_ia(db, emp, admin.id, requests=body.requests, tokens=body.tokens)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return {"ok": True, "credito_requests": body.requests, "credito_tokens": body.tokens}


@router.post("/empresas/{empresa_id}/modulos")
async def set_modulos(
    empresa_id: int,
    body: SetModulos,
    db: AsyncSession = Depends(get_db),
    admin: PlatformAdmin = Depends(get_platform_admin),
):
    """Fija los módulos que tiene la empresa (override del plan, sin cambiarla de plan)."""
    emp = await _empresa(db, empresa_id)
    try:
        return await S.set_modulos(db, emp, admin.id, body.modulos)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
