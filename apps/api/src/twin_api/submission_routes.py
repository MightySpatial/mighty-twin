"""Design submissions — Phase T (T+120).

User flow:

    user sketches in Design widget          POST /api/sites/{slug}/submissions
            ↓
    submission lands in 'pending'           GET  /api/design/submissions?status=pending
            ↓                               PATCH/api/design/submissions/{id}/schema-changes
    admin reviews                           POST /api/design/submissions/{id}/approve
                                            POST /api/design/submissions/{id}/reject
            ↓
    if approved, optionally promote         POST /api/design/submissions/{id}/promote
    into a real layer                              { target_layer_id }

Snapshots the SketchLayer features at submit time so subsequent edits to
the source sketch don't mutate the submission. Schema changes describe
attribute fields the submitter introduced; admins can edit before
promotion.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select

from mighty_models import Layer, SketchLayer, Site, Submission, User

from .auth import AdminUser, CurrentUser
from .db import DbSession

router = APIRouter(prefix="/api/design", tags=["submissions"])

VALID_STATUSES = {"pending", "approved", "rejected", "promoted"}


def _serialize(s: Submission, site: Site | None, submitter: User | None) -> dict[str, Any]:
    return {
        "id": str(s.id),
        "status": s.status,
        "site_id": str(s.site_id),
        "site_slug": site.slug if site else "",
        "site_name": site.name if site else "",
        "sketch_layer_id": str(s.sketch_layer_id) if s.sketch_layer_id else None,
        "submitter_id": str(s.submitter_id) if s.submitter_id else None,
        "submitter_name": submitter.name if submitter else "Unknown",
        "submitter_email": submitter.email if submitter else "",
        "feature_count": len(s.features or []),
        "schema_changes": s.schema_changes or [],
        "notes": s.notes,
        "review_notes": s.review_notes,
        "reviewed_at": s.reviewed_at.isoformat() if s.reviewed_at else None,
        "promoted_layer_id": str(s.promoted_layer_id) if s.promoted_layer_id else None,
        "promoted_feature_count": s.promoted_feature_count,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "updated_at": s.updated_at.isoformat() if s.updated_at else None,
    }


def _hydrate(rows: list[Submission], db: DbSession) -> list[dict[str, Any]]:
    site_ids = {r.site_id for r in rows}
    user_ids = {r.submitter_id for r in rows if r.submitter_id}
    sites = {
        s.id: s
        for s in db.execute(select(Site).where(Site.id.in_(site_ids))).scalars().all()
    } if site_ids else {}
    users = {
        u.id: u
        for u in db.execute(select(User).where(User.id.in_(user_ids))).scalars().all()
    } if user_ids else {}
    return [
        _serialize(r, sites.get(r.site_id), users.get(r.submitter_id) if r.submitter_id else None)
        for r in rows
    ]


# ── Listing + detail ────────────────────────────────────────────────────


@router.get("/submissions")
def list_submissions(
    _: CurrentUser,
    db: DbSession,
    status: str | None = None,
    site_slug: str | None = None,
) -> list[dict[str, Any]]:
    stmt = select(Submission).order_by(Submission.created_at.desc())
    if status:
        if status not in VALID_STATUSES:
            raise HTTPException(status_code=400, detail=f"status must be one of {sorted(VALID_STATUSES)}")
        stmt = stmt.where(Submission.status == status)
    if site_slug:
        site = db.execute(select(Site).where(Site.slug == site_slug)).scalar_one_or_none()
        if site is None:
            raise HTTPException(status_code=404, detail="Site not found")
        stmt = stmt.where(Submission.site_id == site.id)
    rows = db.execute(stmt).scalars().all()
    return _hydrate(list(rows), db)


@router.get("/submissions/{submission_id}")
def get_submission(submission_id: str, _: CurrentUser, db: DbSession) -> dict[str, Any]:
    s = db.execute(
        select(Submission).where(Submission.id == uuid.UUID(submission_id))
    ).scalar_one_or_none()
    if s is None:
        raise HTTPException(status_code=404, detail="Submission not found")
    site = db.get(Site, s.site_id)
    submitter = db.get(User, s.submitter_id) if s.submitter_id else None
    out = _serialize(s, site, submitter)
    out["features"] = s.features or []
    return out


# ── Submit (user-side) ──────────────────────────────────────────────────


class SubmissionCreate(BaseModel):
    site_slug: str
    sketch_layer_id: str | None = None
    features: list[dict[str, Any]] = Field(default_factory=list)
    schema_changes: list[dict[str, Any]] = Field(default_factory=list)
    notes: str | None = None


@router.post("/submissions", status_code=201)
def create_submission(
    body: SubmissionCreate, user: CurrentUser, db: DbSession
) -> dict[str, Any]:
    site = db.execute(select(Site).where(Site.slug == body.site_slug)).scalar_one_or_none()
    if site is None:
        raise HTTPException(status_code=404, detail="Site not found")

    sketch_id: uuid.UUID | None = None
    features = list(body.features or [])
    if body.sketch_layer_id:
        sketch_id = uuid.UUID(body.sketch_layer_id)
        sk = db.execute(
            select(SketchLayer).where(SketchLayer.id == sketch_id)
        ).scalar_one_or_none()
        if sk is None:
            raise HTTPException(status_code=404, detail="Sketch layer not found")
        # Snapshot the live features unless the caller passed an explicit list.
        if not features:
            features = list(sk.features or [])

    if not features:
        raise HTTPException(
            status_code=400,
            detail="A submission must include at least one feature",
        )

    s = Submission(
        site_id=site.id,
        submitter_id=user.id,
        sketch_layer_id=sketch_id,
        status="pending",
        features=features,
        schema_changes=body.schema_changes or [],
        notes=body.notes,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return _serialize(s, site, user)


# ── Schema change edits (admin) ─────────────────────────────────────────


class SchemaChangesUpdate(BaseModel):
    schema_changes: list[dict[str, Any]]


@router.patch("/submissions/{submission_id}/schema-changes")
def update_schema_changes(
    submission_id: str,
    body: SchemaChangesUpdate,
    _: AdminUser,
    db: DbSession,
) -> dict[str, Any]:
    s = db.execute(
        select(Submission).where(Submission.id == uuid.UUID(submission_id))
    ).scalar_one_or_none()
    if s is None:
        raise HTTPException(status_code=404, detail="Submission not found")
    if s.status not in {"pending", "approved"}:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot edit schema changes on a {s.status} submission",
        )
    s.schema_changes = body.schema_changes or []
    db.commit()
    db.refresh(s)
    site = db.get(Site, s.site_id)
    submitter = db.get(User, s.submitter_id) if s.submitter_id else None
    return _serialize(s, site, submitter)


# ── Approve / Reject ────────────────────────────────────────────────────


class ReviewBody(BaseModel):
    reason: str | None = None


def _review(
    submission_id: str,
    new_status: str,
    body: ReviewBody | None,
    admin: User,
    db: DbSession,
) -> dict[str, Any]:
    s = db.execute(
        select(Submission).where(Submission.id == uuid.UUID(submission_id))
    ).scalar_one_or_none()
    if s is None:
        raise HTTPException(status_code=404, detail="Submission not found")
    if s.status != "pending":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot {new_status} a submission already in '{s.status}'",
        )
    s.status = new_status
    s.review_notes = body.reason if body else None
    s.reviewed_by_id = admin.id
    s.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(s)
    site = db.get(Site, s.site_id)
    submitter = db.get(User, s.submitter_id) if s.submitter_id else None
    return _serialize(s, site, submitter)


@router.post("/submissions/{submission_id}/approve")
def approve_submission(
    submission_id: str,
    admin: AdminUser,
    db: DbSession,
    body: ReviewBody | None = None,
) -> dict[str, Any]:
    return _review(submission_id, "approved", body, admin, db)


@router.post("/submissions/{submission_id}/reject")
def reject_submission(
    submission_id: str,
    admin: AdminUser,
    db: DbSession,
    body: ReviewBody | None = None,
) -> dict[str, Any]:
    return _review(submission_id, "rejected", body, admin, db)


# ── Promote into a real layer ───────────────────────────────────────────


class PromoteBody(BaseModel):
    target_layer_id: str


@router.post("/submissions/{submission_id}/promote")
def promote_submission(
    submission_id: str,
    body: PromoteBody,
    admin: AdminUser,
    db: DbSession,
) -> dict[str, Any]:
    s = db.execute(
        select(Submission).where(Submission.id == uuid.UUID(submission_id))
    ).scalar_one_or_none()
    if s is None:
        raise HTTPException(status_code=404, detail="Submission not found")
    if s.status != "approved":
        raise HTTPException(
            status_code=400,
            detail="Submission must be approved before it can be promoted",
        )

    layer = db.execute(
        select(Layer).where(Layer.id == uuid.UUID(body.target_layer_id))
    ).scalar_one_or_none()
    if layer is None:
        raise HTTPException(status_code=404, detail="Target layer not found")
    if layer.site_id != s.site_id:
        raise HTTPException(
            status_code=400,
            detail="Target layer must belong to the same site as the submission",
        )

    # Phase T scope: record the promotion but defer actual feature
    # materialisation into the layer's storage table to a follow-up
    # commit (needs the spatial inserter helper). For now we mark the
    # submission as 'promoted' and capture which layer it landed in plus
    # the count, so the queue UI can show the resolved status.
    s.status = "promoted"
    s.promoted_layer_id = layer.id
    s.promoted_feature_count = len(s.features or [])
    s.reviewed_by_id = admin.id
    s.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(s)
    site = db.get(Site, s.site_id)
    submitter = db.get(User, s.submitter_id) if s.submitter_id else None
    return _serialize(s, site, submitter)
