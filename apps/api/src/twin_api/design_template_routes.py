"""Design widget attribute-template registry.

Per-site templates that the Design widget's AttributesEditor reads when
the user picks an attribute template, and writes to via the ⎘
"save-as-template" button.

Storage shape mirrors v1's MightyDT (``sites.metadata.design_templates``)
— a JSON list on the Site model. v2 keeps the equivalent under
``Site.config.design_templates`` so the contract is stable across both
backends.

Each template:

    {
      id: "tmpl_abc",
      name: "Power pole",
      geometry: "point" | "line" | "polygon",      // optional
      colour: "#22d3ee",                            // optional
      fields: [
        { key: "AssetType", type: "text", defaultVal: "pole" },
        { key: "InstallDate", type: "date" },
        ...
      ],
      values: { AssetType: "pole", InstallDate: "..." }   // optional defaults
    }

Endpoints:

    GET    /api/sites/{slug}/design-templates           list
    PUT    /api/sites/{slug}/design-templates           replace whole list
    POST   /api/sites/{slug}/design-templates           append (returns id)
    DELETE /api/sites/{slug}/design-templates/{tmpl_id} remove one
"""

from __future__ import annotations

import re
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified

from mighty_models import Site

from .auth import CurrentUser
from .db import DbSession

router = APIRouter(prefix="/api/sites", tags=["design-templates"])

MAX_TEMPLATES = 500
MAX_PAYLOAD_BYTES = 900_000
SAFE_ID = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")


# ── Schemas ──────────────────────────────────────────────────────────────


class TemplateField(BaseModel):
    key: str = Field(..., min_length=1, max_length=64)
    type: str = Field("text", pattern="^(text|number|date|select)$")
    defaultVal: str | None = None  # noqa: N815 — wire format mirrors frontend
    role: str | None = None


class Template(BaseModel):
    id: str | None = Field(
        None,
        max_length=64,
        description="Stable id. Auto-generated on POST when omitted.",
    )
    name: str = Field(..., min_length=1, max_length=128)
    geometry: str | None = Field(
        None, pattern="^(point|line|polygon)$",
        description="Optional geometry filter — the picker only shows compatible "
                    "templates per drawing tool.",
    )
    colour: str | None = Field(None, max_length=16)
    fields: list[TemplateField] = Field(default_factory=list)
    values: dict[str, Any] = Field(default_factory=dict)


class TemplatesIn(BaseModel):
    templates: list[Template]


# ── Helpers ──────────────────────────────────────────────────────────────


def _site_or_404(slug: str, db: DbSession) -> Site:
    site = db.scalar(select(Site).where(Site.slug == slug))
    if not site:
        raise HTTPException(404, f"Site '{slug}' not found")
    return site


def _read_templates(site: Site) -> list[dict[str, Any]]:
    cfg = site.config or {}
    raw = cfg.get("design_templates", [])
    return raw if isinstance(raw, list) else []


def _write_templates(site: Site, templates: list[dict[str, Any]], db: DbSession) -> None:
    cfg = dict(site.config or {})
    cfg["design_templates"] = templates
    site.config = cfg
    flag_modified(site, "config")
    db.commit()


def _generate_id() -> str:
    return f"tmpl_{uuid.uuid4().hex[:10]}"


# ── Routes ───────────────────────────────────────────────────────────────


@router.get("/{slug}/design-templates")
def list_templates(slug: str, _: CurrentUser, db: DbSession) -> dict[str, Any]:
    """List the site's design-attribute templates."""
    site = _site_or_404(slug, db)
    return {"templates": _read_templates(site)}


@router.put("/{slug}/design-templates")
def replace_templates(
    slug: str,
    body: TemplatesIn,
    _: CurrentUser,
    db: DbSession,
) -> dict[str, Any]:
    """Replace the whole template list. Used by the AttributesEditor's bulk
    save path. Bounded by MAX_TEMPLATES + MAX_PAYLOAD_BYTES."""
    if len(body.templates) > MAX_TEMPLATES:
        raise HTTPException(400, f"Too many templates (max {MAX_TEMPLATES})")

    out: list[dict[str, Any]] = []
    for t in body.templates:
        d = t.model_dump(exclude_none=True)
        if not d.get("id"):
            d["id"] = _generate_id()
        out.append(d)

    import json as _json
    if len(_json.dumps(out)) > MAX_PAYLOAD_BYTES:
        raise HTTPException(400, "Templates payload too large")

    site = _site_or_404(slug, db)
    _write_templates(site, out, db)
    return {"templates": out, "count": len(out)}


@router.post("/{slug}/design-templates", status_code=201)
def create_template(
    slug: str,
    body: Template,
    _: CurrentUser,
    db: DbSession,
) -> dict[str, Any]:
    """Append a single template; auto-generate the id if missing.
    Mirrors the AttributesEditor's ⎘ save-as-template button. Idempotent
    on (id) — passing an existing id replaces that template."""
    site = _site_or_404(slug, db)
    existing = _read_templates(site)
    if len(existing) >= MAX_TEMPLATES:
        raise HTTPException(400, f"Site at template cap ({MAX_TEMPLATES})")

    new = body.model_dump(exclude_none=True)
    if not new.get("id"):
        new["id"] = _generate_id()
    elif not SAFE_ID.match(new["id"]):
        raise HTTPException(400, "Invalid template id")

    out = [t for t in existing if t.get("id") != new["id"]]
    out.append(new)
    _write_templates(site, out, db)
    return {"template": new}


@router.delete("/{slug}/design-templates/{template_id}", status_code=204)
def delete_template(
    slug: str,
    template_id: str,
    _: CurrentUser,
    db: DbSession,
) -> None:
    if not SAFE_ID.match(template_id):
        raise HTTPException(400, "Invalid template id")
    site = _site_or_404(slug, db)
    existing = _read_templates(site)
    out = [t for t in existing if t.get("id") != template_id]
    if len(out) == len(existing):
        raise HTTPException(404, f"Template '{template_id}' not found")
    _write_templates(site, out, db)
