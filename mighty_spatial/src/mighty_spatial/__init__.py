"""mighty_spatial — spatial operations that dispatch by dialect where needed.

Most `ST_*` functions work identically on both PostGIS and SpatiaLite via
GeoAlchemy2's `func.ST_*`; this package wraps the few that do not (e.g.
`ST_MakeValid`, spatial index creation, raster operations).
"""

__version__ = "0.1.0"

from .indexes import create_spatial_index

__all__ = ["create_spatial_index"]
