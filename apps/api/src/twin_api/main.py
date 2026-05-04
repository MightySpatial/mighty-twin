"""MightyTwin API — FastAPI + PostgreSQL/PostGIS.

Boots a session-bound engine in the lifespan, exposes a typed dependency
for request-scoped DB sessions, and mounts the route catalog. Real
implementations land phase by phase; routes not yet built come from
``dev_stubs`` so the web app stays bootable in dev.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from mighty_db import get_engine, get_session_factory

from .auth import router as auth_router
from .config import get_settings
from .dev_stubs import router as dev_stubs_router
from .settings_routes import settings_router, system_router
from .spatial_routes import router as spatial_router
from .story_routes import setup_router, story_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    engine = get_engine(settings.database_url, pool_pre_ping=True)
    session_factory = get_session_factory(engine)
    app.state.engine = engine
    app.state.session_factory = session_factory
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


# All real now — dev_stubs router is empty (kept the import + include
# pattern so adding placeholders for future phases stays one-line).
if settings.dev_stubs_enabled:
    app.include_router(dev_stubs_router)
