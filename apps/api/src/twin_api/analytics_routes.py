"""Atlas Overview / Analytics — Phase N.

Workspace-level KPIs for the Atlas Overview landing page. Ports the
spirit of MightyDT's Overview/Analytics tabs but slim — a single read
endpoint returns everything the dashboard needs, no per-card requests.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter
from sqlalchemy import func, select

from mighty_models import DataSource, Layer, Site, Snapshot, StoryMap, User

from .auth import CurrentUser
from .db import DbSession

router = APIRouter(prefix="/api/atlas", tags=["atlas-analytics"])


@router.get("/overview")
def overview(_: CurrentUser, db: DbSession) -> dict[str, Any]:
    """One-shot dashboard payload. Counts only — no per-record details."""
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)
    day_ago = now - timedelta(days=1)

    counts = {
        "users": db.execute(select(func.count(User.id))).scalar() or 0,
        "active_users":
            db.execute(
                select(func.count(User.id)).where(User.is_active.is_(True))
            ).scalar() or 0,
        "sites": db.execute(select(func.count(Site.id))).scalar() or 0,
        "public_sites":
            db.execute(
                select(func.count(Site.id)).where(Site.is_public_pre_login.is_(True))
            ).scalar() or 0,
        "layers": db.execute(select(func.count(Layer.id))).scalar() or 0,
        "data_sources": db.execute(select(func.count(DataSource.id))).scalar() or 0,
        "story_maps": db.execute(select(func.count(StoryMap.id))).scalar() or 0,
        "snapshots": db.execute(select(func.count(Snapshot.id))).scalar() or 0,
    }

    activity = {
        "snapshots_last_7d":
            db.execute(
                select(func.count(Snapshot.id)).where(Snapshot.created_at >= week_ago)
            ).scalar() or 0,
        "snapshots_last_24h":
            db.execute(
                select(func.count(Snapshot.id)).where(Snapshot.created_at >= day_ago)
            ).scalar() or 0,
        "users_added_last_7d":
            db.execute(
                select(func.count(User.id)).where(User.created_at >= week_ago)
            ).scalar() or 0,
        "sites_added_last_7d":
            db.execute(
                select(func.count(Site.id)).where(Site.created_at >= week_ago)
            ).scalar() or 0,
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
