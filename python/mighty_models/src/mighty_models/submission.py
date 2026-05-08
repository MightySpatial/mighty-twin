"""Design submission — Phase T (T+120).

User-facing flow: a user sketches features in the Design widget, then
submits them as a "submission" pending admin approval. Once approved (and
optionally promoted into a real layer), the features become part of the
site's authoritative dataset.

The features are snapshotted as JSON at submit time so the submission
remains intact even if the source SketchLayer is later deleted or edited.
``schema_changes`` captures any new attribute fields the submitter
introduced — admins can review and tweak before promotion.

Status transitions (enforced at the API layer):
    pending → approved
    pending → rejected
    approved → promoted (one-shot, requires target_layer_id)
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from .site import Base
from .types import GUID, JSONType


class Submission(Base):
    __tablename__ = "submissions"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)

    site_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False, index=True
    )
    submitter_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    #: Optional pointer back to the live sketch layer. Surface-only —
    #: the submission keeps its own snapshot so deletion of the sketch
    #: doesn't orphan the submission.
    sketch_layer_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(),
        ForeignKey("sketch_layers.id", ondelete="SET NULL"),
        nullable=True,
    )

    #: 'pending' | 'approved' | 'rejected' | 'promoted'.
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")

    #: Snapshot of the sketch features at submit time (list of dicts,
    #: same shape as SketchLayer.features).
    features: Mapped[list] = mapped_column(JSONType, nullable=False, default=list)

    #: Suggested attribute changes — list of {field, from, to} entries.
    schema_changes: Mapped[list] = mapped_column(JSONType, nullable=False, default=list)

    #: Optional submitter notes — free-form context for the reviewer.
    notes: Mapped[str | None] = mapped_column(String, nullable=True)

    #: Reason / comment captured at review time.
    review_notes: Mapped[str | None] = mapped_column(String, nullable=True)
    reviewed_by_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    #: Set when the submission is promoted into a target layer.
    promoted_layer_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(),
        ForeignKey("layers.id", ondelete="SET NULL"),
        nullable=True,
    )
    promoted_feature_count: Mapped[int | None] = mapped_column(Integer, nullable=True)

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
        return f"<Submission {self.id} status={self.status}>"
