"""Twin API runtime config — environment-driven, validated at boot."""

from __future__ import annotations

import os
import sys
from functools import lru_cache

from pydantic import Field, field_validator
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
        description="SQLAlchemy URL. PostGIS in prod and local dev.",
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
            "Mount the dev-only stub router. Empty as of Phase E but kept "
            "as a slot for future temp stubs. MUST be False in prod."
        ),
    )

    #: Phase J — hard prod-mode flag. When ENVIRONMENT='production', the
    #: validators below refuse to boot with default secrets/dev stubs.
    environment: str = Field(default="development")

    @field_validator("jwt_secret")
    @classmethod
    def _reject_default_jwt_in_prod(cls, v: str) -> str:
        if os.environ.get("ENVIRONMENT", "development") == "production":
            if v in ("", "change-me-in-prod"):
                print(
                    "FATAL: ENVIRONMENT=production but JWT_SECRET is unset / default.",
                    file=sys.stderr,
                )
                raise ValueError("JWT_SECRET must be set in production")
        return v


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Cached accessor — pydantic re-reads env on every Settings() call;
    cache it once at boot so tests can monkeypatch via env_file overrides.
    """
    s = Settings()
    if s.environment == "production":
        if s.dev_stubs_enabled:
            print(
                "FATAL: ENVIRONMENT=production with DEV_STUBS_ENABLED=true.",
                file=sys.stderr,
            )
            raise ValueError("DEV_STUBS_ENABLED must be false in production")
    return s
