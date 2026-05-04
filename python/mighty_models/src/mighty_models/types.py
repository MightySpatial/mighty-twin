"""Dialect-neutral SQLAlchemy type decorators.

`GUID` and `JSONType` let the same model definition run on both SQLite
and PostgreSQL without dropping to lowest-common-denominator strings.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import JSON, String
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.types import TypeDecorator


class GUID(TypeDecorator[uuid.UUID]):
    """Platform-independent UUID.

    PostgreSQL: native `UUID`. SQLite: `CHAR(36)` string.
    """

    impl = String
    cache_ok = True

    def load_dialect_impl(self, dialect: Any) -> Any:
        if dialect.name == "postgresql":
            return dialect.type_descriptor(PG_UUID(as_uuid=True))
        return dialect.type_descriptor(String(36))

    def process_bind_param(self, value: Any, dialect: Any) -> Any:
        if value is None:
            return None
        if dialect.name == "postgresql":
            return value
        return str(value) if not isinstance(value, str) else value

    def process_result_value(self, value: Any, dialect: Any) -> uuid.UUID | None:
        if value is None:
            return None
        return value if isinstance(value, uuid.UUID) else uuid.UUID(value)


class JSONType(TypeDecorator[Any]):
    """Platform-independent JSON. PostgreSQL: `JSONB`. SQLite: `JSON`."""

    impl = JSON
    cache_ok = True

    def load_dialect_impl(self, dialect: Any) -> Any:
        if dialect.name == "postgresql":
            return dialect.type_descriptor(JSONB())
        return dialect.type_descriptor(JSON())
