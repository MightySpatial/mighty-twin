"""mighty_db — SQLAlchemy engine and session factory for Mighty backends.

Exposes:
- `get_engine(database_url)` — builds an engine, loading the SpatiaLite
  extension when the URL is SQLite-backed.
- `get_session_factory(engine)` — returns a session factory suitable for
  FastAPI dependency injection.
- `spatialite.load_spatialite_ext(engine)` — hook registered on engine
  `connect` events when SQLite is the target dialect.

Details land as code is extracted from MightyTwin.
"""

__version__ = "0.1.0"
