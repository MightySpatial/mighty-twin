"""User model.

Roles map directly to the frontend's `UserRole` type:
  - admin   — full access incl. user/site management
  - creator — can create/edit content within sites they have access to
  - viewer  — read-only

Password column is nullable so OAuth-only users (Google/Microsoft) can
exist without a local password. Local password auth uses bcrypt; the
hashed_password column stores the bcrypt digest.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Literal

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from .site import Base
from .types import GUID

UserRole = Literal["admin", "creator", "viewer"]


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    #: bcrypt hash. Nullable for OAuth-only accounts (no local password set).
    hashed_password: Mapped[str | None] = mapped_column(String(255), nullable=True)

    #: 'admin' | 'creator' | 'viewer'. Stored as plain string to keep the
    #: column dialect-neutral (no Postgres ENUM).
    role: Mapped[str] = mapped_column(String(32), nullable=False, default="viewer")

    avatar_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

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

    def __repr__(self) -> str:  # pragma: no cover
        return f"<User {self.email} role={self.role}>"
