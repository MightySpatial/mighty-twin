"""MightyTwin API — FastAPI + PostgreSQL/PostGIS.

Boots a session-bound engine in the lifespan, exposes a typed dependency
for request-scoped DB sessions, and mounts the route catalog. Real
implementations land phase by phase; routes not yet built come from
``dev_stubs`` so the web app stays bootable in dev.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from mighty_db import get_engine, get_session_factory
from mighty_models import User

from .auth import router as auth_router
from .bootstrap import ensure_admin_user
from .config import get_settings
from .dev_stubs import router as dev_stubs_router
from .settings_routes import settings_router, system_router
from .spatial_routes import router as spatial_router
from .story_routes import setup_router, story_router
from .upload_routes import router as upload_router
from .me_routes import router as me_router
from .embed_routes import router as embed_router
from .public_routes import router as public_router
from .analytics_routes import router as analytics_router
from .library_routes import router as library_router
from .engine_routes import router as engine_router
from .submission_routes import router as submission_router
from .feed_routes import router as feed_router
from .feature_routes import router as feature_router
from .oauth_routes import router as oauth_router
from .feature_import_routes import router as feature_import_router
from .demo_routes import router as demo_router
from .design_export_routes import router as design_export_router
from .design_import_routes import router as design_import_router
from .design_template_routes import router as design_template_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    # Migrations run in the Dockerfile CMD (`uv run alembic upgrade head &&
    # uv run uvicorn ...`) before this lifespan starts, so the schema is
    # already at head. Re-running here would block the asyncio event loop
    # on sync Alembic I/O during startup and starve the Railway healthcheck.
    engine = get_engine(settings.database_url, pool_pre_ping=True)
    session_factory = get_session_factory(engine)
    app.state.engine = engine
    app.state.session_factory = session_factory
    ensure_admin_user(session_factory)
    try:
        yield
    finally:
        engine.dispose()


app = FastAPI(
    title="MightyTwin API",
    version="0.1.0",
    description="Enterprise digital twin — Postgres/PostGIS backend.",
    lifespan=lifespan,
)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "app": "mighty-twin"}


# Real implementations.
app.include_router(auth_router)
app.include_router(settings_router)
app.include_router(system_router)
app.include_router(spatial_router)
app.include_router(story_router)
app.include_router(setup_router)
app.include_router(upload_router)
app.include_router(me_router)
app.include_router(embed_router)
app.include_router(public_router)
app.include_router(analytics_router)
app.include_router(library_router)
app.include_router(engine_router)
app.include_router(submission_router)
app.include_router(feed_router)
app.include_router(feature_router)
app.include_router(oauth_router)
app.include_router(feature_import_router)
app.include_router(demo_router)
app.include_router(design_export_router)
app.include_router(design_import_router)
app.include_router(design_template_router)


# All real now — dev_stubs router is empty (kept the import + include
# pattern so adding placeholders for future phases stays one-line).
if settings.dev_stubs_enabled:
    app.include_router(dev_stubs_router)


# Bundled viewer (built by the API Dockerfile's first stage and copied to
# /app/apps/web/dist). This file is at /app/apps/api/src/twin_api/main.py;
# parents[3] is /app/apps, so /apps/web/dist sits next to /apps/api.
#
# Vite is configured with base='/' so the bundle references its assets and
# the Cesium runtime as absolute paths (/assets/* and /cesium/*). We mount
# both at the host root and serve the SPA shell at /viewer.
_VIEWER_DIST = Path(__file__).resolve().parents[3] / "web" / "dist"
if _VIEWER_DIST.is_dir():
    _ASSETS_DIR = _VIEWER_DIST / "assets"
    if _ASSETS_DIR.is_dir():
        app.mount(
            "/assets",
            StaticFiles(directory=_ASSETS_DIR),
            name="viewer-assets",
        )

    # vite-plugin-cesium emits the Cesium runtime
    # (Workers/, Assets/, Widgets/, ThirdParty/) under dist/cesium/, and the
    # bundle requests it at /cesium/* with base='/'. Serving via StaticFiles
    # gives correct Content-Type for the worker scripts.
    _CESIUM_DIR = _VIEWER_DIST / "cesium"
    if _CESIUM_DIR.is_dir():
        app.mount(
            "/cesium",
            StaticFiles(directory=_CESIUM_DIR),
            name="viewer-cesium",
        )

    _INDEX_HTML = _VIEWER_DIST / "index.html"

    @app.get("/viewer", include_in_schema=False)
    @app.get("/viewer/", include_in_schema=False)
    @app.get("/viewer/{path:path}", include_in_schema=False)
    async def _viewer_shell() -> FileResponse:
        # All /viewer paths return the SPA shell; React Router handles
        # client-side routing from there. Static assets/cesium load from
        # /assets and /cesium at the host root, not from /viewer/*.
        return FileResponse(_INDEX_HTML)
