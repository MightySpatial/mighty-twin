"""Admin upload parser — Phase F.

Server-side ingestion of CSV / GeoJSON / XLSX into a DataSource row.
Files land in /tmp/twin-uploads/ (good enough for local dev; Railway
deploy switches to S3-compatible object storage in Phase J).

Pipeline:
  1. multipart/form-data POST to /api/upload  (admin only)
  2. detect type by extension (csv | geojson | xlsx)
  3. parse → infer attribute schema (columns + types)
  4. persist DataSource row referencing the on-disk file
  5. return the new DataSource so the frontend can wire a Layer to it
"""

from __future__ import annotations

import csv
import io
import json
import os
import uuid
from pathlib import Path
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from mighty_models import DataSource

from .auth import get_current_user, require_admin
from .db import get_db

UPLOAD_DIR = Path(os.environ.get("TWIN_UPLOAD_DIR", "/tmp/twin-uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

router = APIRouter(tags=["upload"])

MAX_BYTES = 50 * 1024 * 1024  # 50 MB cap per file


@router.post("/api/upload", status_code=201)
async def upload(
    file: Annotated[UploadFile, File(...)],
    name: Annotated[str | None, Form()] = None,
    _admin = Depends(lambda u=Depends(get_current_user): require_admin(u)),
    db = Depends(get_db),
) -> dict[str, Any]:
    raw = await file.read()
    if len(raw) > MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds {MAX_BYTES // (1024*1024)}MB cap",
        )
    fname = file.filename or "upload"
    ext = (fname.rsplit(".", 1)[-1] or "").lower()

    parsed: dict[str, Any]
    type_: str
    if ext in {"geojson", "json"}:
        parsed = _parse_geojson(raw)
        type_ = "geojson"
    elif ext == "csv":
        parsed = _parse_csv(raw)
        type_ = "csv"
    elif ext in {"xlsx", "xlsm"}:
        parsed = _parse_xlsx(raw)
        type_ = "xlsx"
    else:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported extension {ext!r}; expected csv/geojson/xlsx",
        )

    uid = uuid.uuid4()
    out_path = UPLOAD_DIR / f"{uid}-{fname}"
    out_path.write_bytes(raw)

    ds = DataSource(
        id=uid,
        name=name or fname,
        type=type_,
        url=str(out_path),
        size_bytes=len(raw),
        attributes={
            "schema": parsed.get("schema", []),
            "feature_count": parsed.get("count", 0),
            "preview": parsed.get("preview", []),
        },
    )
    db.add(ds)
    db.commit()
    db.refresh(ds)

    return {
        "id": str(ds.id),
        "name": ds.name,
        "type": ds.type,
        "url": ds.url,
        "size_bytes": ds.size_bytes,
        "attributes": ds.attributes,
    }


# ── Parsers ─────────────────────────────────────────────────────────────


def _parse_geojson(raw: bytes) -> dict[str, Any]:
    try:
        doc = json.loads(raw)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Invalid GeoJSON: {e}")
    features = doc.get("features", []) if isinstance(doc, dict) else []
    schema_keys: dict[str, str] = {}
    for f in features[:100]:
        for k, v in (f.get("properties") or {}).items():
            schema_keys.setdefault(k, _typeof(v))
    schema = [{"name": k, "type": t} for k, t in schema_keys.items()]
    return {
        "schema": schema,
        "count": len(features),
        "preview": features[:5],
    }


def _parse_csv(raw: bytes) -> dict[str, Any]:
    text = raw.decode("utf-8", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    rows = list(reader)
    schema = [{"name": h, "type": "text"} for h in (reader.fieldnames or [])]
    for col in schema:
        sampled = [r.get(col["name"], "") for r in rows[:50]]
        col["type"] = _column_type(sampled)
    return {"schema": schema, "count": len(rows), "preview": rows[:5]}


def _parse_xlsx(raw: bytes) -> dict[str, Any]:
    from openpyxl import load_workbook

    wb = load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
    ws = wb.active
    if ws is None:
        return {"schema": [], "count": 0, "preview": []}
    rows_iter = ws.iter_rows(values_only=True)
    headers_row = next(rows_iter, ())
    headers = [str(h) if h is not None else f"col_{i}" for i, h in enumerate(headers_row)]
    rows: list[dict[str, Any]] = []
    for r in rows_iter:
        rows.append({h: v for h, v in zip(headers, r)})
    schema = [
        {"name": h, "type": _column_type([r.get(h) for r in rows[:50]])}
        for h in headers
    ]
    return {"schema": schema, "count": len(rows), "preview": rows[:5]}


def _typeof(v: Any) -> str:
    if isinstance(v, bool):
        return "boolean"
    if isinstance(v, int):
        return "integer"
    if isinstance(v, float):
        return "real"
    return "text"


def _column_type(sample: list[Any]) -> str:
    nonblank = [v for v in sample if v not in (None, "")]
    if not nonblank:
        return "text"
    try:
        for v in nonblank:
            int(str(v))
        return "integer"
    except (ValueError, TypeError):
        pass
    try:
        for v in nonblank:
            float(str(v))
        return "real"
    except (ValueError, TypeError):
        pass
    if all(str(v).lower() in {"true", "false", "0", "1", "yes", "no"} for v in nonblank):
        return "boolean"
    return "text"
