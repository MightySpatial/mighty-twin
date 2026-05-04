"""Phase K — Twin → Sheets embed endpoints.

Sheets (Stage 14: PDF export + embed widget) renders external content
in iframes. We give it signed read-only URLs scoped to a site or
snapshot, with a TTL and an audience claim so a leaked URL can't be
reused indefinitely.

  GET  /api/embed/sign           — admin: mint a signed token
  GET  /embed/site/{slug}        — public iframe target, validates token
  GET  /embed/snapshot/{id}      — same, for a single snapshot

The iframe targets serve a slim HTML shell that loads the regular Twin
viewer in read-only mode (no chrome, no chat panel, no Atlas). For now
we redirect to the SPA with a query flag — the SPA detects ?embed=1
and hides chrome accordingly.

The Sheets→Twin direction (Twin-as-MCP-client) is the rest of Phase K.
We ship the OAuth setup row + a placeholder runner here; the actual
streaming-HTTP MCP client lands when a user wires their Sheets URL.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel
from sqlalchemy import select

from mighty_models import Site, Snapshot

from .auth import AdminUser, decode_token  # decode reused for shape
from .config import get_settings
from .db import DbSession

router = APIRouter(tags=["embed"])

EMBED_AUDIENCE = "sheets"
DEFAULT_TTL = timedelta(hours=24)


class SignBody(BaseModel):
    kind: str  # 'site' | 'snapshot'
    target: str  # site slug | snapshot UUID
    ttl_hours: int = 24


@router.post("/api/embed/sign")
def sign_embed(body: SignBody, _: AdminUser, db: DbSession) -> dict[str, str]:
    """Mint a signed embed token. Returns { token, url } where url is a
    Twin-hosted page Sheets can drop into an iframe."""
    settings = get_settings()
    if body.kind not in ("site", "snapshot"):
        raise HTTPException(400, detail="kind must be 'site' or 'snapshot'")

    if body.kind == "site":
        site = db.execute(select(Site).where(Site.slug == body.target)).scalar_one_or_none()
        if site is None:
            raise HTTPException(404, detail=f"Site {body.target!r} not found")
    else:
        snap = db.execute(
            select(Snapshot).where(Snapshot.id == uuid.UUID(body.target))
        ).scalar_one_or_none()
        if snap is None:
            raise HTTPException(404, detail="Snapshot not found")

    now = datetime.now(timezone.utc)
    payload = {
        "kind": body.kind,
        "target": body.target,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=body.ttl_hours)).timestamp()),
        "aud": EMBED_AUDIENCE,
        "scope": "read",
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm="HS256")
    url = f"/embed/{body.kind}/{body.target}?token={token}"
    return {"token": token, "url": url}


def _verify_embed(token: str, kind: str, target: str) -> None:
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=["HS256"],
            audience=EMBED_AUDIENCE,
        )
    except jwt.PyJWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid embed token: {e}")
    if payload.get("kind") != kind or payload.get("target") != target:
        raise HTTPException(status_code=403, detail="Token does not match this resource")
    if payload.get("scope") != "read":
        raise HTTPException(status_code=403, detail="Token scope must be 'read'")


# Public embed pages — redirect into the SPA with a embed=1 hint so the
# shell hides its chrome and locks the viewer to read-only.


@router.get("/embed/site/{slug}", response_class=HTMLResponse)
def embed_site(slug: str, token: str = Query(...)) -> HTMLResponse:
    _verify_embed(token, "site", slug)
    return HTMLResponse(_embed_html(f"/viewer/site/{slug}?embed=1"))


@router.get("/embed/snapshot/{snapshot_id}", response_class=HTMLResponse)
def embed_snapshot(snapshot_id: str, token: str = Query(...)) -> HTMLResponse:
    _verify_embed(token, "snapshot", snapshot_id)
    return HTMLResponse(_embed_html(f"/viewer/snapshot/{snapshot_id}?embed=1"))


def _embed_html(spa_url: str) -> str:
    """Skeleton iframe shell. The Sheets-side iframe loads this URL; we
    redirect (via meta refresh + JS) into the SPA so the embed flag is
    in scope when React hydrates."""
    return f"""<!doctype html>
<html><head>
<meta charset='utf-8'>
<meta http-equiv='refresh' content='0; url={spa_url}'>
<title>MightyTwin — embedded</title>
<style>html,body{{margin:0;padding:0;background:#0f0f14;color:#fff;font-family:system-ui;}}</style>
</head><body>
<script>location.replace({spa_url!r})</script>
<noscript><a href='{spa_url}'>Open in MightyTwin</a></noscript>
</body></html>"""
