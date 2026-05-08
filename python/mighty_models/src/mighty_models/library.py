"""Library — Phase P.

Folder-based content store for site assets (photos, documents, BIM files,
etc.). Folders nest up to LIBRARY_MAX_DEPTH levels deep; items reference
storage URLs (S3 in prod, local file system in dev) plus arbitrary
metadata. Ports the spirit of MightyDT v1's Library tab.

Hierarchy enforcement (max-depth, no-cycles, slug-uniqueness-per-parent)
happens at the API layer — the model is just relational.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .site import Base
from .types import GUID, JSONType

#: Max nested depth for library folders. Matches MightyDT's setting.
LIBRARY_MAX_DEPTH = 3


class LibraryFolder(Base):
    __tablename__ = "library_folders"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(),
        ForeignKey("library_folders.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False)
    depth: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

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

    children: Mapped[list["LibraryFolder"]] = relationship(
        "LibraryFolder", remote_side=[parent_id], viewonly=True
    )
    items: Mapped[list["LibraryItem"]] = relationship(back_populates="folder")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<LibraryFolder {self.name!r} depth={self.depth}>"


class LibraryItem(Base):
    __tablename__ = "library_items"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    folder_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(),
        ForeignKey("library_folders.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    #: 'photo' | 'document' | 'bim' | 'other'. Validated at the API layer.
    kind: Mapped[str] = mapped_column(String(64), nullable=False)
    url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    item_metadata: Mapped[dict] = mapped_column(JSONType, nullable=False, default=dict)

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

    folder: Mapped[LibraryFolder | None] = relationship(back_populates="items")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<LibraryItem {self.name!r} kind={self.kind}>"
