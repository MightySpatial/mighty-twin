"""MightyTwin API — FastAPI + PostgreSQL/PostGIS.

Enterprise on-prem backend. Seed site is Forrest Airport (Space Angel),
storing features in EPSG:28350 (MGA2020 Zone 50). The _wgs84 reprojection
view exposes the same features in 4326 for the Cesium viewer.
"""

from __future__ import annotations

from fastapi import FastAPI

app = FastAPI(
    title="MightyTwin API",
    version="0.1.0",
    description="Enterprise on-prem digital twin — PostGIS backend.",
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "app": "mighty-twin"}


@app.get("/api/sites")
def list_sites() -> dict[str, object]:
    """Seed response — replaced by mighty_models.Site queries once the
    database + license validation are wired up.

    Note storage_srid=28350: Forrest Airport's feature tables store in
    MGA2020 Zone 50 for survey-grade precision. The viewer reads from the
    _wgs84 reprojection view so the frontend stays CRS-agnostic.
    """
    return {
        "data": [
            {
                "id": "space-angel",
                "slug": "forrest-airport",
                "name": "Forrest Airport — Spaceport Operations",
                "storage_srid": 28350,
                "center": {"longitude": 128.12, "latitude": -30.85},
            },
        ],
    }
