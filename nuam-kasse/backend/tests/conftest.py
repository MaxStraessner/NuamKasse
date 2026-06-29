import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings, get_settings
from app.main import app


@pytest.fixture
def client() -> TestClient:
    app.dependency_overrides.clear()
    app.dependency_overrides[get_settings] = lambda: Settings(
        app_name="Nuam Kasse",
        app_version="0.1.0",
        app_env="test",
        database_url="sqlite+pysqlite:///:memory:",
        backend_cors_origins="http://testserver",
    )

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()
