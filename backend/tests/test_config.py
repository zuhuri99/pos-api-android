from app.core.config import Settings


def test_coolify_postgres_url_uses_psycopg_driver():
    settings = Settings(
        database_url="postgresql://pos:secret@postgres.internal:5432/pos2",
        cors_origins="https://pos2.asas.id,https://pos.local",
        allowed_hosts="pos2.asas.id,localhost",
    )
    assert settings.database_url == "postgresql+psycopg://pos:secret@postgres.internal:5432/pos2"
    assert settings.cors_origins == ["https://pos2.asas.id", "https://pos.local"]
    assert settings.allowed_hosts == ["pos2.asas.id", "localhost"]


def test_production_mode_is_detected_case_insensitively():
    assert Settings(app_env=" Production ").is_production is True
    assert Settings(app_env="development").is_production is False
