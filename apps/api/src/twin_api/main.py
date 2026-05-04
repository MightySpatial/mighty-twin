"""MightyTwin API — FastAPI + PostgreSQL/PostGIS.

Boots a session-bound engine in the lifespan, exposes a typed dependency
for request-scoped DB sessions, and mounts the route catalog. Real
implementations land phase by phase; routes not yet built come from
``dev_stubs`` so the web app stays bootable in dev.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from mighty_db import get_engine, get_session_factory
from mighty_models import Site

from .auth import router as auth_router
from .config import get_settings
from .db import DbSession
from .dev_stubs import router as dev_stubs_router
from .settings_routes import settings_router, system_router


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


def _serialize_site(site: Site) -> dict[str, object]:
    return {
        "id": str(site.id),
        "slug": site.slug,
        "name": site.name,
        "description": site.description,
        "storage_srid": site.storage_srid,
        **(site.config or {}),
    }


@app.get("/api/spatial/sites")
def list_sites(db: DbSession) -> list[dict[str, object]]:
    """Return all sites the caller can see as a bare array (frontend's
    ``useApiData('/api/spatial/sites', [])`` expects an array, not an
    envelope). Auth gating lands in Phase D.
    """
    sites = db.execute(select(Site).order_by(Site.name)).scalars().all()
    return [_serialize_site(s) for s in sites]


@app.get("/api/spatial/sites/{slug}")
def get_site(slug: str, db: DbSession) -> dict[str, object]:
    """Return a single site. Used by the viewer + admin detail page.
    Includes ``layers: []`` for forward-compat with the SiteData shape;
    real layer joins land in Phase D.
    """
    site = db.execute(select(Site).where(Site.slug == slug)).scalar_one_or_none()
    if site is None:
        raise HTTPException(status_code=404, detail=f"Site {slug!r} not found")
    payload = _serialize_site(site)
    payload["layers"] = []
    return payload


# Real implementations.
app.include_router(auth_router)
app.include_router(settings_router)
app.include_router(system_router)


# Remaining stubs (setup wizard) until Phase E lands.
if settings.dev_stubs_enabled:
    app.include_router(dev_stubs_router)
