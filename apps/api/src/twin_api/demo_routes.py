"""Demo site seeder — T+1600.

Creates a small, generic "Demo site" so a fresh install isn't an
empty graveyard the moment the admin signs in. The geometry is
synthetic (handful of points + a polyline + a polygon around Sydney
Harbour as a recognisable benchmark) so anyone trying the product
sees immediate visual feedback.

Idempotent: a second call with the existing slug returns 409 unless
``force=true`` is passed. Triggered from the FirstSiteHero on the
empty Sites page so users have a one-click "show me what this looks
like" path.
"""

from __future__ import annotations

import json
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, text

from mighty_models import DataSource, Layer, Site

from .auth import AdminUser
from .db import DbSession

router = APIRouter(prefix="/api/setup", tags=["demo"])

DEMO_SLUG = "demo-site"


# ── Synthetic demo data ─────────────────────────────────────────────────


_LANDMARKS = [
    {
        "name": "Sydney Opera House",
        "lon": 151.2153,
        "lat": -33.8568,
        "kind": "icon",
    },
    {
        "name": "Harbour Bridge — south pylon",
        "lon": 151.2106,
        "lat": -33.8525,
        "kind": "icon",
    },
    {
        "name": "Circular Quay",
        "lon": 151.2103,
        "lat": -33.8612,
        "kind": "transit",
    },
    {
        "name": "Royal Botanic Garden",
        "lon": 151.2168,
        "lat": -33.8642,
        "kind": "park",
    },
    {
        "name": "Mrs Macquarie's Chair",
        "lon": 151.2225,
        "lat": -33.8616,
        "kind": "lookout",
    },
]


_HARBOUR_BRIDGE_LINE = [
    [151.2061, -33.8523],
    [151.2079, -33.8515],
    [151.2102, -33.8523],
    [151.2126, -33.8536],
    [151.2143, -33.8547],
    [151.2153, -33.8559],
]


_BOTANIC_GARDEN_POLYGON = [
    [
        [151.2126, -33.8623],
        [151.2208, -33.8615],
        [151.2229, -33.8636],
        [151.2230, -33.8662],
        [151.2208, -33.8682],
        [151.2155, -33.8688],
        [151.2122, -33.8665],
        [151.2113, -33.8645],
        [151.2126, -33.8623],
    ]
]


# ── Endpoint ────────────────────────────────────────────────────────────


class DemoBody(BaseModel):
    force: bool = False


@router.post("/load-demo", status_code=201)
def load_demo(body: DemoBody, _: AdminUser, db: DbSession) -> dict[str, Any]:
    existing = db.execute(select(Site).where(Site.slug == DEMO_SLUG)).scalar_one_or_none()
    if existing is not None:
        if not body.force:
            raise HTTPException(
                status_code=409,
                detail=f"Demo site already exists at /admin/sites/{DEMO_SLUG}. Pass force=true to recreate.",
            )
        db.delete(existing)
        db.flush()

    site = Site(
        slug=DEMO_SLUG,
        name="Demo site",
        description=(
            "A synthetic demo around Sydney Harbour to show off layers, "
            "feature popups, attribute editing, story maps, and snapshots. "
            "Delete it whenever you're ready for the real thing."
        ),
        storage_srid=4326,
        is_public_pre_login=False,
        config={
            "primary_color": "#2453ff",
            "default_camera": {
                "longitude": 151.215,
                "latitude": -33.859,
                "height": 4500,
            },
            "demo_seed": True,
        },
    )
    db.add(site)
    db.flush()

    # Three layers: landmarks (points), bridge (line), garden (polygon).
    landmarks_ds = DataSource(
        id=uuid.uuid4(),
        name="Demo landmarks",
        type="geojson",
        attributes={"source": "demo_seed", "count": len(_LANDMARKS)},
    )
    bridge_ds = DataSource(
        id=uuid.uuid4(),
        name="Demo route",
        type="geojson",
        attributes={"source": "demo_seed", "count": 1},
    )
    garden_ds = DataSource(
        id=uuid.uuid4(),
        name="Demo zone",
        type="geojson",
        attributes={"source": "demo_seed", "count": 1},
    )
    db.add_all([landmarks_ds, bridge_ds, garden_ds])

    landmarks_layer = Layer(
        id=uuid.uuid4(),
        site_id=site.id,
        data_source_id=landmarks_ds.id,
        name="Landmarks",
        type="vector",
        visible=1,
        opacity=1.0,
        display_order=2,
        style={"strokeColor": "#fbbf24", "fillColor": "#fbbf24", "pointSize": 14, "opacity": 0.95},
        layer_metadata={"source": "demo_seed"},
    )
    bridge_layer = Layer(
        id=uuid.uuid4(),
        site_id=site.id,
        data_source_id=bridge_ds.id,
        name="Harbour bridge route",
        type="vector",
        visible=1,
        opacity=1.0,
        display_order=1,
        style={"strokeColor": "#9bb3ff", "lineWidth": 4, "opacity": 0.92},
        layer_metadata={"source": "demo_seed"},
    )
    garden_layer = Layer(
        id=uuid.uuid4(),
        site_id=site.id,
        data_source_id=garden_ds.id,
        name="Royal Botanic Garden",
        type="vector",
        visible=1,
        opacity=0.7,
        display_order=0,
        style={
            "strokeColor": "#34d399",
            "fillColor": "#34d399",
            "lineWidth": 2,
            "opacity": 0.6,
        },
        layer_metadata={"source": "demo_seed"},
    )
    db.add_all([landmarks_layer, bridge_layer, garden_layer])
    db.flush()

    inserted = 0
    inserted += _insert_features(
        db,
        site_id=site.id,
        layer_id=landmarks_layer.id,
        storage_srid=site.storage_srid,
        features=[
            {
                "geometry": {
                    "type": "Point",
                    "coordinates": [lm["lon"], lm["lat"]],
                },
                "properties": {
                    "name": lm["name"],
                    "kind": lm["kind"],
                    "_demo": True,
                },
            }
            for lm in _LANDMARKS
        ],
    )
    inserted += _insert_features(
        db,
        site_id=site.id,
        layer_id=bridge_layer.id,
        storage_srid=site.storage_srid,
        features=[
            {
                "geometry": {
                    "type": "LineString",
                    "coordinates": _HARBOUR_BRIDGE_LINE,
                },
                "properties": {
                    "name": "Sydney Harbour Bridge",
                    "category": "transport",
                    "length_m": 1149,
                    "_demo": True,
                },
            }
        ],
    )
    inserted += _insert_features(
        db,
        site_id=site.id,
        layer_id=garden_layer.id,
        storage_srid=site.storage_srid,
        features=[
            {
                "geometry": {
                    "type": "Polygon",
                    "coordinates": _BOTANIC_GARDEN_POLYGON,
                },
                "properties": {
                    "name": "Royal Botanic Garden",
                    "category": "open-space",
                    "area_ha": 30,
                    "_demo": True,
                },
            }
        ],
    )

    db.commit()
    return {
        "site_slug": DEMO_SLUG,
        "site_id": str(site.id),
        "layers": 3,
        "features": inserted,
    }


def _insert_features(
    db: DbSession,
    *,
    site_id: uuid.UUID,
    layer_id: uuid.UUID,
    storage_srid: int,
    features: list[dict[str, Any]],
) -> int:
    bind = db.get_bind()
    is_postgis = bind.dialect.name == "postgresql"
    if is_postgis:
        stmt = text(
            """
            INSERT INTO features (id, site_id, layer_id, geom, properties)
            VALUES (
                :id, :site_id, :layer_id,
                ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(:geojson), 4326), :storage_srid),
                CAST(:properties AS jsonb)
            )
            """
        )
    else:
        stmt = text(
            """
            INSERT INTO features (id, site_id, layer_id, geom, properties)
            VALUES (
                :id, :site_id, :layer_id,
                Transform(SetSRID(GeomFromGeoJSON(:geojson), 4326), :storage_srid),
                :properties
            )
            """
        )
    n = 0
    for f in features:
        db.execute(
            stmt,
            {
                "id": str(uuid.uuid4()),
                "site_id": str(site_id),
                "layer_id": str(layer_id),
                "geojson": json.dumps(f["geometry"]),
                "storage_srid": storage_srid,
                "properties": json.dumps(f.get("properties") or {}),
            },
        )
        n += 1
    return n
