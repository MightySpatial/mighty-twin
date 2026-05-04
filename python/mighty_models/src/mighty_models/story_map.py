"""StoryMap model — guided narrative bound to a site.

Each StoryMap is a sequence of "slides" (camera state + caption + layer
toggles) that play through to walk a viewer through a site's story. The
slides shape rotates, so we keep them in a JSONB array; future migrations
can normalise if needed.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .site import Base, Site
from .types import GUID, JSONType


class StoryMap(Base):
    __tablename__ = "story_maps"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    site_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False, index=True
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)

    is_published: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    #: List of {camera, caption, layer_states, ...}
    slides: Mapped[list] = mapped_column(JSONType, nullable=False, default=list)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    site: Mapped[Site] = relationship()

    def __repr__(self) -> str:  # pragma: no cover
        return f"<StoryMap {self.name!r} site={self.site_id}>"
