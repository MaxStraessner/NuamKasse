from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = Field(default="Nuam Kasse", alias="APP_NAME")
    app_version: str = Field(default="0.6.0", alias="APP_VERSION")
    app_env: str = Field(default="development", alias="APP_ENV")
    debug: bool = Field(default=False, alias="DEBUG")
    enable_api_docs: bool = Field(default=True, alias="ENABLE_API_DOCS")
    database_url: str = Field(default="", alias="DATABASE_URL")
    backend_cors_origins: str = Field(
        default="http://localhost:5173,http://localhost:8080",
        alias="BACKEND_CORS_ORIGINS",
    )
    session_cookie_name: str = Field(
        default="nuam_kasse_session",
        alias="SESSION_COOKIE_NAME",
    )
    session_ttl_hours: int = Field(default=168, alias="SESSION_TTL_HOURS")
    session_cookie_secure: bool = Field(default=False, alias="SESSION_COOKIE_SECURE")
    session_cookie_samesite: str = Field(default="lax", alias="SESSION_COOKIE_SAMESITE")
    category_image_storage_path: str = Field(default="/app/uploads/category-images", alias="CATEGORY_IMAGE_STORAGE_PATH")
    category_image_max_bytes: int = Field(default=5 * 1024 * 1024, alias="CATEGORY_IMAGE_MAX_BYTES")
    category_image_preview_max_px: int = Field(default=1024, alias="CATEGORY_IMAGE_PREVIEW_MAX_PX")
    category_image_max_pixels: int = Field(default=48_000_000, alias="CATEGORY_IMAGE_MAX_PIXELS")

    @field_validator("debug", mode="before")
    @classmethod
    def parse_debug(cls, value: object) -> bool:
        if isinstance(value, str):
            normalized = value.lower()
            if normalized in {"1", "true", "yes", "on"}:
                return True
            if normalized in {"0", "false", "no", "off"}:
                return False
            return False
        return bool(value)

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    @property
    def cors_origins(self) -> list[str]:
        return [
            origin.strip()
            for origin in self.backend_cors_origins.split(",")
            if origin.strip()
        ]

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() == "production"

    @property
    def docs_enabled(self) -> bool:
        return self.enable_api_docs


@lru_cache
def get_settings() -> Settings:
    return Settings()
