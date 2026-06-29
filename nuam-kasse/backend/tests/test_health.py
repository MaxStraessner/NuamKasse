from app.api.v1.endpoints import health


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
