from pydantic import BaseModel, Field


class MensajeChat(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    mensaje: str = Field(min_length=1, max_length=2000)
    # Historial de turnos previos (opcional) para dar continuidad a la charla.
    historial: list[MensajeChat] = Field(default_factory=list, max_length=20)


class AccionIA(BaseModel):
    herramienta: str
    input: dict


class ChatResponse(BaseModel):
    respuesta: str
    acciones: list[AccionIA] = Field(default_factory=list)
