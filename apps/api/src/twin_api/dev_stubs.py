"""Dev-only stub endpoints — placeholders so the web app boots locally
before Phase B (real auth) and Phase C (real settings) ship.

Mounted from main.py only when ``settings.dev_stubs_enabled`` is true,
which defaults to True for now and flips off once the real implementations
land. **Never enable in production.**

Stubs accept any credentials, return a single hardcoded "Dev User" with
admin role, and respond with `{}` for endpoints that just need to return
*something* so the UI doesn't error out. Anything we miss should produce
a clean 404 the dev console will surface — that's a feature, not a bug.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["dev-stubs"])

DEV_TOKEN = "dev-stub-token"
DEV_USER: dict[str, Any] = {
    "id": "dev-user",
    "email": "dev@mightyspatial.local",
    "name": "Dev User",
    "role": "admin",
    "avatar": None,
}


class LoginBody(BaseModel):
    email: str
    password: str


class RefreshBody(BaseModel):
    refresh_token: str


@router.post("/api/auth/login")
def stub_login(body: LoginBody) -> dict[str, str]:
    # Accept any creds — Phase B replaces with password verification.
    return {"access_token": DEV_TOKEN, "refresh_token": DEV_TOKEN}


@router.post("/api/auth/refresh")
def stub_refresh(body: RefreshBody) -> dict[str, str]:
    return {"access_token": DEV_TOKEN, "refresh_token": DEV_TOKEN}


@router.get("/api/auth/me")
def stub_me() -> dict[str, Any]:
    return DEV_USER


@router.get("/api/auth/users")
def stub_users() -> list[dict[str, Any]]:
    return [DEV_USER]


@router.get("/api/settings/public")
def stub_public_settings() -> dict[str, Any]:
    # Login splash + overview camera defaults. Phase C replaces this with
    # the real DB-backed implementation.
    return {
        "login_splash_title": "MightyTwin",
        "login_splash_subtitle": "Spatial digital twin",
        "overview_camera": None,
    }


@router.get("/api/settings")
def stub_settings() -> dict[str, Any]:
    return {
        "login_splash_title": "MightyTwin",
        "login_splash_subtitle": "Spatial digital twin",
        "overview_mode": "all_sites_map",
        "overview_camera": None,
    }


@router.get("/api/system/config")
def stub_system_config() -> dict[str, Any]:
    # The Cesium Ion token can be supplied via VITE_CESIUM_ION_TOKEN at
    # build time or via this endpoint at runtime. Return empty here so the
    # frontend falls back to the build-time value.
    return {"cesium_ion_token": None}


@router.get("/api/setup/status")
def stub_setup_status() -> dict[str, bool]:
    return {"is_complete": True}


@router.get("/api/setup/license/status")
def stub_license_status() -> dict[str, Any]:
    return {"valid": True, "expires_at": None}
