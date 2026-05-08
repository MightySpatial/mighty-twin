"""Dev-only stub endpoints — empty as of Phase E.

All previously-stubbed routes have been replaced with real implementations:
  - /api/auth/*           → auth.py (Phase B)
  - /api/settings*        → settings_routes.py (Phase C)
  - /api/system/config*   → settings_routes.py (Phase C)
  - /api/spatial/*        → spatial_routes.py (Phase D)
  - /api/story-maps/*     → story_routes.py (Phase E)
  - /api/setup/*          → story_routes.py (Phase E)

Kept as a router so future phases can drop temporary stubs here without
touching main.py wiring.
"""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(tags=["dev-stubs"])
