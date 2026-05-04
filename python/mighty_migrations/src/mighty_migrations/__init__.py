"""mighty_migrations — shared Alembic migration tree.

Both MightyLite (SQLite) and MightyTwin (PostGIS) point their
``alembic.ini`` at this package's ``env.py``. Each consumer injects its
``DATABASE_URL`` via the environment; Alembic's dialect branches handle
the divergence between SQLite/SpatiaLite and PostgreSQL/PostGIS.

Example consumer alembic.ini::

    [alembic]
    script_location = %(here)s/.venv/lib/python3.12/site-packages/mighty_migrations
    sqlalchemy.url = ${DATABASE_URL}

The first committed migration (20260416_0001) creates ``sites`` +
``features`` + the ``features_wgs84`` reprojection VIEW — the proof of
the CRS storage-and-view pattern end-to-end.
"""

from importlib import resources
from pathlib import Path

__version__ = "0.1.0"


def script_location() -> str:
    """Absolute path to this package's Alembic environment. Consumer apps
    use this in their alembic.ini programmatic setup.

    Example::

        from alembic.config import Config
        from mighty_migrations import script_location

        cfg = Config()
        cfg.set_main_option("script_location", script_location())
    """
    here = Path(str(resources.files("mighty_migrations"))).resolve()
    return str(here)


__all__ = ["script_location"]
