"""Dev-only stub endpoints — placeholders so the web app boots locally
before each phase's real implementation ships.

Mounted from main.py only when ``settings.dev_stubs_enabled`` is true
(default: true; set ``DEV_STUBS_ENABLED=false`` in prod). Each stub gets
deleted as its phase lands. As of Phase B, /api/auth/* is real and lives
in auth.py; what remains here is settings + system + setup, all owned
by Phase C and Phase E.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter

router = APIRouter(tags=["dev-stubs"])


# Phase C will replace these.
@router.get("/api/settings/public")
def stub_public_settings() -> dict[str, Any]:
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
    # Cesium Ion token can come from VITE_CESIUM_ION_TOKEN at build time
    # or this endpoint at runtime. Empty here = frontend falls back to
    # the build-time value.
    return {"cesium_ion_token": None}


# Phase E will replace these.
@router.get("/api/setup/status")
def stub_setup_status() -> dict[str, bool]:
    return {"is_complete": True}


@router.get("/api/setup/license/status")
def stub_license_status() -> dict[str, Any]:
    return {"valid": True, "expires_at": None}
