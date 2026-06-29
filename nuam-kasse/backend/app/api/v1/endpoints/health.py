from fastapi import APIRouter, Depends

from app.core.config import Settings, get_settings
from app.schemas.health import HealthResponse
from app.services.health import check_database

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def read_health(settings: Settings = Depends(get_settings)) -> HealthResponse:
    database_status = check_database(settings.database_url)
    app_status = "ok" if database_status == "connected" else "degraded"

    return HealthResponse(
        status=app_status,
        database=database_status,
        app=settings.app_name,
        version=settings.app_version,
    )
