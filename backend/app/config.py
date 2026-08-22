from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Conexión de la APP en runtime. Debe usar un rol SIN privilegios
    # (NOSUPERUSER, NOBYPASSRLS) para que la Row-Level Security aísle por
    # empresa. Ver infra/db/README.md.
    DATABASE_URL: str = "postgresql+asyncpg://nebula_app@localhost/minisapdb"
    # Conexión que usan las MIGRACIONES (Alembic). Debe ser el dueño de las
    # tablas: crea/altera esquema y no está sujeto a RLS. Si no se define, se
    # usa DATABASE_URL (cómodo en dev local con un solo rol).
    MIGRATION_DATABASE_URL: str | None = None
    SECRET_KEY: str = "minisap-secret-key-cambiar-en-produccion"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60
    # Interruptor de la bitácora de auditoría (AuditMiddleware).
    AUDIT_ENABLED: bool = True
    # Política de contraseñas.
    PASSWORD_MIN_LENGTH: int = 8
    # Onboarding público de nuevas empresas. FALSE = registro cerrado (estado
    # por defecto mientras el sistema está en preparación). Para reabrirlo:
    # REGISTRATION_ENABLED=true en el .env + reiniciar backend.
    REGISTRATION_ENABLED: bool = False
    # Rate-limiting de autenticación (anti fuerza bruta).
    RATE_LIMIT_ENABLED: bool = True
    LOGIN_MAX_ATTEMPTS: int = 10  # por (IP, usuario) dentro de la ventana
    LOGIN_WINDOW_SECONDS: int = 300

    # --- Registro por teléfono/WhatsApp (onboarding sin contraseña) ---
    # FALSE = modo desarrollo: el código NO se envía por WhatsApp, se loguea en
    # consola y se devuelve en la respuesta (dev_code) para probar sin proveedor.
    # TRUE = envío real (requiere credenciales del proveedor abajo).
    WHATSAPP_ENABLED: bool = False
    # Proveedor de WhatsApp: "twilio" | "meta" (Cloud API). Solo si WHATSAPP_ENABLED.
    WHATSAPP_PROVIDER: str = "twilio"
    WHATSAPP_ACCOUNT_SID: str | None = None      # Twilio
    WHATSAPP_AUTH_TOKEN: str | None = None       # Twilio
    WHATSAPP_FROM: str | None = None             # remitente (whatsapp:+... o phone_number_id de Meta)
    WHATSAPP_META_TOKEN: str | None = None       # Meta Cloud API access token
    # Vigencia del código OTP y tope de intentos por código.
    OTP_TTL_SECONDS: int = 600      # 10 minutos
    OTP_MAX_ATTEMPTS: int = 5
    OTP_MAX_PER_HOUR: int = 3       # códigos solicitados por número por hora
    # Registro por Google (id_token). Vacío = deshabilitado (botón "Próximamente").
    GOOGLE_CLIENT_ID: str | None = None
    # Orígenes CORS separados por coma
    CORS_ORIGINS: str = "http://localhost:5173"
    # --- Asistente IA (proveedor configurable) ---
    # Proveedor: groq | gemini | openrouter | ollama | openai | anthropic.
    # Groq es gratis y rápido para pruebas; se migra a Claude (anthropic) sólo
    # cambiando IA_PROVIDER + la API key, sin tocar código.
    IA_ENABLED: bool = True
    IA_PROVIDER: str = "groq"
    IA_MODEL: str = ""            # vacío → usa el modelo por defecto del proveedor
    IA_BASE_URL: str | None = None  # override manual del endpoint (ej. Ollama remoto)
    IA_MAX_TOKENS: int = 1024
    IA_MAX_ITERS: int = 6        # tope de rondas del loop de tools (anti bucle)
    # Umbral (fracción) para el estado "cerca del límite" si el plan no lo define.
    LIMITE_UMBRAL_ALERTA: float = 0.8
    # Días de la prueba gratis al dar de alta una empresa.
    TRIAL_DIAS: int = 15
    # API keys por proveedor (sólo se necesita la del proveedor activo).
    GROQ_API_KEY: str | None = None
    GEMINI_API_KEY: str | None = None
    OPENROUTER_API_KEY: str | None = None
    OPENAI_API_KEY: str | None = None
    ANTHROPIC_API_KEY: str | None = None

    # Precios de IA por modelo en USD por 1M de tokens (entrada, salida). Se usa
    # para estimar el costo de cada llamada. Clave = nombre del modelo (o prefijo).
    # Ajustable sin tocar código. Modelos gratis (Groq/Ollama) → costo 0.
    IA_PRECIOS_USD_POR_1M: dict[str, tuple[float, float]] = {
        "claude-opus-4-8": (15.0, 75.0),
        "claude-sonnet-4-6": (3.0, 15.0),
        "claude-haiku-4-5": (0.80, 4.0),
        "gpt-4o-mini": (0.15, 0.60),
        "gpt-4o": (2.50, 10.0),
    }

    # --- Plataforma (frontera BYPASSRLS separada) ---
    # Rol Postgres CON BYPASSRLS para los cruces cross-tenant del panel. Vive en
    # su propio engine/pool (app/platform/db.py), inalcanzable desde deps de
    # tenant. Si no se define, cae a MIGRATION_DATABASE_URL/DATABASE_URL (dev).
    PLATFORM_DATABASE_URL: str | None = None
    # Contraseña inicial del admin de plataforma (seed). CAMBIAR en prod vía .env.
    PLATFORM_ADMIN_PASSWORD: str = "cambiar-esta-clave-2026"

    # --- Bot de Telegram (canal de chat para el asistente) ---
    TELEGRAM_ENABLED: bool = True
    TELEGRAM_BOT_TOKEN: str | None = None
    # Empresa a la que responde el bot en pruebas (multi-tenant real = vinculación por chat, follow-up).
    TELEGRAM_EMPRESA_ID: int = 1

    model_config = {"env_file": ".env", "extra": "ignore"}

    @property
    def migration_url(self) -> str:
        """URL para Alembic: la del dueño si está definida, si no la de la app."""
        return self.MIGRATION_DATABASE_URL or self.DATABASE_URL

    @property
    def platform_url(self) -> str:
        """URL del engine de plataforma (rol BYPASSRLS). En dev cae al de migración."""
        return self.PLATFORM_DATABASE_URL or self.migration_url

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


settings = Settings()
