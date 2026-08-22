from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LoginResponse(BaseModel):
    """Respuesta de /login. Si el usuario tiene 2FA, no trae token todavía:
    trae `twofa_required=True` y un `twofa_token` para completar en /login/2fa."""

    access_token: str | None = None
    token_type: str = "bearer"
    twofa_required: bool = False
    twofa_token: str | None = None


class TwoFALoginRequest(BaseModel):
    twofa_token: str
    code: str


class TwoFAVerifyRequest(BaseModel):
    code: str


class TwoFASetupResponse(BaseModel):
    secret: str
    otpauth_uri: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


# --- Registro por teléfono/WhatsApp o Google (onboarding nuevo) ---

class PhoneSendCodeRequest(BaseModel):
    # Código de país en formato "+502" y número local; se normaliza a E.164.
    country_code: str
    phone_number: str


class PhoneSendCodeResponse(BaseModel):
    # Número normalizado (E.164) que el frontend debe usar al verificar.
    phone_number: str
    # Cooldown sugerido para reenviar (segundos).
    resend_in: int = 60
    # Solo en desarrollo (WhatsApp deshabilitado): el código, para probar sin leer logs.
    dev_code: str | None = None


class PhoneVerifyRequest(BaseModel):
    phone_number: str  # E.164
    code: str


class GoogleAuthRequest(BaseModel):
    # id_token de Google Identity Services (obtenido en el frontend).
    token: str


class CrearNegocioRequest(BaseModel):
    nombre: str                       # nombre del negocio
    nombre_usuario: str | None = None  # nombre de la persona (dueño)
    categoria: str | None = None       # rubro/categoría del negocio


class SetPasswordRequest(BaseModel):
    """Agrega un usuario + contraseña (método de respaldo) a una cuenta que entró
    por teléfono/Google y no tenía credenciales."""
    username: str
    password: str
    email: str | None = None


class NegocioResponse(BaseModel):
    id: int
    nombre: str
    tipo_negocio: str | None = None    # guarda la categoría elegida

    model_config = {"from_attributes": True}
