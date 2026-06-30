from app.api.v1.endpoints import health
from app.core.config import get_settings
from app.main import create_app


def test_health_check_returns_http_200(client):
    response = client.get("/api/v1/health")

    assert response.status_code == 200


def test_health_check_contains_app_name(client):
    response = client.get("/api/v1/health")

    assert response.json()["app"] == "Nuam Kasse"


def test_health_check_reports_database_status(client):
    response = client.get("/api/v1/health")

    assert response.json()["database"] == "connected"


def test_health_check_handles_database_failure(client, monkeypatch):
    monkeypatch.setattr(health, "check_database", lambda database_url: "unavailable")

    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json()["status"] == "degraded"
    assert response.json()["database"] == "unavailable"


def test_api_docs_are_disabled_in_production(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("ENABLE_API_DOCS", "false")
    get_settings.cache_clear()
    production_app = create_app()
    get_settings.cache_clear()

    assert production_app.openapi_url is None
    assert production_app.docs_url is None
    assert production_app.redoc_url is None


def test_api_docs_remain_available_outside_production(monkeypatch):
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("ENABLE_API_DOCS", "true")
    get_settings.cache_clear()
    development_app = create_app()
    get_settings.cache_clear()

    assert development_app.openapi_url == "/api/v1/openapi.json"
    assert development_app.docs_url == "/api/v1/docs"
    assert development_app.redoc_url == "/api/v1/redoc"


def test_api_docs_can_be_enabled_explicitly_in_production(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("ENABLE_API_DOCS", "true")
    get_settings.cache_clear()
    production_app = create_app()
    get_settings.cache_clear()

    assert production_app.openapi_url == "/api/v1/openapi.json"
    assert production_app.docs_url == "/api/v1/docs"
    assert production_app.redoc_url == "/api/v1/redoc"
