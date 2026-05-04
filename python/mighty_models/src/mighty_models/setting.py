"""App settings — key/value store for runtime-configurable knobs.

Single table, one row per setting. The ``is_public`` flag controls
exposure: public keys (e.g. login splash text, overview camera) ship
unauthenticated to the login page + overview map; non-public keys
require an authenticated request and are reserved for things like the
Cesium Ion token, OAuth client IDs, licence info.

Stored as JSON so a value can be a string, number, bool, null, or
nested object. The API layer is responsible for shape validation per
key — there's no schema enforcement at the DB level on purpose, since
new settings come and go faster than migrations should.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from .site import Base
from .types import JSONType


class Setting(Base):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(255), primary_key=True)
    value: Mapped[object] = mapped_column(JSONType, nullable=True)
    is_public: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Setting {self.key} public={self.is_public}>"
