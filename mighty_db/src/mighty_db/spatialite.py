"""SpatiaLite extension loader for SQLite engines.

Registers a connection listener on a SQLAlchemy engine so every new SQLite
connection loads `mod_spatialite`. This is how MightyLite (and MightyDev)
obtain `ST_*` spatial functions in SQLite.

Wire up at engine construction time:

    from sqlalchemy import create_engine, text
    from mighty_db.spatialite import load_spatialite_ext

    engine = create_engine("sqlite:///dev.db")
    load_spatialite_ext(engine)
    with engine.connect() as conn:
        conn.execute(text("SELECT InitSpatialMetaData(1)"))
        conn.commit()
"""

from __future__ import annotations

from sqlalchemy import event
from sqlalchemy.engine import Engine


def load_spatialite_ext(engine: Engine) -> None:
    """Attach a connection listener that loads mod_spatialite on each connect."""

    @event.listens_for(engine, "connect")
    def _on_connect(dbapi_connection, _):  # type: ignore[no-untyped-def]
        dbapi_connection.enable_load_extension(True)
        try:
            dbapi_connection.load_extension("mod_spatialite")
        except Exception:
            # Host may have SpatiaLite at a different path; try the common macOS
            # Homebrew location as a fallback before giving up.
            try:
                dbapi_connection.load_extension(
                    "/opt/homebrew/lib/mod_spatialite.dylib"
                )
            except Exception:
                raise RuntimeError(
                    "mod_spatialite could not be loaded. Install SpatiaLite "
                    "(macOS: `brew install libspatialite`; Debian/Ubuntu: "
                    "`apt-get install libsqlite3-mod-spatialite`)."
                ) from None
