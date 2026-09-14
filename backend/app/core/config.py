from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", enable_decoding=False)

    app_env: str = "development"
    database_url: str = "postgresql+psycopg://pos:pos@localhost:5432/pos"
    app_secret: str = "development-only-change-this-secret"
    bootstrap_username: str = "admin"
    bootstrap_password: str = "change-me-now"
    token_ttl_days: int = 30
    cors_origins: list[str] = ["https://pos.local"]
    allowed_hosts: list[str] = ["localhost", "127.0.0.1", "testserver"]

    @field_validator("database_url", mode="before")
    @classmethod
    def normalize_database_url(cls, value):
        value = str(value)
        if value.startswith("postgres://"):
            return value.replace("postgres://", "postgresql+psycopg://", 1)
        if value.startswith("postgresql://"):
            return value.replace("postgresql://", "postgresql+psycopg://", 1)
        return value

    @field_validator("cors_origins", "allowed_hosts", mode="before")
    @classmethod
    def parse_origins(cls, value):
        if isinstance(value, str):
            return [part.strip() for part in value.split(",") if part.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
