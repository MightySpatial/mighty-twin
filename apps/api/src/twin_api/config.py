"""Twin API runtime config — environment-driven, validated at boot."""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Read-only runtime settings. Populated from `apps/api/.env` and
    process env, with process env taking precedence.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    database_url: str = Field(
        default="postgresql+psycopg://mightytwin:mightytwin_dev@127.0.0.1:5432/mightytwin",
        description="SQLAlchemy URL. PostGIS in prod and local dev; SpatiaLite available for embedded targets.",
    )
    allowed_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:3000", "http://localhost:3002"],
        description="CORS allowlist for the web app origin(s).",
    )
    jwt_secret: str = Field(
        default="change-me-in-prod",
        description="HMAC secret for access/refresh JWTs. Must be set in prod.",
    )
    license_key: str = Field(
        default="",
        description="Mighty licence key. Stub-accepted in dev; enforced in prod.",
    )
    dev_stubs_enabled: bool = Field(
        default=True,
        description=(
            "Mount dev-only stub endpoints (auth, settings) so the web app boots "
            "before Phase B/C land. MUST be False in prod."
        ),
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Cached accessor — pydantic re-reads env on every Settings() call;
    cache it once at boot so tests can monkeypatch via env_file overrides.
    """
    return Settings()
