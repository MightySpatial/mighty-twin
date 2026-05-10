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

import json
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, text

from mighty_models import Layer, SchemaChangeLog, SketchLayer, Site, Submission, User

from .auth import AdminUser, CurrentUser
from .db import DbSession

router = APIRouter(prefix="/api/design", tags=["submissions"])

VALID_STATUSES = {"pending", "approved", "rejected", "promoted"}


def _serialize(s: Submission, site: Site | None, submitter: User | None) -> dict[str, Any]:
    schema_changes = s.schema_changes or []
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
        "node_count": s.node_count,
        "sketch_metadata": s.sketch_metadata or {},
        "schema_changes": schema_changes,
        "schema_changes_count": len(schema_changes),
        "schema_changes_approved": s.schema_changes_approved_at is not None,
        "schema_changes_approved_at": (
            s.schema_changes_approved_at.isoformat()
            if s.schema_changes_approved_at else None
        ),
        "schema_changes_approved_by": (
            str(s.schema_changes_approved_by) if s.schema_changes_approved_by else None
        ),
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
    #: Sketch-level metadata snapshot (redline scope, target_data_source_id,
    #: target_layer_id, sublayer_field, tables, coord/CRS settings). Was
    #: sketch_data.sketch in v1; v2 keeps node-style features separate.
    sketch_metadata: dict[str, Any] = Field(default_factory=dict)


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
        sketch_metadata=body.sketch_metadata or {},
        node_count=len(features),
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
    # Editing the schema-changes payload invalidates any prior approval —
    # admin must re-approve before promote can run. Spec §9.8 (the gate).
    s.schema_changes_approved_at = None
    s.schema_changes_approved_by = None
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

    # Schema-change gate (spec §9.8). When the submission carries pending
    # attribute changes, an admin must explicitly approve them before any
    # promote can run. Editing the schema_changes payload re-clears this
    # approval (see update_schema_changes above), so the gate stays
    # honest under concurrent admin reviews.
    if (s.schema_changes or []) and s.schema_changes_approved_at is None:
        raise HTTPException(
            status_code=400,
            detail=(
                "Submission has pending schema changes that must be approved "
                "before promote can run (POST /submissions/{id}/approve-schema-changes)."
            ),
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

    site = db.get(Site, s.site_id)
    if site is None:
        raise HTTPException(status_code=500, detail="Site missing for submission")

    inserted = _insert_features_into_layer(
        db,
        site_id=s.site_id,
        layer_id=layer.id,
        storage_srid=site.storage_srid,
        features=list(s.features or []),
    )

    s.status = "promoted"
    s.promoted_layer_id = layer.id
    s.promoted_feature_count = inserted
    s.reviewed_by_id = admin.id
    s.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(s)
    submitter = db.get(User, s.submitter_id) if s.submitter_id else None
    return _serialize(s, site, submitter)


def _insert_features_into_layer(
    db: DbSession,
    *,
    site_id: uuid.UUID,
    layer_id: uuid.UUID,
    storage_srid: int,
    features: list[dict[str, Any]],
) -> int:
    """Insert each feature in ``features`` into the public.features table
    bound to the given site + layer. Geometries are GeoJSON read from the
    feature payload; we ST_GeomFromGeoJSON in 4326 and ST_Transform to
    the site's storage SRID. Returns the number of rows successfully
    inserted (silently skips features without a valid GeoJSON geometry).
    """
    if not features:
        return 0
    bind = db.get_bind()
    is_postgis = bind.dialect.name == "postgresql"

    inserted = 0
    for f in features:
        # Accept either GeoJSON Feature ({type:'Feature',geometry,properties})
        # or a SketchFeature payload that already nested geojson under
        # `geometry` as a dict.
        geom = f.get("geometry") if isinstance(f, dict) else None
        if not isinstance(geom, dict) or "type" not in geom or "coordinates" not in geom:
            continue
        properties = f.get("properties") if isinstance(f, dict) else None
        if not isinstance(properties, dict):
            properties = {}

        new_id = uuid.uuid4()
        if is_postgis:
            stmt = text(
                """
                INSERT INTO features (id, site_id, layer_id, geom, properties)
                VALUES (
                    :id,
                    :site_id,
                    :layer_id,
                    ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(:geojson), 4326), :storage_srid),
                    CAST(:properties AS jsonb)
                )
                """
            )
        else:
            # SpatiaLite path — kept dialect-aware so dev DBs work too.
            stmt = text(
                """
                INSERT INTO features (id, site_id, layer_id, geom, properties)
                VALUES (
                    :id,
                    :site_id,
                    :layer_id,
                    ST_Transform(GeomFromGeoJSON(:geojson), :storage_srid),
                    :properties
                )
                """
            )
        db.execute(
            stmt,
            {
                "id": str(new_id),
                "site_id": str(site_id),
                "layer_id": str(layer_id),
                "geojson": json.dumps(geom),
                "storage_srid": storage_srid,
                "properties": json.dumps(properties),
            },
        )
        inserted += 1
    return inserted


# ── Promotion plan preview (admin) ─────────────────────────────────────


@router.post("/submissions/{submission_id}/plan")
def preview_promotion_plan(
    submission_id: str,
    body: PromoteBody,
    _: AdminUser,
    db: DbSession,
) -> dict[str, Any]:
    """Preview the promotion plan WITHOUT writing anything.

    Returns the same shape that promote would execute: inserts (one per
    feature with a valid GeoJSON geometry), orphans (skipped features
    with the reason), and a summary block. Mirrors v1's
    ``_build_promotion_plan`` contract (spec §2 + §9.7) but adapted to
    v2's single ``features`` table — there's no per-geom-type table
    routing in v2, so every accepted feature lands as a single insert
    against the target layer."""
    s = db.execute(
        select(Submission).where(Submission.id == uuid.UUID(submission_id))
    ).scalar_one_or_none()
    if s is None:
        raise HTTPException(status_code=404, detail="Submission not found")

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

    inserts: list[dict[str, Any]] = []
    orphans: list[dict[str, Any]] = []
    for f in (s.features or []):
        if not isinstance(f, dict):
            orphans.append({"reason": "feature is not a dict"})
            continue
        geom = f.get("geometry")
        if not isinstance(geom, dict) or "type" not in geom or "coordinates" not in geom:
            orphans.append({
                "node_id": f.get("id"),
                "reason": "feature has no valid GeoJSON geometry",
            })
            continue
        properties = f.get("properties") if isinstance(f.get("properties"), dict) else {}
        inserts.append({
            "node_id": f.get("id"),
            "layer_id": str(layer.id),
            "geometry_kind": geom.get("type"),
            "attrs": properties,
        })

    return {
        "submission_id": str(s.id),
        "status": s.status,
        "schema_changes_approved": s.schema_changes_approved_at is not None,
        "blocked_by_schema_changes": (
            bool(s.schema_changes or []) and s.schema_changes_approved_at is None
        ),
        "plan": {
            "inserts": inserts,
            "orphans": orphans,
            "summary": {
                "inserts": len(inserts),
                "orphans": len(orphans),
                "target_layer_id": str(layer.id),
                "target_layer_name": layer.name,
                "site_storage_srid": (
                    db.get(Site, s.site_id).storage_srid
                    if db.get(Site, s.site_id) is not None else 4326
                ),
            },
        },
    }


# ── Schema-changes approval (admin) ────────────────────────────────────


@router.post("/submissions/{submission_id}/approve-schema-changes")
def approve_schema_changes(
    submission_id: str,
    admin: AdminUser,
    db: DbSession,
) -> dict[str, Any]:
    """Approve the submission's schema_changes payload.

    Records ``schema_changes_approved_at`` + ``_by`` so the promote gate
    (see promote) accepts the submission. v2 stores attributes in a
    JSONB ``properties`` column, so there's no DDL to run — the spec's
    v1 ALTER TABLE pipeline collapses to an audit-only operation here.
    Each entry in ``schema_changes`` produces a row in
    ``schema_change_log`` for permanent record (spec §9.8)."""
    s = db.execute(
        select(Submission).where(Submission.id == uuid.UUID(submission_id))
    ).scalar_one_or_none()
    if s is None:
        raise HTTPException(status_code=404, detail="Submission not found")
    if s.status not in {"pending", "approved"}:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot approve schema changes on a {s.status} submission",
        )

    changes = s.schema_changes or []
    if not changes:
        # Idempotent — record approval even when there's nothing to log,
        # so promote isn't gated by a phantom "approval needed" state.
        s.schema_changes_approved_at = datetime.now(timezone.utc)
        s.schema_changes_approved_by = admin.id
        db.commit()
        db.refresh(s)
        site = db.get(Site, s.site_id)
        submitter = db.get(User, s.submitter_id) if s.submitter_id else None
        return {
            **_serialize(s, site, submitter),
            "audit_rows_created": 0,
        }

    # Validate each entry — spec §9.8 allowed actions/types.
    allowed_actions = {"add_column"}
    allowed_types = {
        "TEXT", "INTEGER", "REAL", "DOUBLE PRECISION",
        "NUMERIC", "BOOLEAN", "TIMESTAMPTZ", "JSONB",
    }
    for i, c in enumerate(changes):
        if not isinstance(c, dict):
            raise HTTPException(400, f"schema_changes[{i}] is not an object")
        action = c.get("action")
        if action not in allowed_actions:
            raise HTTPException(
                400, f"schema_changes[{i}].action={action!r} not in {sorted(allowed_actions)}"
            )
        ctype = (c.get("column_type") or "").upper()
        if ctype not in allowed_types:
            raise HTTPException(
                400, f"schema_changes[{i}].column_type={ctype!r} not in {sorted(allowed_types)}"
            )

    # Audit log — one row per change. v2 doesn't run DDL here (the
    # JSONB properties column accepts arbitrary keys); the row records
    # the approval intent for downstream tooling.
    audit_rows = 0
    for c in changes:
        log = SchemaChangeLog(
            submission_id=s.id,
            table_name=str(c.get("table") or "features"),
            column_name=str(c.get("column") or ""),
            column_type=str(c.get("column_type") or "TEXT").upper(),
            applied_by=admin.id,
            sql_executed=(
                f"-- v2 audit-only: properties JSONB accepts arbitrary keys. "
                f"add_column {c.get('column')!r} ({c.get('column_type')}) "
                f"via submission {s.id}."
            ),
        )
        db.add(log)
        audit_rows += 1

    s.schema_changes_approved_at = datetime.now(timezone.utc)
    s.schema_changes_approved_by = admin.id
    db.commit()
    db.refresh(s)
    site = db.get(Site, s.site_id)
    submitter = db.get(User, s.submitter_id) if s.submitter_id else None
    return {
        **_serialize(s, site, submitter),
        "audit_rows_created": audit_rows,
    }


# ── My submissions (user-side) ─────────────────────────────────────────


@router.get("/submissions/mine/list")
def my_submissions(user: CurrentUser, db: DbSession) -> list[dict[str, Any]]:
    """Last 50 submissions by the current user — feeds the Design widget's
    Download tab "My Submissions" section."""
    rows = db.execute(
        select(Submission)
        .where(Submission.submitter_id == user.id)
        .order_by(Submission.created_at.desc())
        .limit(50)
    ).scalars().all()
    return _hydrate(list(rows), db)
