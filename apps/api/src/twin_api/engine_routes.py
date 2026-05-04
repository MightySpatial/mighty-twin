"""Settings → Engine + Workspace admin endpoints — Phases Q/R/S.

Backed by app_settings (Phase C key/value store). Three structured keys:

  autodetect_rules    Engine — symbology / sublayer / label / pipes / hover
                      field-detection rules used by the data-import
                      pipeline. Object: { symbology: {...}, sublayer: {...},
                      label: {...}, pipes: {...}, hover: {...} }.

  branding            Workspace admin — customer logo + name + gradient.
                      { name, initials, gradient: [hex, hex] } or null.
                      Public (login splash + public viewer use it).

  widget_layout       Engine — per-widget controller/position/loadMode/
                      defaultSize overrides keyed by widget id. Object:
                      { [widget_id]: Partial<WidgetDef> }. Per-site
                      overrides land in sites.config.layout via the
                      deferred Atlas Site Layout Designer.

Each key has a default object the API ensures exists on first read so
the frontend never has to handle the "absent" case for these structured
settings.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from sqlalchemy import select

from mighty_models import Setting

from .auth import AdminUser
from .db import DbSession

router = APIRouter(tags=["engine-settings"])

# ── Default values ─────────────────────────────────────────────────────


DEFAULT_AUTODETECT_RULES: dict[str, Any] = {
    "symbology": {
        "field_patterns": ["category", "type", "class", "kind"],
        "fallback": "single",
    },
    "sublayer": {
        "field_patterns": ["sublayer", "subtype", "subclass"],
        "fallback": None,
    },
    "label": {
        "field_patterns": ["name", "label", "title", "id"],
        "expression_template": "{value}",
        "global_caching": True,
    },
    "pipes": {
        "diameter_fields": ["diameter", "diam", "dia", "od_mm", "nominal_diameter"],
        "depth_fields": ["depth", "invert_level", "invert", "cover"],
        "wall_thickness_fields": ["wall_thickness", "wall", "wt"],
        "default_units": "mm",
    },
    "hover": {
        "field_patterns": ["tooltip", "popup", "hover", "name", "label"],
    },
}


DEFAULT_BRANDING: dict[str, Any] | None = None  # null = MightyTwin primary


DEFAULT_WIDGET_LAYOUT: dict[str, Any] = {}  # empty = use registry defaults


# ── Read helpers ────────────────────────────────────────────────────────


def _read_or_default(
    db, key: str, default: Any, is_public: bool = False
) -> Any:
    row = db.execute(select(Setting).where(Setting.key == key)).scalar_one_or_none()
    if row is None:
        row = Setting(key=key, value=default, is_public=is_public)
        db.add(row)
        db.commit()
        return default
    return row.value


# ── Autodetect rules (Engine) ───────────────────────────────────────────


@router.get("/api/engine/autodetect-rules")
def get_autodetect_rules(_: AdminUser, db: DbSession) -> dict[str, Any]:
    return _read_or_default(db, "autodetect_rules", DEFAULT_AUTODETECT_RULES)


@router.put("/api/engine/autodetect-rules")
def put_autodetect_rules(
    body: dict[str, Any], _: AdminUser, db: DbSession
) -> dict[str, Any]:
    row = db.execute(
        select(Setting).where(Setting.key == "autodetect_rules")
    ).scalar_one_or_none()
    if row is None:
        row = Setting(key="autodetect_rules", value=body, is_public=False)
        db.add(row)
    else:
        row.value = body
    db.commit()
    return body


# ── Branding (Workspace admin, public) ─────────────────────────────────


@router.get("/api/workspace/branding")
def get_branding(db: DbSession) -> dict[str, Any] | None:
    """Public — login splash + public viewers need branding pre-auth."""
    return _read_or_default(db, "branding", DEFAULT_BRANDING, is_public=True)


@router.put("/api/workspace/branding")
def put_branding(
    body: dict[str, Any] | None, _: AdminUser, db: DbSession
) -> dict[str, Any] | None:
    row = db.execute(
        select(Setting).where(Setting.key == "branding")
    ).scalar_one_or_none()
    if row is None:
        row = Setting(key="branding", value=body, is_public=True)
        db.add(row)
    else:
        row.value = body
        row.is_public = True
    db.commit()
    return body


# ── Widget layout (Engine) ─────────────────────────────────────────────


@router.get("/api/engine/widget-layout")
def get_widget_layout(_: AdminUser, db: DbSession) -> dict[str, Any]:
    return _read_or_default(db, "widget_layout", DEFAULT_WIDGET_LAYOUT)


@router.put("/api/engine/widget-layout")
def put_widget_layout(
    body: dict[str, Any], _: AdminUser, db: DbSession
) -> dict[str, Any]:
    row = db.execute(
        select(Setting).where(Setting.key == "widget_layout")
    ).scalar_one_or_none()
    if row is None:
        row = Setting(key="widget_layout", value=body, is_public=False)
        db.add(row)
    else:
        row.value = body
    db.commit()
    return body
