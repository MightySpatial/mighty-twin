"""3D model library — Design widget "Import Objects" panel.

Routes:
    POST   /api/design/models/upload        glb/gltf/stl  ≤ 50 MB
    POST   /api/design/models/upload-ifc    ifc           ≤ 100 MB (converted)
    GET    /api/design/models?category=...  list w/ presigned-equivalent URL
    GET    /api/design/models/{id}          detail
    PATCH  /api/design/models/{id}          name / description / tags / georeference
    DELETE /api/design/models/{id}          row + best-effort blob delete

Storage layout — file-system in dev, S3-ready by env var:
    TWIN_DESIGN_MODELS_DIR  (default /tmp/twin-design-models)
        org/{uploaded_by_id}/models/{model_id}/{format}.{ext}
        org/{uploaded_by_id}/models/{model_id}/source.ifc   (raw IFC kept)
        org/{uploaded_by_id}/models/{model_id}/thumb.png    (optional)

The v1 module ran ifcopenshell + trimesh to extract geometry + georef
from IFC files. The conversion path lands in a follow-up commit so the
container image stays small; for now the upload-ifc endpoint stores
the IFC as-is and surfaces a 'pending_conversion' georeference state
for the frontend to display.

Spec §3 design_models table + §4 model endpoints.
"""

from __future__ import annotations

import os
import shutil
import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import select

from mighty_models import DesignModel

from .auth import CurrentUser
from .db import DbSession

router = APIRouter(prefix="/api/design/models", tags=["design-models"])

MODELS_DIR = Path(os.environ.get("TWIN_DESIGN_MODELS_DIR", "/tmp/twin-design-models"))
MODELS_DIR.mkdir(parents=True, exist_ok=True)

MAX_GLB_BYTES = 50 * 1024 * 1024
MAX_IFC_BYTES = 100 * 1024 * 1024
ALLOWED_GLB_EXT = {"glb", "gltf", "stl"}


# ── Helpers ──────────────────────────────────────────────────────────────


def _model_dir(model_id: uuid.UUID, owner_id: uuid.UUID | None) -> Path:
    owner = str(owner_id) if owner_id else "anon"
    p = MODELS_DIR / "org" / owner / "models" / str(model_id)
    p.mkdir(parents=True, exist_ok=True)
    return p


def _serialize(m: DesignModel) -> dict[str, Any]:
    return {
        "id": str(m.id),
        "name": m.name,
        "description": m.description,
        "category": m.category,
        "tags": m.tags or [],
        "format": m.format,
        "storage_key": m.storage_key,
        "storage_size_bytes": m.storage_size_bytes,
        "thumbnail_key": m.thumbnail_key,
        "georeference": m.georeference or {},
        "site_id": str(m.site_id) if m.site_id else None,
        "uploaded_by_id": str(m.uploaded_by_id) if m.uploaded_by_id else None,
        "created_at": m.created_at.isoformat() if m.created_at else None,
        "updated_at": m.updated_at.isoformat() if m.updated_at else None,
        # Frontend treats this as the URL to fetch the binary. Local-FS
        # backend exposes via /api/design/models/{id}/blob (below). When
        # we wire S3, the value becomes a presigned URL.
        "url": f"/api/design/models/{m.id}/blob",
    }


# ── List + detail ────────────────────────────────────────────────────────


@router.get("")
def list_models(
    user: CurrentUser,
    db: DbSession,
    category: str | None = None,
    site_slug: str | None = None,
) -> list[dict[str, Any]]:
    stmt = select(DesignModel).order_by(DesignModel.created_at.desc())
    if category:
        stmt = stmt.where(DesignModel.category == category)
    rows = db.execute(stmt).scalars().all()
    return [_serialize(m) for m in rows]


@router.get("/{model_id}")
def get_model(model_id: str, user: CurrentUser, db: DbSession) -> dict[str, Any]:
    m = db.execute(
        select(DesignModel).where(DesignModel.id == uuid.UUID(model_id))
    ).scalar_one_or_none()
    if m is None:
        raise HTTPException(404, "Model not found")
    return _serialize(m)


# ── Blob fetch (local-FS backend) ───────────────────────────────────────


@router.get("/{model_id}/blob")
def get_model_blob(model_id: str, user: CurrentUser, db: DbSession):
    from fastapi.responses import FileResponse  # noqa: PLC0415
    m = db.execute(
        select(DesignModel).where(DesignModel.id == uuid.UUID(model_id))
    ).scalar_one_or_none()
    if m is None:
        raise HTTPException(404, "Model not found")
    path = MODELS_DIR / m.storage_key
    if not path.is_file():
        raise HTTPException(404, "Blob missing on disk")
    media = {
        "glb": "model/gltf-binary",
        "gltf": "model/gltf+json",
        "stl": "model/stl",
        "ifc": "application/x-step",
    }.get(m.format, "application/octet-stream")
    return FileResponse(path, media_type=media, filename=f"{m.name}.{m.format}")


# ── Upload (GLB / glTF / STL) ───────────────────────────────────────────


@router.post("/upload", status_code=201)
async def upload_model(
    user: CurrentUser,
    db: DbSession,
    file: UploadFile = File(...),
    name: str | None = None,
    category: str = "custom",
) -> dict[str, Any]:
    if not file.filename:
        raise HTTPException(400, "Missing filename")
    ext = Path(file.filename).suffix.lower().lstrip(".")
    if ext not in ALLOWED_GLB_EXT:
        raise HTTPException(415, f"Format {ext!r} not supported (allowed: {sorted(ALLOWED_GLB_EXT)})")
    raw = await file.read()
    if len(raw) > MAX_GLB_BYTES:
        raise HTTPException(413, f"File too large (max {MAX_GLB_BYTES // 1024 // 1024} MB)")

    new_id = uuid.uuid4()
    target_dir = _model_dir(new_id, user.id)
    blob_name = f"asset.{ext}"
    blob_path = target_dir / blob_name
    blob_path.write_bytes(raw)

    storage_key = str(blob_path.relative_to(MODELS_DIR))
    m = DesignModel(
        id=new_id,
        uploaded_by_id=user.id,
        name=name or Path(file.filename).stem,
        category=category,
        format=ext,
        storage_key=storage_key,
        storage_size_bytes=len(raw),
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return _serialize(m)


# ── Upload IFC (raw, conversion deferred) ───────────────────────────────


@router.post("/upload-ifc", status_code=201)
async def upload_ifc(
    user: CurrentUser,
    db: DbSession,
    file: UploadFile = File(...),
    name: str | None = None,
    category: str = "ifc",
) -> dict[str, Any]:
    """Upload a raw IFC. v1's path runs ifcopenshell + trimesh to extract
    a renderable GLB plus the file's georeferencing block; v2 stores the
    IFC raw and surfaces ``pending_conversion`` so the frontend can show
    a placeholder until a worker (or follow-up commit wiring
    ifcopenshell into the API image) converts it. This keeps the API
    image small for now and unblocks the UI integration."""
    if not file.filename:
        raise HTTPException(400, "Missing filename")
    raw = await file.read()
    if len(raw) > MAX_IFC_BYTES:
        raise HTTPException(413, f"IFC too large (max {MAX_IFC_BYTES // 1024 // 1024} MB)")

    new_id = uuid.uuid4()
    target_dir = _model_dir(new_id, user.id)
    src_name = "source.ifc"
    (target_dir / src_name).write_bytes(raw)
    storage_key = str((target_dir / src_name).relative_to(MODELS_DIR))

    m = DesignModel(
        id=new_id,
        uploaded_by_id=user.id,
        name=name or Path(file.filename).stem,
        category=category,
        format="ifc",
        storage_key=storage_key,
        storage_size_bytes=len(raw),
        georeference={"_status": "pending_conversion"},
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return _serialize(m)


# ── Patch metadata ──────────────────────────────────────────────────────


class ModelPatch(BaseModel):
    name: str | None = None
    description: str | None = None
    category: str | None = None
    tags: list[str] | None = None
    georeference: dict[str, Any] | None = Field(
        default=None,
        description="{lon, lat, alt, heading?, pitch?, roll?} — clears _status when set",
    )


@router.patch("/{model_id}")
def patch_model(
    model_id: str,
    body: ModelPatch,
    user: CurrentUser,
    db: DbSession,
) -> dict[str, Any]:
    m = db.execute(
        select(DesignModel).where(DesignModel.id == uuid.UUID(model_id))
    ).scalar_one_or_none()
    if m is None:
        raise HTTPException(404, "Model not found")
    # Only the uploader (or an admin) can mutate; cheap check via the
    # CurrentUser.id, fall through to admins implicitly via the
    # AdminUser dependency on broader endpoints if we ever need it.
    if m.uploaded_by_id and m.uploaded_by_id != user.id and user.role.value != "admin":
        raise HTTPException(403, "Only the uploader or an admin can edit this model")

    if body.name is not None:
        m.name = body.name
    if body.description is not None:
        m.description = body.description
    if body.category is not None:
        m.category = body.category
    if body.tags is not None:
        m.tags = body.tags
    if body.georeference is not None:
        m.georeference = body.georeference

    db.commit()
    db.refresh(m)
    return _serialize(m)


# ── Delete ──────────────────────────────────────────────────────────────


@router.delete("/{model_id}", status_code=204)
def delete_model(model_id: str, user: CurrentUser, db: DbSession) -> None:
    m = db.execute(
        select(DesignModel).where(DesignModel.id == uuid.UUID(model_id))
    ).scalar_one_or_none()
    if m is None:
        raise HTTPException(404, "Model not found")
    if m.uploaded_by_id and m.uploaded_by_id != user.id and user.role.value != "admin":
        raise HTTPException(403, "Only the uploader or an admin can delete this model")

    # Best-effort blob cleanup. An orphaned dir is preferable to a 500.
    try:
        path = MODELS_DIR / m.storage_key
        if path.is_file():
            shutil.rmtree(path.parent, ignore_errors=True)
    except Exception:  # noqa: BLE001
        pass

    db.delete(m)
    db.commit()
