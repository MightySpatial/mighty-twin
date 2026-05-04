"""MightyTwin API — FastAPI + PostgreSQL/PostGIS.

Boots a session-bound engine in the lifespan, exposes a typed dependency
for request-scoped DB sessions, and serves the consolidated route catalog
(currently: sites). Auth/users/layers/uploads land in subsequent phases.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session

from mighty_db import get_engine, get_session_factory
from mighty_models import Site

from .config import Settings, get_settings
from .dev_stubs import router as dev_stubs_router


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


def get_db(request: Request) -> Iterator[Session]:
    session_factory = request.app.state.session_factory
    session: Session = session_factory()
    try:
        yield session
    finally:
        session.close()


DbSession = Annotated[Session, Depends(get_db)]


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
    `useApiData('/api/spatial/sites', [])` expects an array, not an
    envelope). Auth gating lands in Phase B.
    """
    sites = db.execute(select(Site).order_by(Site.name)).scalars().all()
    return [_serialize_site(s) for s in sites]


@app.get("/api/spatial/sites/{slug}")
def get_site(slug: str, db: DbSession) -> dict[str, object]:
    """Return a single site. Used by the viewer + admin detail page.
    Includes `layers: []` for forward-compat with the SiteData shape;
    real layer joins land in Phase D.
    """
    from fastapi import HTTPException

    site = db.execute(select(Site).where(Site.slug == slug)).scalar_one_or_none()
    if site is None:
        raise HTTPException(status_code=404, detail=f"Site {slug!r} not found")
    payload = _serialize_site(site)
    payload["layers"] = []
    return payload


if settings.dev_stubs_enabled:
    app.include_router(dev_stubs_router)
