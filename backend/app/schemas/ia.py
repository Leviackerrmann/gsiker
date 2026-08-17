from pydantic import BaseModel, Field


class MensajeChat(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    mensaje: str = Field(min_length=1, max_length=2000)
    # Historial de turnos previos (opcional) para dar continuidad a la charla.
    historial: list[MensajeChat] = Field(default_factory=list, max_length=20)
    # Clave de idempotencia POR ENVÍO (la genera el cliente en cada clic de enviar).
    # Dedupe: un reintento con la misma clave NO se cuenta y devuelve 409. El
    # cliente NUNCA reintenta automáticamente reusando la clave. Si falta, el
    # router genera una (no dedupe entre reintentos de red en ese caso).
    idempotency_key: str | None = Field(default=None, max_length=64)


class AccionIA(BaseModel):
    herramienta: str
    input: dict


class ChatResponse(BaseModel):
    respuesta: str
    acciones: list[AccionIA] = Field(default_factory=list)
