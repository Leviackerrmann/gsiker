from datetime import datetime, timedelta, timezone

import bcrypt
import pyotp
from fastapi import HTTPException, status
from jose import JWTError, jwt

from app.config import settings

# Ventana de validez de un token intermedio de 2FA (entre paso 1 y paso 2 del login).
TWOFA_TOKEN_MINUTES = 5


def validate_password_strength(password: str) -> None:
    """Valida la fuerza mínima de una contraseña. Lanza HTTP 400 si no cumple.

    Política base: longitud mínima configurable, con al menos una letra y un
    número. Se aplica al crear/cambiar contraseñas.
    """
    faltantes = []
    if len(password) < settings.PASSWORD_MIN_LENGTH:
        faltantes.append(f"al menos {settings.PASSWORD_MIN_LENGTH} caracteres")
    if not any(c.isalpha() for c in password):
        faltantes.append("una letra")
    if not any(c.isdigit() for c in password):
        faltantes.append("un número")
    if faltantes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La contraseña debe tener " + ", ".join(faltantes) + ".",
        )


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(data: dict, scope: str = "tenant") -> str:
    """Token de acceso. `scope` distingue la frontera: "tenant" (usuarios de
    empresa) vs "platform" (superadmin del SaaS). Un token de un scope NO es
    válido en endpoints del otro (ver dependencies)."""
    to_encode = data.copy()
    if "sub" in to_encode:
        to_encode["sub"] = str(to_encode["sub"])
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    # typ="access" distingue el token de acceso del token intermedio de 2FA,
    # para que un token de 2FA (typ="2fa") no pueda usarse como credencial.
    to_encode.update({"exp": expire, "typ": "access", "scope": scope})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        return None
    # Un token intermedio de 2FA no es una credencial válida de acceso.
    if payload.get("typ") == "2fa":
        return None
    return payload


# --- 2FA (TOTP) ---

def create_twofa_token(user_id: int) -> str:
    """Token efímero que acredita el paso 1 del login (contraseña OK) y habilita
    el paso 2 (verificar el código TOTP). No sirve como token de acceso."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=TWOFA_TOKEN_MINUTES)
    payload = {"sub": str(user_id), "typ": "2fa", "exp": expire}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_twofa_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        return None
    if payload.get("typ") != "2fa":
        return None
    return payload


def generate_totp_secret() -> str:
    return pyotp.random_base32()


def totp_provisioning_uri(secret: str, username: str, issuer: str = "Nébula") -> str:
    """URI otpauth:// para que el usuario la escanee con su app autenticadora."""
    return pyotp.TOTP(secret).provisioning_uri(name=username, issuer_name=issuer)


def verify_totp(secret: str | None, code: str | None) -> bool:
    if not secret or not code:
        return False
    # valid_window=1 tolera un desfase de ±30s en el reloj del dispositivo.
    return pyotp.TOTP(secret).verify(code.strip(), valid_window=1)
