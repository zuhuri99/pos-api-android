from fastapi.testclient import TestClient

from app import main
from app.core.config import Settings


def test_spa_is_served_without_masking_unknown_api(tmp_path):
    (tmp_path / "index.html").write_text("<html><title>POS Admin</title></html>", encoding="utf-8")
    main.FRONTEND_DIR = tmp_path.resolve()

    with TestClient(main.app) as client:
        root = client.get("/")
        deep_link = client.get("/admin/products")
        missing_api = client.get("/api/v1/tidak-ada")

    assert root.status_code == 200
    assert "POS Admin" in root.text
    assert deep_link.status_code == 200
    assert "POS Admin" in deep_link.text
    assert missing_api.status_code == 404
    assert missing_api.headers["content-type"].startswith("application/json")


def test_web_frontend_can_be_disabled(monkeypatch, tmp_path):
    (tmp_path / "index.html").write_text("<html>POS</html>", encoding="utf-8")
    monkeypatch.setattr(main, "FRONTEND_DIR", tmp_path.resolve())
    monkeypatch.setattr(main.settings, "web_frontend_enabled", False)

    with TestClient(main.app) as client:
        assert client.get("/").status_code == 404
        assert client.get("/pos").status_code == 404
        assert client.get("/health").status_code == 200


def test_api_documentation_is_disabled_in_production():
    urls = main.documentation_urls(Settings(app_env="production"))
    assert urls == {"docs_url": None, "redoc_url": None, "openapi_url": None}
