"""Atlas Overview / Analytics — Phase N.

Workspace-level KPIs for the Atlas Overview landing page. Ports the
spirit of MightyDT's Overview/Analytics tabs but slim — a single read
endpoint returns everything the dashboard needs, no per-card requests.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter
from sqlalchemy import case, func, select, text

from mighty_models import (
    DataSource,
    Layer,
    LibraryItem,
    Site,
    Snapshot,
    StoryMap,
    Submission,
    User,
)

from . import __version__ as API_VERSION
from .auth import AdminUser, CurrentUser
from .db import DbSession

router = APIRouter(prefix="/api/atlas", tags=["atlas-analytics"])


def _filtered_count(predicate):
    """COUNT(*) FILTER (WHERE …) for one round-trip multi-counts."""
    return func.count(case((predicate, 1)))


@router.get("/overview")
def overview(_: CurrentUser, db: DbSession) -> dict[str, Any]:
    """One-shot dashboard payload. Counts only — no per-record details.

    Coalesces the 14 single-table counts into 8 round-trips by leaning
    on ``COUNT(*) FILTER (WHERE …)`` per table. AppLayout polls this on
    a 60-second cadence, so the saved round-trips matter on PG with
    network latency.
    """
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)
    day_ago = now - timedelta(days=1)

    user_row = db.execute(
        select(
            func.count(User.id),
            _filtered_count(User.is_active.is_(True)),
            _filtered_count(User.created_at >= week_ago),
        )
    ).one()

    site_row = db.execute(
        select(
            func.count(Site.id),
            _filtered_count(Site.is_public_pre_login.is_(True)),
            _filtered_count(Site.created_at >= week_ago),
        )
    ).one()

    snap_row = db.execute(
        select(
            func.count(Snapshot.id),
            _filtered_count(Snapshot.created_at >= week_ago),
            _filtered_count(Snapshot.created_at >= day_ago),
        )
    ).one()

    submission_row = db.execute(
        select(
            func.count(Submission.id),
            _filtered_count(Submission.status == "pending"),
        )
    ).one()

    layer_count = db.execute(select(func.count(Layer.id))).scalar() or 0
    ds_count = db.execute(select(func.count(DataSource.id))).scalar() or 0
    story_count = db.execute(select(func.count(StoryMap.id))).scalar() or 0

    counts = {
        "users": int(user_row[0] or 0),
        "active_users": int(user_row[1] or 0),
        "sites": int(site_row[0] or 0),
        "public_sites": int(site_row[1] or 0),
        "layers": layer_count,
        "data_sources": ds_count,
        "story_maps": story_count,
        "snapshots": int(snap_row[0] or 0),
        "submissions_pending": int(submission_row[1] or 0),
        "submissions_total": int(submission_row[0] or 0),
    }

    activity = {
        "snapshots_last_7d": int(snap_row[1] or 0),
        "snapshots_last_24h": int(snap_row[2] or 0),
        "users_added_last_7d": int(user_row[2] or 0),
        "sites_added_last_7d": int(site_row[2] or 0),
    }

    # Top-active sites by snapshot count (last 30 days)
    month_ago = now - timedelta(days=30)
    top_sites_rows = db.execute(
        select(
            Site.slug,
            Site.name,
            func.count(Snapshot.id).label("snapshot_count"),
        )
        .join(Snapshot, Snapshot.site_id == Site.id, isouter=True)
        .where((Snapshot.created_at >= month_ago) | (Snapshot.created_at.is_(None)))
        .group_by(Site.id)
        .order_by(func.count(Snapshot.id).desc())
        .limit(5)
    ).all()
    top_sites = [
        {"slug": row[0], "name": row[1], "snapshots_30d": int(row[2])}
        for row in top_sites_rows
    ]

    # Recent snapshots (last 5)
    recent_snaps = (
        db.execute(
            select(Snapshot, Site.slug, Site.name)
            .join(Site, Site.id == Snapshot.site_id, isouter=True)
            .order_by(Snapshot.created_at.desc())
            .limit(5)
        ).all()
    )
    recent = [
        {
            "id": str(s.id),
            "name": s.name,
            "site_slug": slug,
            "site_name": sname,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s, slug, sname in recent_snaps
    ]

    return {
        "counts": counts,
        "activity": activity,
        "top_sites": top_sites,
        "recent_snapshots": recent,
        "generated_at": now.isoformat(),
    }


@router.get("/diagnostics")
def diagnostics(_: AdminUser, db: DbSession) -> dict[str, Any]:
    """System diagnostics for the Settings → Diagnostics panel.

    Reports the bits an on-prem operator usually wants to confirm before
    raising a support ticket: API version, DB engine + PostGIS version,
    Alembic revision, and asset / feature totals. All read-only — destructive
    operations (re-index, vacuum, backup) are deliberately not exposed
    here yet.
    """
    bind = db.get_bind()
    dialect = bind.dialect.name
    out: dict[str, Any] = {
        "api": {
            "version": API_VERSION,
            "database_dialect": dialect,
        },
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }

    # DB version + PostGIS version (when running against PostgreSQL)
    db_info: dict[str, Any] = {}
    try:
        if dialect == "postgresql":
            db_info["postgresql"] = (
                db.execute(text("SELECT version()")).scalar() or ""
            ).split(" on ")[0]
            try:
                db_info["postgis"] = (
                    db.execute(text("SELECT PostGIS_Version()")).scalar() or ""
                ).split(" ")[0]
            except Exception:
                db_info["postgis"] = None
            db_info["alembic_revision"] = db.execute(
                text("SELECT version_num FROM alembic_version LIMIT 1")
            ).scalar()
        else:
            db_info["sqlite"] = db.execute(
                text("SELECT sqlite_version()")
            ).scalar()
    except Exception as e:  # pragma: no cover — diagnostic, never fatal
        db_info["error"] = str(e)
    out["database"] = db_info

    # Asset totals: features (geometry rows) + library uploads
    try:
        out["assets"] = {
            "features": int(
                db.execute(text("SELECT COUNT(*) FROM features")).scalar() or 0
            ),
            "library_items": int(
                db.execute(select(func.count(LibraryItem.id))).scalar() or 0
            ),
            "data_sources": int(
                db.execute(select(func.count(DataSource.id))).scalar() or 0
            ),
        }
    except Exception as e:  # pragma: no cover
        out["assets"] = {"error": str(e)}

    return out
