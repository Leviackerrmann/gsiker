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
    # Rate-limiting de autenticación (anti fuerza bruta).
    RATE_LIMIT_ENABLED: bool = True
    LOGIN_MAX_ATTEMPTS: int = 10  # por (IP, usuario) dentro de la ventana
    LOGIN_WINDOW_SECONDS: int = 300
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
    # API keys por proveedor (sólo se necesita la del proveedor activo).
    GROQ_API_KEY: str | None = None
    GEMINI_API_KEY: str | None = None
    OPENROUTER_API_KEY: str | None = None
    OPENAI_API_KEY: str | None = None
    ANTHROPIC_API_KEY: str | None = None

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
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


settings = Settings()
