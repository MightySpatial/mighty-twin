"""Design widget layer preset registry.

Per-site **layer preset bundles** that the Design widget's LayersTab
preset selector reads when the user wants to stamp a curated set of
draw layers onto an active sketch (e.g. "Stormwater redline" pre-loads
DRAINAGE / KERB / SUMP layers with their colours + schemas).

Storage shape mirrors v1's MightyDT
(``sites.metadata.design_layer_presets``) — a JSON list on the Site
model. v2 keeps the equivalent under ``Site.config.design_layer_presets``
so the contract is stable across both backends.

Each preset:

    {
      id: "preset_abc",
      name: "Stormwater",
      description: "Pre-canned stormwater redline layers",
      layers: [
        {
          name: "Drainage", colour: "#22d3ee",
          presetValue: "DRAINAGE",
          fields: [{key:"AssetType", type:"text", defaultVal:"pipe"}]
        },
        ...
      ]
    }

Endpoints:

    GET  /api/sites/{slug}/design-layer-presets       list
    PUT  /api/sites/{slug}/design-layer-presets       replace whole list
"""

from __future__ import annotations

import json as _json
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified

from mighty_models import Site

from .auth import CurrentUser
from .db import DbSession

router = APIRouter(prefix="/api/sites", tags=["design-layer-presets"])

MAX_PRESETS = 100
MAX_PAYLOAD_BYTES = 900_000


# ── Schemas ──────────────────────────────────────────────────────────────


class PresetField(BaseModel):
    key: str = Field(..., min_length=1, max_length=64)
    type: str = Field("text", pattern="^(text|number|date|select)$")
    defaultVal: str | None = None  # noqa: N815


class PresetLayer(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    colour: str | None = Field(None, max_length=16)
    presetValue: str | None = Field(None, max_length=64)  # noqa: N815
    fields: list[PresetField] = Field(default_factory=list)


class Preset(BaseModel):
    id: str | None = Field(None, max_length=64)
    name: str = Field(..., min_length=1, max_length=128)
    description: str | None = Field(None, max_length=512)
    layers: list[PresetLayer] = Field(default_factory=list)


class PresetsIn(BaseModel):
    presets: list[Preset]


# ── Helpers ──────────────────────────────────────────────────────────────


def _site_or_404(slug: str, db: DbSession) -> Site:
    site = db.scalar(select(Site).where(Site.slug == slug))
    if not site:
        raise HTTPException(404, f"Site '{slug}' not found")
    return site


def _read(site: Site) -> list[dict[str, Any]]:
    cfg = site.config or {}
    raw = cfg.get("design_layer_presets", [])
    return raw if isinstance(raw, list) else []


def _write(site: Site, presets: list[dict[str, Any]], db: DbSession) -> None:
    cfg = dict(site.config or {})
    cfg["design_layer_presets"] = presets
    site.config = cfg
    flag_modified(site, "config")
    db.commit()


def _gen_id() -> str:
    return f"preset_{uuid.uuid4().hex[:10]}"


# ── Routes ───────────────────────────────────────────────────────────────


@router.get("/{slug}/design-layer-presets")
def list_presets(slug: str, _: CurrentUser, db: DbSession) -> dict[str, Any]:
    """List the site's layer-preset bundles."""
    site = _site_or_404(slug, db)
    return {"presets": _read(site)}


@router.put("/{slug}/design-layer-presets")
def replace_presets(
    slug: str,
    body: PresetsIn,
    _: CurrentUser,
    db: DbSession,
) -> dict[str, Any]:
    """Replace the whole preset list. Bounded by MAX_PRESETS + size."""
    if len(body.presets) > MAX_PRESETS:
        raise HTTPException(400, f"Too many presets (max {MAX_PRESETS})")

    out: list[dict[str, Any]] = []
    for p in body.presets:
        d = p.model_dump(exclude_none=True)
        if not d.get("id"):
            d["id"] = _gen_id()
        out.append(d)

    if len(_json.dumps(out)) > MAX_PAYLOAD_BYTES:
        raise HTTPException(400, "Presets payload too large")

    site = _site_or_404(slug, db)
    _write(site, out, db)
    return {"presets": out, "count": len(out)}
