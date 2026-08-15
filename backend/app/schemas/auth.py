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
