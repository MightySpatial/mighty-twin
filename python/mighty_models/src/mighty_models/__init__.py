"""mighty_models — SQLAlchemy 2.0 models with dialect-neutral type decorators.

Models here compile to the right SQL on both SQLite/SpatiaLite and PostGIS
thanks to `GUID` and `JSONType` type decorators in `types.py`. Geometry
columns use GeoAlchemy2's `Geometry(srid=4326)` which both dialects support.

Schemas (Pydantic v2) live alongside models in `schemas.py` for API
contracts; the Frontend Zod/TS types are auto-generated from the FastAPI
OpenAPI spec.

Core principle: Site.storage_srid declares the native projected CRS for a
site's feature tables. Reprojection to 4326 for the globe happens via a
companion VIEW — see `mighty_spatial.views.create_reproject_view`.
"""

__version__ = "0.1.0"

from .types import GUID, JSONType
from .site import Base, Site

__all__ = ["GUID", "JSONType", "Base", "Site"]
