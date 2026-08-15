from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_empresa, get_current_user
from app.models.empresa import Empresa
from app.models.usuario import Usuario
from app.schemas.ia import ChatRequest, ChatResponse
from app.services import ia as ia_service

router = APIRouter(prefix="/api/ia", tags=["ia"])


@router.get("/estado")
async def estado_ia(_current_user: Usuario = Depends(get_current_user)):
    """Indica si el asistente IA está disponible (configurado) y con qué proveedor."""
    return ia_service.estado()


@router.post("/chat", response_model=ChatResponse)
async def chat(
    body: ChatRequest,
    db: AsyncSession = Depends(get_db),
    empresa: Empresa = Depends(get_current_empresa),
    _current_user: Usuario = Depends(get_current_user),
):
    if not settings.IA_ENABLED:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="El asistente IA está deshabilitado")
    try:
        resultado = await ia_service.chat(
            db,
            empresa.id,
            empresa.nombre,
            body.mensaje,
            historial=[m.model_dump() for m in body.historial],
        )
        return resultado
    except ia_service.IANoConfigurada as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
    except ia_service.IAError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
