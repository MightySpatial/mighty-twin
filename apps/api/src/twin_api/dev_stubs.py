"""Dev-only stub endpoints — placeholders until each phase lands real
implementations.

Mounted from main.py only when ``settings.dev_stubs_enabled`` is true
(default: true; set ``DEV_STUBS_ENABLED=false`` in prod).

As of Phase C, /api/auth/* and /api/settings* and /api/system/config
are real (in auth.py and settings_routes.py). What remains here is the
Setup Wizard surface — Phase E owns its replacement.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter

router = APIRouter(tags=["dev-stubs"])


# Phase E will replace these.
@router.get("/api/setup/status")
def stub_setup_status() -> dict[str, bool]:
    return {"is_complete": True}


@router.get("/api/setup/license/status")
def stub_license_status() -> dict[str, Any]:
    return {"valid": True, "expires_at": None}
