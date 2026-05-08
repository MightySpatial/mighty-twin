"""Story map + setup wizard routes (Phase E).

  /api/story-maps?site_slug=...        — list per site
  /api/story-maps/{id}                  — get / patch / delete
  /api/story-maps                       — create (admin)

  /api/setup/status                     — replaces dev stub
  /api/setup/admin                      — first-run admin creation
                                          (no-op if any user exists)
  /api/setup/branding                   — name/logo (writes app_settings)
  /api/setup/complete                   — flips a settings flag
  /api/setup/license/status             — replaces dev stub (always valid
                                          until mighty_licensing lands)
"""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from mighty_models import Setting, Site, StoryMap, User

from .auth import AdminUser, CurrentUser, hash_password
from .db import DbSession

# ── StoryMaps ───────────────────────────────────────────────────────────


story_router = APIRouter(prefix="/api/story-maps", tags=["story-maps"])


def _serialize_story(s: StoryMap) -> dict[str, Any]:
    return {
        "id": str(s.id),
        "site_id": str(s.site_id),
        "name": s.name,
        "description": s.description,
        "is_published": s.is_published,
        "slides": s.slides or [],
    }


class StoryMapCreate(BaseModel):
    site_slug: str
    name: str
    description: str | None = None
    is_published: bool = False
    slides: list[dict[str, Any]] = Field(default_factory=list)


class StoryMapUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    is_published: bool | None = None
    slides: list[dict[str, Any]] | None = None


@story_router.get("")
def list_story_maps(
    _: CurrentUser, db: DbSession, site_slug: str | None = None
) -> list[dict[str, Any]]:
    stmt = select(StoryMap)
    if site_slug:
        site = db.execute(select(Site).where(Site.slug == site_slug)).scalar_one_or_none()
        if site is None:
            return []
        stmt = stmt.where(StoryMap.site_id == site.id)
    rows = db.execute(stmt.order_by(StoryMap.name)).scalars().all()
    return [_serialize_story(r) for r in rows]


@story_router.post("", status_code=201)
def create_story_map(
    body: StoryMapCreate, _: AdminUser, db: DbSession
) -> dict[str, Any]:
    site = db.execute(select(Site).where(Site.slug == body.site_slug)).scalar_one_or_none()
    if site is None:
        raise HTTPException(status_code=404, detail=f"Site {body.site_slug!r} not found")
    sm = StoryMap(
        site_id=site.id,
        name=body.name,
        description=body.description,
        is_published=body.is_published,
        slides=body.slides,
    )
    db.add(sm)
    db.commit()
    db.refresh(sm)
    return _serialize_story(sm)


@story_router.patch("/{story_map_id}")
def update_story_map(
    story_map_id: str, body: StoryMapUpdate, _: AdminUser, db: DbSession
) -> dict[str, Any]:
    sm = db.execute(
        select(StoryMap).where(StoryMap.id == uuid.UUID(story_map_id))
    ).scalar_one_or_none()
    if sm is None:
        raise HTTPException(status_code=404, detail="StoryMap not found")
    if body.name is not None: sm.name = body.name
    if body.description is not None: sm.description = body.description
    if body.is_published is not None: sm.is_published = body.is_published
    if body.slides is not None: sm.slides = body.slides
    db.commit()
    db.refresh(sm)
    return _serialize_story(sm)


@story_router.delete("/{story_map_id}", status_code=204)
def delete_story_map(story_map_id: str, _: AdminUser, db: DbSession) -> None:
    sm = db.execute(
        select(StoryMap).where(StoryMap.id == uuid.UUID(story_map_id))
    ).scalar_one_or_none()
    if sm is None:
        raise HTTPException(status_code=404, detail="StoryMap not found")
    db.delete(sm)
    db.commit()


# ── Setup wizard ────────────────────────────────────────────────────────


setup_router = APIRouter(prefix="/api/setup", tags=["setup"])


class AdminCreate(BaseModel):
    name: str
    email: str
    password: str = Field(min_length=8)


class BrandingBody(BaseModel):
    org_name: str | None = None
    logo_url: str | None = None


def _setup_complete(db) -> bool:
    """Setup is considered done once any user exists AND the explicit
    ``setup_complete`` flag is true. The migration seeds the dev admin so
    'a user exists' is true from t=0; the explicit flag flips when the
    user finishes the wizard. Either signal is enough — we OR them.
    """
    has_user = db.execute(select(func.count(User.id))).scalar() or 0
    flag = db.execute(
        select(Setting).where(Setting.key == "setup_complete")
    ).scalar_one_or_none()
    return bool(has_user) or bool(flag and flag.value)


@setup_router.get("/status")
def get_setup_status(db: DbSession) -> dict[str, bool]:
    return {"is_complete": _setup_complete(db)}


@setup_router.post("/admin", status_code=201)
def setup_admin(body: AdminCreate, db: DbSession) -> dict[str, Any]:
    """Create the first admin user. No-op (409) if any user already
    exists — the wizard runs once on bare DB only."""
    existing = db.execute(select(func.count(User.id))).scalar() or 0
    if existing > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Setup already complete — admin user(s) exist",
        )
    user = User(
        email=body.email.lower(),
        name=body.name,
        hashed_password=hash_password(body.password),
        role="admin",
        is_active=True,
    )
    db.add(user)
    db.commit()
    return {"id": str(user.id), "email": user.email, "name": user.name, "role": user.role}


@setup_router.post("/branding", status_code=204)
def setup_branding(body: BrandingBody, _: AdminUser, db: DbSession) -> None:
    if body.org_name is not None:
        _upsert_setting(db, "org_name", body.org_name, is_public=True)
    if body.logo_url is not None:
        _upsert_setting(db, "logo_url", body.logo_url, is_public=True)
    db.commit()


@setup_router.post("/complete", status_code=204)
def setup_complete(_: AdminUser, db: DbSession) -> None:
    _upsert_setting(db, "setup_complete", True, is_public=False)
    db.commit()


@setup_router.get("/license/status")
def license_status() -> dict[str, Any]:
    """Stub until mighty_licensing ships. Dev/local always returns valid;
    prod will integrate the real licence server here."""
    return {"valid": True, "expires_at": None}


def _upsert_setting(db, key: str, value: Any, is_public: bool) -> None:
    row = db.execute(select(Setting).where(Setting.key == key)).scalar_one_or_none()
    if row is None:
        db.add(Setting(key=key, value=value, is_public=is_public))
    else:
        row.value = value
        # Don't downgrade an existing public flag silently.
