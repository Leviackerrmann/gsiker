import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_empresa, get_current_user, requiere_permiso
from app.models.consumo import IaUsoEvento
from app.models.empresa import Empresa
from app.models.usuario import Usuario
from app.schemas.ia import ChatRequest, ChatResponse
from app.services import ia as ia_service
from app.services import limites as L

router = APIRouter(prefix="/api/ia", tags=["ia"])


@router.get("/estado")
async def estado_ia(_current_user: Usuario = Depends(get_current_user)):
    """Indica si el asistente IA está disponible (configurado) y con qué proveedor."""
    return ia_service.estado()


@router.get("/consumo")
async def consumo_ia(
    request: Request,
    empresa: Empresa = Depends(get_current_empresa),
    db: AsyncSession = Depends(get_db),
):
    """Consumo de IA del período vigente vs límites (para que el frontend avise
    antes de chocar: estados dentro/cerca/excedido)."""
    sus = getattr(request.state, "suscripcion", None)
    if sus is None:
        return {"disponible": False, "motivo": "sin_suscripcion"}
    # La IA es un módulo del plan: si no lo incluye, no es "agotado", es "no incluido".
    if not L.modulo_habilitado(sus.limites_snapshot, "ia"):
        return {"disponible": False, "motivo": "plan_sin_ia"}
    dims = {}
    for dim in ("requests", "tokens"):
        r = await L.verificar_limite_ia(db, sus, dim)
        dims[dim] = {
            "estado": r.estado.value, "usado": r.usado, "limite": r.limite,
            "reset_en": r.reset_en.isoformat() if r.reset_en else None, "politica": r.politica,
        }
    return {"disponible": True, "dimensiones": dims}


@router.post("/chat", response_model=ChatResponse)
async def chat(
    body: ChatRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    empresa: Empresa = Depends(requiere_permiso("ia")),
    current_user: Usuario = Depends(get_current_user),
):
    if not settings.IA_ENABLED:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="El asistente IA está deshabilitado")

    sus = getattr(request.state, "suscripcion", None)
    idem = (body.idempotency_key or uuid.uuid4().hex)[:64]

    if sus is not None:
        # Idempotencia primero: un reintento del MISMO envío ya fue procesado/contado
        # → 409 explícito, sin llamar al modelo ni contar (gana al chequeo de límite).
        ya = await db.execute(
            select(IaUsoEvento.id).where(
                IaUsoEvento.empresa_id == empresa.id, IaUsoEvento.idempotency_key == idem
            )
        )
        if ya.scalar_one_or_none() is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=L.ReintentoDuplicado(idem).cuerpo())
        # Pre-chequeo de límites ANTES de llamar al modelo.
        for dim in ("requests", "tokens"):
            r = await L.verificar_limite_ia(db, sus, dim)
            if r.estado == L.EstadoLimite.EXCEDIDO and r.politica == "bloquear":
                raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=r_cuerpo(r))

    # --- Llamada al modelo ---
    try:
        resultado = await ia_service.chat(
            db, empresa.id, empresa.nombre, body.mensaje,
            historial=[m.model_dump() for m in body.historial],
        )
    except ia_service.IANoConfigurada as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
    except ia_service.IAError as exc:
        # La llamada falló → no se cobra (no se registra consumo).
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    # --- Registro del consumo real DESPUÉS (atómico, misma tx) ---
    if sus is not None:
        inicio, fin = L.periodo_vigente(sus)
        uso = resultado.get("uso") or {}
        contado = await L.registrar_uso_ia(
            db, empresa_id=empresa.id, usuario_id=current_user.id, feature="asistente_chat",
            modelo=uso.get("modelo"), tokens_in=uso.get("tokens_in", 0), tokens_out=uso.get("tokens_out", 0),
            idempotency_key=idem, periodo_inicio=inicio, periodo_fin=fin,
        )
        if not contado:
            # Carrera: otro request con la misma clave ya lo registró.
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=L.ReintentoDuplicado(idem).cuerpo())

    return resultado


def r_cuerpo(r: "L.ResultadoLimite") -> dict:
    return {
        "error": "limite_excedido", "dimension": f"ia_{r.dimension}", "limite": r.limite,
        "usado": r.usado, "reset_en": r.reset_en.isoformat() if r.reset_en else None,
        "sugerencia": "Renová tu plan o esperá al próximo período",
    }
