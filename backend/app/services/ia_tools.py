"""Herramientas (tools) que el asistente IA puede ejecutar sobre el core.

Todas son de **solo lectura** en esta primera versión y se ejecutan SIEMPRE
acotadas a la empresa actual (`empresa_id`), respetando el multi-tenant. El
agente (app/services/ia.py) decide cuándo llamarlas; aquí sólo se definen su
esquema JSON y su ejecución. Devuelven texto (JSON) para que el modelo lo lea.
"""
import json
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inventario import Stock
from app.models.pos import EstadoVentaPOS, Pago, VentaPOS
from app.models.sku import SKU
from app.models.ventas import Cliente
from app.services import cobranza as cobranza_service


# --- Definiciones de tools (esquema que ve Claude) ---

TOOLS = [
    {
        "name": "resumen_ventas_hoy",
        "description": "Resumen de las ventas del punto de venta (POS) de HOY: número de ventas, total vendido y desglose por método de pago. Úsalo cuando pregunten cómo van las ventas del día.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "alertas_stock",
        "description": "Lista los productos con stock por debajo de su mínimo (necesitan reabastecerse). Úsalo para alertas de inventario o sugerencias de compra.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "estado_cobranza",
        "description": "Resumen GENERAL de la cartera por cobrar (fiado) de todo el negocio: total por cobrar, monto vencido y número de cuentas abiertas. Úsalo cuando pregunten en general cuánto les deben o el estado del fiado, SIN mencionar a un cliente concreto. Para la deuda de un cliente específico usa 'deuda_cliente'.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "deuda_cliente",
        "description": "Cuánto debe un cliente ESPECÍFICO (su cuenta por cobrar / fiado), buscándolo por nombre o código. Devuelve el saldo total pendiente, la antigüedad de la deuda (aging) y el detalle de sus cuentas abiertas. Úsalo siempre que pregunten por la deuda de una persona o cliente concreto, por ejemplo '¿cuánto me debe Miguel Torres?' o '¿qué le debo cobrar a Juan?'.",
        "input_schema": {
            "type": "object",
            "properties": {
                "consulta": {"type": "string", "description": "Nombre o código del cliente a buscar"}
            },
            "required": ["consulta"],
        },
    },
    {
        "name": "buscar_producto",
        "description": "Busca productos (SKU) por código o nombre y devuelve su precio y stock disponible.",
        "input_schema": {
            "type": "object",
            "properties": {
                "consulta": {"type": "string", "description": "Texto a buscar en el código o la descripción del producto"}
            },
            "required": ["consulta"],
        },
    },
]


# --- Ejecutores ---

async def _resumen_ventas_hoy(db: AsyncSession, empresa_id: int, **_: object) -> dict:
    inicio = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    base = (
        VentaPOS.empresa_id == empresa_id,
        VentaPOS.estado == EstadoVentaPOS.COMPLETADA,
        VentaPOS.fecha >= inicio,
    )
    num = (await db.execute(select(func.count()).select_from(VentaPOS).where(*base))).scalar() or 0
    total = (await db.execute(select(func.coalesce(func.sum(VentaPOS.total), 0.0)).where(*base))).scalar() or 0.0
    filas = await db.execute(
        select(Pago.metodo, func.coalesce(func.sum(Pago.monto), 0.0))
        .join(VentaPOS, Pago.venta_pos_id == VentaPOS.id)
        .where(*base)
        .group_by(Pago.metodo)
    )
    por_metodo = {m.value if hasattr(m, "value") else str(m): round(v, 2) for m, v in filas.all()}
    return {"num_ventas": num, "total": round(total, 2), "por_metodo": por_metodo}


async def _alertas_stock(db: AsyncSession, empresa_id: int, **_: object) -> dict:
    result = await db.execute(
        select(SKU.codigo_sku, SKU.descripcion, Stock.cantidad, Stock.cantidad_minima)
        .join(SKU, SKU.id == Stock.sku_id)
        .where(
            Stock.empresa_id == empresa_id,
            Stock.cantidad_minima.is_not(None),
            Stock.cantidad <= Stock.cantidad_minima,
        )
        .limit(50)
    )
    items = [
        {"codigo": c, "descripcion": d, "stock": round(cant, 2), "minimo": round(minimo, 2)}
        for c, d, cant, minimo in result.all()
    ]
    return {"num_alertas": len(items), "productos": items}


async def _estado_cobranza(db: AsyncSession, empresa_id: int, **_: object) -> dict:
    return await cobranza_service.resumen_cobranza(db, empresa_id)


async def _deuda_cliente(db: AsyncSession, empresa_id: int, consulta: str = "", **_: object) -> dict:
    termino = consulta.strip()
    if not termino:
        return {"encontrado": False, "mensaje": "Indica el nombre o código del cliente a consultar."}

    q = f"%{termino}%"
    result = await db.execute(
        select(Cliente)
        .where(
            Cliente.empresa_id == empresa_id,
            (Cliente.nombre.ilike(q)) | (Cliente.codigo.ilike(q)),
        )
        .order_by(Cliente.nombre)
        .limit(10)
    )
    clientes = list(result.scalars().all())

    if not clientes:
        return {"encontrado": False, "mensaje": f"No hay ningún cliente que coincida con '{termino}'."}
    if len(clientes) > 1:
        return {
            "encontrado": False,
            "coincidencias": [{"nombre": c.nombre, "codigo": c.codigo} for c in clientes],
            "mensaje": "Hay varios clientes que coinciden; pide que especifique cuál.",
        }

    cliente = clientes[0]
    estado = await cobranza_service.estado_cuenta_cliente(db, empresa_id, cliente.id)
    cuentas = [
        {
            "concepto": c.concepto,
            "saldo_pendiente": round(c.saldo_pendiente, 2),
            "monto_total": round(c.monto_total, 2),
            "estado": c.estado.value if hasattr(c.estado, "value") else str(c.estado),
            "fecha": c.fecha,
        }
        for c in estado["cuentas"]
        if c.saldo_pendiente > 0.005
    ]
    return {
        "encontrado": True,
        "cliente": cliente.nombre,
        "codigo": cliente.codigo,
        "saldo_total": estado["saldo_total"],
        "num_cuentas_abiertas": len(cuentas),
        "aging": estado["aging"],
        "cuentas": cuentas,
    }


async def _buscar_producto(db: AsyncSession, empresa_id: int, consulta: str = "", **_: object) -> dict:
    q = f"%{consulta.strip()}%"
    result = await db.execute(
        select(SKU.codigo_sku, SKU.descripcion, SKU.precio_referencia,
               func.coalesce(func.sum(Stock.cantidad), 0.0))
        .outerjoin(Stock, (Stock.sku_id == SKU.id) & (Stock.empresa_id == empresa_id))
        .where(SKU.empresa_id == empresa_id, (SKU.codigo_sku.ilike(q)) | (SKU.descripcion.ilike(q)))
        .group_by(SKU.id, SKU.codigo_sku, SKU.descripcion, SKU.precio_referencia)
        .limit(10)
    )
    items = [
        {"codigo": c, "descripcion": d, "precio": round(p, 2), "stock": round(s, 2)}
        for c, d, p, s in result.all()
    ]
    return {"resultados": items}


_EXECUTORS = {
    "resumen_ventas_hoy": _resumen_ventas_hoy,
    "alertas_stock": _alertas_stock,
    "estado_cobranza": _estado_cobranza,
    "deuda_cliente": _deuda_cliente,
    "buscar_producto": _buscar_producto,
}


async def ejecutar_tool(db: AsyncSession, empresa_id: int, nombre: str, args: dict) -> str:
    """Ejecuta una tool por nombre, acotada a la empresa. Devuelve JSON (str)."""
    executor = _EXECUTORS.get(nombre)
    if executor is None:
        return json.dumps({"error": f"herramienta desconocida: {nombre}"})
    try:
        data = await executor(db, empresa_id, **(args or {}))
        return json.dumps(data, ensure_ascii=False, default=str)
    except Exception as exc:  # noqa: BLE001 — el resultado de error se le devuelve al modelo
        return json.dumps({"error": str(exc)})
