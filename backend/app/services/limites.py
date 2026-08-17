"""Núcleo de planes: interpretación de límites (data, no código), cálculo de
período y estado efectivo, verificación de límites y registro atómico de consumo.

Un solo lugar interpreta el JSON de límites (`leer_limite`, fail-closed) y un
solo lugar mide/gatea el consumo de IA. Nada de `if plan == "pro"` disperso.
"""
import enum
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal

from dateutil.relativedelta import relativedelta
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.consumo import IaUsoContador, IaUsoEvento
from app.models.empresa import EstadoSuscripcion, IntervaloPlan, Suscripcion


# --------------------------------------------------------------------------- #
# Excepciones (se traducen a HTTP en los routers)
# --------------------------------------------------------------------------- #
class LimiteExcedido(Exception):
    """Límite de consumo agotado. → HTTP 429 con cuerpo estructurado."""

    def __init__(self, dimension: str, limite, usado, reset_en, sugerencia: str = ""):
        self.dimension = dimension
        self.limite = limite
        self.usado = usado
        self.reset_en = reset_en
        self.sugerencia = sugerencia or "Renová tu plan o esperá al próximo período"
        super().__init__(f"Límite excedido: {dimension} ({usado}/{limite})")

    def cuerpo(self) -> dict:
        return {
            "error": "limite_excedido",
            "dimension": self.dimension,
            "limite": self.limite,
            "usado": self.usado,
            "reset_en": self.reset_en.isoformat() if self.reset_en else None,
            "sugerencia": self.sugerencia,
        }


class ReintentoDuplicado(Exception):
    """El envío (idempotency_key) ya fue procesado. → HTTP 409."""

    def __init__(self, idempotency_key: str):
        self.idempotency_key = idempotency_key
        super().__init__("Envío duplicado")

    def cuerpo(self) -> dict:
        return {
            "error": "reintento_duplicado",
            "idempotency_key": self.idempotency_key,
            "mensaje": "Este envío ya fue procesado; usá una clave nueva para un envío nuevo",
        }


class ModuloNoDisponible(Exception):
    """El módulo no está incluido en el plan de la empresa. → HTTP 403."""

    def __init__(self, modulo: str):
        self.modulo = modulo
        super().__init__(f"Módulo no disponible en el plan: {modulo}")


class SuscripcionInactiva(Exception):
    """Suscripción vencida/suspendida: no puede consumir/escribir. → HTTP 402."""


# --------------------------------------------------------------------------- #
# Esquema de límites (validado al guardar) + accessor fail-closed al leer
# --------------------------------------------------------------------------- #
class LimiteIA(BaseModel):
    limite: int | None  # null = ilimitado
    al_exceder: str = "bloquear"  # bloquear | degradar | permitir_excedente


class LimitesIA(BaseModel):
    requests: LimiteIA
    tokens: LimiteIA


class LimitesPlan(BaseModel):
    """Estructura válida de `plan.limites`. Se valida al guardar un plan; no se
    persiste JSON arbitrario."""

    usuarios: int | None = 0
    registros: dict[str, int | None] = Field(default_factory=dict)
    modulos: list[str] = Field(default_factory=list)
    ia: LimitesIA | None = None
    umbral_alerta: float = 0.8


_FALTA = 0  # fail-closed: llave ausente = límite 0 (deniega), NO ilimitado.


def leer_limite(limites: dict | None, ruta: str):
    """Lee `ruta` (p. ej. "ia.requests.limite" o "usuarios") de `limites`.

    Fail-closed: si falta cualquier tramo → 0 (deniega). "Ilimitado" solo con
    `null` explícito en esa llave. Un número → ese número.
    """
    nodo = limites or {}
    for parte in ruta.split("."):
        if not isinstance(nodo, dict) or parte not in nodo:
            return _FALTA
        nodo = nodo[parte]
    return nodo  # puede ser None (ilimitado), int, str, list...


def politica_exceso(limites: dict | None, dimension: str) -> str:
    """Política al exceder una dimensión de IA. Fail-closed → 'bloquear'."""
    val = leer_limite(limites, f"ia.{dimension}.al_exceder")
    if val in ("bloquear", "degradar", "permitir_excedente"):
        return val
    return "bloquear"


def modulo_habilitado(limites: dict | None, modulo: str) -> bool:
    """¿El plan incluye este módulo? Fail-closed: sin lista de módulos → False."""
    mods = leer_limite(limites, "modulos")
    return isinstance(mods, list) and modulo in mods


def umbral_alerta(limites: dict | None) -> float:
    val = leer_limite(limites, "umbral_alerta")
    if isinstance(val, (int, float)) and 0 < val <= 1:
        return float(val)
    return settings.LIMITE_UMBRAL_ALERTA


# --------------------------------------------------------------------------- #
# Período de consumo (anclado a facturación) y estado efectivo (sin cron)
# --------------------------------------------------------------------------- #
def _ahora() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime | None) -> datetime | None:
    """Normaliza a UTC-aware (SQLite devuelve naive)."""
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def periodo_vigente(sus: Suscripcion, ahora: datetime | None = None) -> tuple[datetime, datetime]:
    """(inicio, fin) del período de consumo que contiene `ahora`, anclado a
    `ancla_facturacion` y avanzando en pasos del intervalo. Reseteo por cálculo:
    un período nuevo => un `inicio` nuevo => una fila de contador nueva en 0."""
    ahora = ahora or _ahora()
    ancla = _aware(sus.ancla_facturacion) or ahora
    paso = relativedelta(months=1) if sus.intervalo_snapshot == IntervaloPlan.MENSUAL else relativedelta(years=1)
    inicio = ancla
    # Avance acotado (evita bucle patológico ante fechas absurdas).
    for _ in range(10000):
        if inicio + paso > ahora:
            break
        inicio = inicio + paso
    return inicio, inicio + paso


class EstadoEfectivo(str, enum.Enum):
    TRIAL = "trial"
    ACTIVA = "activa"
    VENCIDA = "vencida"
    SUSPENDIDA = "suspendida"
    CANCELADA = "cancelada"


def estado_efectivo(sus: Suscripcion, ahora: datetime | None = None) -> EstadoEfectivo:
    """Estado real calculado desde las fechas (sin cron). `vencida` no se
    almacena: se deriva de `fin_trial`/`vigente_hasta`."""
    ahora = ahora or _ahora()
    if sus.estado_base == EstadoSuscripcion.SUSPENDIDA:
        return EstadoEfectivo.SUSPENDIDA
    if sus.estado_base == EstadoSuscripcion.CANCELADA:
        return EstadoEfectivo.CANCELADA
    if sus.estado_base == EstadoSuscripcion.TRIAL:
        fin = _aware(sus.fin_trial)
        return EstadoEfectivo.VENCIDA if (fin and ahora > fin) else EstadoEfectivo.TRIAL
    # ACTIVA: requiere vigencia pagada. Sin vigente_hasta ⇒ vencida (fail-safe).
    vig = _aware(sus.vigente_hasta)
    return EstadoEfectivo.ACTIVA if (vig and ahora <= vig) else EstadoEfectivo.VENCIDA


def puede_escribir(estado: EstadoEfectivo) -> bool:
    """Solo trial/activa escriben. Vencida/suspendida/cancelada = solo lectura."""
    return estado in (EstadoEfectivo.TRIAL, EstadoEfectivo.ACTIVA)


# --------------------------------------------------------------------------- #
# Suscripción vigente
# --------------------------------------------------------------------------- #
async def obtener_suscripcion_vigente(db: AsyncSession, empresa_id: int) -> Suscripcion | None:
    res = await db.execute(
        select(Suscripcion).where(
            Suscripcion.empresa_id == empresa_id, Suscripcion.fecha_fin.is_(None)
        )
    )
    return res.scalar_one_or_none()


# --------------------------------------------------------------------------- #
# Verificación y registro de consumo de IA
# --------------------------------------------------------------------------- #
class EstadoLimite(str, enum.Enum):
    DENTRO = "dentro"
    CERCA = "cerca"
    EXCEDIDO = "excedido"


@dataclass
class ResultadoLimite:
    estado: EstadoLimite
    dimension: str
    usado: int
    limite: int | None       # None = ilimitado
    reset_en: datetime
    politica: str


async def _contador_periodo(db, empresa_id, periodo_inicio) -> IaUsoContador | None:
    res = await db.execute(
        select(IaUsoContador).where(
            IaUsoContador.empresa_id == empresa_id,
            IaUsoContador.periodo_inicio == periodo_inicio,
        )
    )
    return res.scalar_one_or_none()


def _evaluar(dimension, usado, limite, credito, umbral, reset_en, politica) -> ResultadoLimite:
    if limite is None:  # ilimitado explícito
        return ResultadoLimite(EstadoLimite.DENTRO, dimension, usado, None, reset_en, politica)
    tope = int(limite) + int(credito or 0)
    if usado >= tope:
        estado = EstadoLimite.EXCEDIDO
    elif tope > 0 and usado >= umbral * tope:
        estado = EstadoLimite.CERCA
    else:
        estado = EstadoLimite.DENTRO
    return ResultadoLimite(estado, dimension, usado, tope, reset_en, politica)


async def verificar_limite_ia(
    db: AsyncSession, sus: Suscripcion, dimension: str, ahora: datetime | None = None
) -> ResultadoLimite:
    """Estado de una dimensión de IA (`requests`/`tokens`) para el período vigente.
    No consume; solo informa (dentro/cerca/excedido). Fail-closed en los límites."""
    ahora = ahora or _ahora()
    inicio, fin = periodo_vigente(sus, ahora)
    contador = await _contador_periodo(db, sus.empresa_id, inicio)
    limites = sus.limites_snapshot
    limite = leer_limite(limites, f"ia.{dimension}.limite")
    if dimension == "requests":
        usado = contador.requests_usados if contador else 0
        credito = contador.credito_extra_requests if contador else 0
    else:
        usado = contador.tokens_usados if contador else 0
        credito = contador.credito_extra_tokens if contador else 0
    return _evaluar(
        dimension, usado, limite, credito, umbral_alerta(limites), fin, politica_exceso(limites, dimension)
    )


def estimar_costo_usd(modelo: str | None, tokens_in: int, tokens_out: int) -> Decimal:
    """Costo estimado en USD según la tabla de precios por modelo (config).
    Modelos gratis o desconocidos → 0."""
    precios = settings.IA_PRECIOS_USD_POR_1M or {}
    pin = pout = 0.0
    if modelo:
        for clave, (i, o) in precios.items():
            if modelo == clave or modelo.startswith(clave):
                pin, pout = i, o
                break
    costo = (tokens_in / 1_000_000) * pin + (tokens_out / 1_000_000) * pout
    return Decimal(str(round(costo, 6)))


async def registrar_uso_ia(
    db: AsyncSession,
    empresa_id: int,
    usuario_id: int | None,
    feature: str,
    modelo: str | None,
    tokens_in: int,
    tokens_out: int,
    idempotency_key: str,
    periodo_inicio: datetime,
    periodo_fin: datetime,
) -> bool:
    """Registro atómico del consumo real (paso 5 del flujo). Devuelve True si se
    contó (evento nuevo) o False si la clave ya existía (envío duplicado → 409).

    Ambas operaciones en la MISMA transacción del caller: el evento es el candado
    de idempotencia (UNIQUE empresa+clave), y el contador se incrementa con
    ON CONFLICT DO UPDATE (leer+sumar+escribir bajo lock de fila, sin carrera).
    """
    ins = pg_insert if db.bind.dialect.name == "postgresql" else sqlite_insert
    costo = estimar_costo_usd(modelo, tokens_in, tokens_out)
    total_tokens = int(tokens_in) + int(tokens_out)

    ev = (
        ins(IaUsoEvento)
        .values(
            empresa_id=empresa_id,
            usuario_id=usuario_id,
            feature=feature,
            modelo=modelo,
            tokens_entrada=tokens_in,
            tokens_salida=tokens_out,
            costo_estimado_usd=costo,
            periodo_inicio=periodo_inicio,
            idempotency_key=idempotency_key,
        )
        .on_conflict_do_nothing(index_elements=["empresa_id", "idempotency_key"])
        .returning(IaUsoEvento.id)
    )
    creado = (await db.execute(ev)).scalar_one_or_none()
    if creado is None:
        return False  # duplicado: NO se cuenta.

    cont = ins(IaUsoContador).values(
        empresa_id=empresa_id,
        periodo_inicio=periodo_inicio,
        periodo_fin=periodo_fin,
        requests_usados=1,
        tokens_usados=total_tokens,
        costo_acumulado_usd=costo,
    )
    cont = cont.on_conflict_do_update(
        index_elements=["empresa_id", "periodo_inicio"],
        set_={
            "requests_usados": IaUsoContador.__table__.c.requests_usados + 1,
            "tokens_usados": IaUsoContador.__table__.c.tokens_usados + total_tokens,
            "costo_acumulado_usd": IaUsoContador.__table__.c.costo_acumulado_usd + costo,
        },
    )
    await db.execute(cont)
    return True


# --------------------------------------------------------------------------- #
# Límite de registros por entidad (usuarios, skus, clientes...)
# --------------------------------------------------------------------------- #
async def verificar_limite_registros(db: AsyncSession, empresa_id: int, entidad: str, modelo) -> None:
    """Lanza LimiteExcedido si crear un registro más de `entidad` superaría el
    límite del plan. `entidad` = "usuarios" o "registros.<entidad>". Fail-closed."""
    sus = await obtener_suscripcion_vigente(db, empresa_id)
    limites = sus.limites_snapshot if sus else {}
    ruta = entidad if entidad == "usuarios" else f"registros.{entidad}"
    limite = leer_limite(limites, ruta)
    if limite is None:  # ilimitado
        return
    total = await db.scalar(
        select(func.count()).select_from(modelo).where(modelo.empresa_id == empresa_id)
    )
    if (total or 0) >= int(limite):
        raise LimiteExcedido(
            dimension=entidad, limite=int(limite), usado=int(total or 0), reset_en=None,
            sugerencia="Actualizá tu plan para agregar más.",
        )
