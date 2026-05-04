"""mighty_spatial — spatial operations that dispatch by dialect where needed.

Most `ST_*` functions work identically on both PostGIS and SpatiaLite via
GeoAlchemy2's `func.ST_*`; this package wraps the few that do not (e.g.
`ST_MakeValid`, spatial index creation, reprojection views, raster ops).

Core principle: storage in native projected CRS + VIEW that reprojects to
EPSG:4326 on the fly. See `views.py` and
`docs/architecture/crs-storage-and-views.md` in the platform repo.
"""

__version__ = "0.1.0"

from .indexes import create_spatial_index
from .views import create_reproject_view, drop_reproject_view

__all__ = [
    "create_spatial_index",
    "create_reproject_view",
    "drop_reproject_view",
]
