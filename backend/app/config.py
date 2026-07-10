from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://comprasuser@localhost/minisapdb"
    SECRET_KEY: str = "minisap-secret-key-cambiar-en-produccion"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
