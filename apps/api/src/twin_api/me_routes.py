"""Per-user routes — snapshots, sketch layers, and the JSON storage
pattern ported from MightyDT (`/api/me/json/*` for big blobs).

Storage: file-system in dev (TWIN_USER_JSON_DIR, default /tmp/twin-me-json),
S3-compatible in prod (Phase J wires that). Per-user prefix
``users/{user_id}/json/<name>.json``, soft 25 MB quota — same shape DT
uses so we can re-point at MinIO without API changes.
"""

from __future__ import annotations

import json
import os
import re
import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from mighty_models import SketchLayer, Site, Snapshot

from .auth import CurrentUser
from .db import DbSession

router = APIRouter(prefix="/api/me", tags=["me"])

USER_JSON_DIR = Path(os.environ.get("TWIN_USER_JSON_DIR", "/tmp/twin-me-json"))
USER_JSON_DIR.mkdir(parents=True, exist_ok=True)
USER_JSON_QUOTA_BYTES = 25 * 1024 * 1024
SAFE_JSON_NAME = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._-]{0,118}\.json$")


# ── Snapshots ──────────────────────────────────────────────────────────


def _serialize_snapshot(s: Snapshot) -> dict[str, Any]:
    return {
        "id": str(s.id),
        "user_id": str(s.user_id),
        "site_id": str(s.site_id) if s.site_id else None,
        "name": s.name,
        "description": s.description,
        "payload": s.payload or {},
        "shared_to_gallery": s.shared_to_gallery,
    }


class SnapshotCreate(BaseModel):
    name: str
    description: str | None = None
    site_slug: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    shared_to_gallery: bool = False


class SnapshotUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    payload: dict[str, Any] | None = None
    shared_to_gallery: bool | None = None


@router.get("/snapshots")
def list_snapshots(
    user: CurrentUser, db: DbSession, site_slug: str | None = None
) -> list[dict[str, Any]]:
    stmt = select(Snapshot).where(Snapshot.user_id == user.id)
    if site_slug:
        site = db.execute(select(Site).where(Site.slug == site_slug)).scalar_one_or_none()
        if site is None:
            return []
        stmt = stmt.where(Snapshot.site_id == site.id)
    rows = db.execute(stmt.order_by(Snapshot.created_at.desc())).scalars().all()
    return [_serialize_snapshot(s) for s in rows]


@router.post("/snapshots", status_code=201)
def create_snapshot(
    body: SnapshotCreate, user: CurrentUser, db: DbSession
) -> dict[str, Any]:
    site_id = None
    if body.site_slug:
        site = db.execute(select(Site).where(Site.slug == body.site_slug)).scalar_one_or_none()
        if site is None:
            raise HTTPException(404, detail=f"Site {body.site_slug!r} not found")
        site_id = site.id
    snap = Snapshot(
        user_id=user.id,
        site_id=site_id,
        name=body.name,
        description=body.description,
        payload=body.payload,
        shared_to_gallery=body.shared_to_gallery,
    )
    db.add(snap)
    db.commit()
    db.refresh(snap)
    return _serialize_snapshot(snap)


@router.patch("/snapshots/{snap_id}")
def update_snapshot(
    snap_id: str, body: SnapshotUpdate, user: CurrentUser, db: DbSession
) -> dict[str, Any]:
    snap = db.execute(
        select(Snapshot).where(
            Snapshot.id == uuid.UUID(snap_id), Snapshot.user_id == user.id
        )
    ).scalar_one_or_none()
    if snap is None:
        raise HTTPException(404, detail="Snapshot not found")
    if body.name is not None: snap.name = body.name
    if body.description is not None: snap.description = body.description
    if body.payload is not None: snap.payload = body.payload
    if body.shared_to_gallery is not None: snap.shared_to_gallery = body.shared_to_gallery
    db.commit()
    db.refresh(snap)
    return _serialize_snapshot(snap)


@router.delete("/snapshots/{snap_id}", status_code=204)
def delete_snapshot(snap_id: str, user: CurrentUser, db: DbSession) -> None:
    snap = db.execute(
        select(Snapshot).where(
            Snapshot.id == uuid.UUID(snap_id), Snapshot.user_id == user.id
        )
    ).scalar_one_or_none()
    if snap is None:
        raise HTTPException(404, detail="Snapshot not found")
    db.delete(snap)
    db.commit()


# ── Sketch layers ───────────────────────────────────────────────────────


def _serialize_sketch(s: SketchLayer) -> dict[str, Any]:
    return {
        "id": str(s.id),
        "user_id": str(s.user_id),
        "site_id": str(s.site_id) if s.site_id else None,
        "name": s.name,
        "color": s.color,
        "visible": s.visible,
        "locked": s.locked,
        "features": s.features or [],
    }


class SketchLayerUpsert(BaseModel):
    name: str
    color: str | None = None
    visible: bool = True
    locked: bool = False
    features: list[dict[str, Any]] = Field(default_factory=list)
    site_slug: str | None = None


@router.get("/sketch-layers")
def list_sketch_layers(
    user: CurrentUser, db: DbSession, site_slug: str | None = None
) -> list[dict[str, Any]]:
    stmt = select(SketchLayer).where(SketchLayer.user_id == user.id)
    if site_slug:
        site = db.execute(select(Site).where(Site.slug == site_slug)).scalar_one_or_none()
        if site is None:
            return []
        stmt = stmt.where(SketchLayer.site_id == site.id)
    rows = db.execute(stmt.order_by(SketchLayer.created_at)).scalars().all()
    return [_serialize_sketch(s) for s in rows]


class SketchLayerPut(BaseModel):
    """PUT body — same shape as POST but we allow the client to pass
    an explicit id so the frontend's local UUIDs become the row ids
    (round-trip stability for the design widget's persistence loop)."""

    id: str | None = None
    name: str
    color: str | None = None
    visible: bool = True
    locked: bool = False
    features: list[dict[str, Any]] = Field(default_factory=list)
    site_slug: str | None = None


@router.put("/sketch-layers")
def upsert_sketch_layers_bulk(
    body: list[SketchLayerPut], user: CurrentUser, db: DbSession
) -> list[dict[str, Any]]:
    """Bulk upsert — replaces the user's sketch-layer set for the
    bound site with the provided list. Layers in the DB but not in the
    body are deleted (so client-side deletes propagate).

    Every item in ``body`` must share the same site_slug; we resolve
    it once and use the ID as the scope for the diff.
    """
    if not body:
        return []
    site_slug = body[0].site_slug
    if any((it.site_slug or None) != site_slug for it in body):
        raise HTTPException(
            status_code=400,
            detail="All sketch layers in a bulk upsert must share the same site_slug",
        )
    site_id: uuid.UUID | None = None
    if site_slug:
        site = db.execute(select(Site).where(Site.slug == site_slug)).scalar_one_or_none()
        if site is None:
            raise HTTPException(status_code=404, detail=f"Site {site_slug!r} not found")
        site_id = site.id

    # Existing rows scoped to (user, site).
    stmt = select(SketchLayer).where(SketchLayer.user_id == user.id)
    if site_id is None:
        stmt = stmt.where(SketchLayer.site_id.is_(None))
    else:
        stmt = stmt.where(SketchLayer.site_id == site_id)
    existing = {s.id: s for s in db.execute(stmt).scalars().all()}

    out: list[dict[str, Any]] = []
    seen: set[uuid.UUID] = set()
    for item in body:
        target_id = uuid.UUID(item.id) if item.id else uuid.uuid4()
        seen.add(target_id)
        row = existing.get(target_id)
        if row is None:
            row = SketchLayer(
                id=target_id,
                user_id=user.id,
                site_id=site_id,
                name=item.name,
                color=item.color,
                visible=item.visible,
                locked=item.locked,
                features=item.features,
            )
            db.add(row)
        else:
            row.name = item.name
            row.color = item.color
            row.visible = item.visible
            row.locked = item.locked
            row.features = item.features
        out.append(_serialize_sketch(row))
    # Delete rows the client didn't include.
    for stale_id, stale_row in existing.items():
        if stale_id not in seen:
            db.delete(stale_row)
    db.commit()
    return out


@router.post("/sketch-layers", status_code=201)
def create_sketch_layer(
    body: SketchLayerUpsert, user: CurrentUser, db: DbSession
) -> dict[str, Any]:
    site_id = None
    if body.site_slug:
        site = db.execute(select(Site).where(Site.slug == body.site_slug)).scalar_one_or_none()
        if site:
            site_id = site.id
    s = SketchLayer(
        user_id=user.id,
        site_id=site_id,
        name=body.name,
        color=body.color,
        visible=body.visible,
        locked=body.locked,
        features=body.features,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return _serialize_sketch(s)


@router.put("/sketch-layers/{layer_id}")
def update_sketch_layer(
    layer_id: str, body: SketchLayerUpsert, user: CurrentUser, db: DbSession
) -> dict[str, Any]:
    s = db.execute(
        select(SketchLayer).where(
            SketchLayer.id == uuid.UUID(layer_id), SketchLayer.user_id == user.id
        )
    ).scalar_one_or_none()
    if s is None:
        raise HTTPException(404, detail="SketchLayer not found")
    s.name = body.name
    s.color = body.color
    s.visible = body.visible
    s.locked = body.locked
    s.features = body.features
    db.commit()
    db.refresh(s)
    return _serialize_sketch(s)


@router.delete("/sketch-layers/{layer_id}", status_code=204)
def delete_sketch_layer(layer_id: str, user: CurrentUser, db: DbSession) -> None:
    s = db.execute(
        select(SketchLayer).where(
            SketchLayer.id == uuid.UUID(layer_id), SketchLayer.user_id == user.id
        )
    ).scalar_one_or_none()
    if s is None:
        raise HTTPException(404, detail="SketchLayer not found")
    db.delete(s)
    db.commit()


# ── User JSON storage (DT pattern) ──────────────────────────────────────


def _user_dir(user_id: uuid.UUID) -> Path:
    d = USER_JSON_DIR / "users" / str(user_id) / "json"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _validate_name(name: str) -> str:
    if not SAFE_JSON_NAME.match(name):
        raise HTTPException(
            status_code=400,
            detail="Invalid name; use letters/digits/dot/underscore/hyphen, .json suffix, max 122 chars",
        )
    return name


def _quota_used(user_id: uuid.UUID) -> int:
    d = _user_dir(user_id)
    return sum(p.stat().st_size for p in d.glob("*.json") if p.is_file())


@router.get("/json")
def list_user_json(user: CurrentUser) -> dict[str, Any]:
    d = _user_dir(user.id)
    files = [
        {"name": p.name, "size": p.stat().st_size, "updated_at": p.stat().st_mtime}
        for p in sorted(d.glob("*.json"))
        if p.is_file()
    ]
    return {
        "files": files,
        "quota_bytes": USER_JSON_QUOTA_BYTES,
        "used_bytes": sum(f["size"] for f in files),
    }


@router.get("/json/{name}")
def read_user_json(name: str, user: CurrentUser) -> dict[str, Any]:
    name = _validate_name(name)
    p = _user_dir(user.id) / name
    if not p.exists():
        raise HTTPException(404, detail="Not found")
    return json.loads(p.read_text())


@router.put("/json/{name}")
def write_user_json(name: str, body: dict[str, Any], user: CurrentUser) -> dict[str, Any]:
    name = _validate_name(name)
    payload = json.dumps(body)
    used = _quota_used(user.id)
    if used + len(payload) > USER_JSON_QUOTA_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"User JSON quota {USER_JSON_QUOTA_BYTES} exceeded",
        )
    p = _user_dir(user.id) / name
    p.write_text(payload)
    return {"name": name, "size": len(payload)}


@router.delete("/json/{name}", status_code=204)
def delete_user_json(name: str, user: CurrentUser) -> None:
    name = _validate_name(name)
    p = _user_dir(user.id) / name
    if p.exists():
        p.unlink()
