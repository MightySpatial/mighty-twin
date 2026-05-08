"""Library — Phase P.

Folder CRUD + item CRUD + bulk ops. Max-depth enforcement at the API
layer; uniqueness enforced via DB constraint (parent_id, slug).

  GET    /api/library/folders                 — flat list of all folders + their depth
  GET    /api/library/folders/tree             — nested tree (children inline)
  POST   /api/library/folders                  — create (admin)
  PATCH  /api/library/folders/{id}              — rename / move
  DELETE /api/library/folders/{id}              — delete (cascades to items via FK)
  GET    /api/library/items?folder_id=…         — list items in a folder
  POST   /api/library/items                     — create item record
  PATCH  /api/library/items/{id}                — rename / move
  DELETE /api/library/items/{id}                — delete
  POST   /api/library/items/bulk                — bulk move/delete
"""

from __future__ import annotations

import re
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from mighty_models import LIBRARY_MAX_DEPTH, LibraryFolder, LibraryItem

from .auth import AdminUser, CurrentUser
from .db import DbSession

router = APIRouter(prefix="/api/library", tags=["library"])

SLUG_RE = re.compile(r"[^a-z0-9-]+")


def _slugify(name: str) -> str:
    return SLUG_RE.sub("-", name.lower()).strip("-") or "folder"


def _serialize_folder(f: LibraryFolder) -> dict[str, Any]:
    return {
        "id": str(f.id),
        "parent_id": str(f.parent_id) if f.parent_id else None,
        "name": f.name,
        "slug": f.slug,
        "depth": f.depth,
    }


def _serialize_item(i: LibraryItem) -> dict[str, Any]:
    return {
        "id": str(i.id),
        "folder_id": str(i.folder_id) if i.folder_id else None,
        "name": i.name,
        "kind": i.kind,
        "url": i.url,
        "size_bytes": i.size_bytes,
        "metadata": i.item_metadata or {},
        "created_at": i.created_at.isoformat() if i.created_at else None,
    }


# ── Folders ─────────────────────────────────────────────────────────────


class FolderCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    parent_id: str | None = None


class FolderUpdate(BaseModel):
    name: str | None = None
    parent_id: str | None = None


@router.get("/folders")
def list_folders(_: CurrentUser, db: DbSession) -> list[dict[str, Any]]:
    rows = db.execute(select(LibraryFolder).order_by(LibraryFolder.name)).scalars().all()
    return [_serialize_folder(f) for f in rows]


@router.get("/folders/tree")
def folder_tree(_: CurrentUser, db: DbSession) -> list[dict[str, Any]]:
    rows = db.execute(select(LibraryFolder)).scalars().all()
    by_parent: dict[uuid.UUID | None, list[LibraryFolder]] = {}
    for f in rows:
        by_parent.setdefault(f.parent_id, []).append(f)

    def build(parent_id: uuid.UUID | None) -> list[dict[str, Any]]:
        return [
            {
                **_serialize_folder(f),
                "children": build(f.id),
            }
            for f in sorted(by_parent.get(parent_id, []), key=lambda x: x.name)
        ]

    return build(None)


@router.post("/folders", status_code=201)
def create_folder(
    body: FolderCreate, _: AdminUser, db: DbSession
) -> dict[str, Any]:
    parent: LibraryFolder | None = None
    if body.parent_id:
        parent = db.execute(
            select(LibraryFolder).where(LibraryFolder.id == uuid.UUID(body.parent_id))
        ).scalar_one_or_none()
        if parent is None:
            raise HTTPException(status_code=404, detail="Parent folder not found")
        if parent.depth + 1 >= LIBRARY_MAX_DEPTH:
            raise HTTPException(
                status_code=400,
                detail=f"Max library depth {LIBRARY_MAX_DEPTH} reached",
            )
    f = LibraryFolder(
        parent_id=parent.id if parent else None,
        name=body.name,
        slug=_slugify(body.name),
        depth=(parent.depth + 1) if parent else 0,
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    return _serialize_folder(f)


@router.patch("/folders/{folder_id}")
def update_folder(
    folder_id: str, body: FolderUpdate, _: AdminUser, db: DbSession
) -> dict[str, Any]:
    f = db.execute(
        select(LibraryFolder).where(LibraryFolder.id == uuid.UUID(folder_id))
    ).scalar_one_or_none()
    if f is None:
        raise HTTPException(status_code=404, detail="Folder not found")
    if body.name is not None:
        f.name = body.name
        f.slug = _slugify(body.name)
    if body.parent_id is not None:
        if body.parent_id == folder_id:
            raise HTTPException(status_code=400, detail="Folder cannot be its own parent")
        if body.parent_id == "":
            f.parent_id = None
            f.depth = 0
        else:
            parent = db.execute(
                select(LibraryFolder).where(LibraryFolder.id == uuid.UUID(body.parent_id))
            ).scalar_one_or_none()
            if parent is None:
                raise HTTPException(status_code=404, detail="New parent folder not found")
            if parent.depth + 1 >= LIBRARY_MAX_DEPTH:
                raise HTTPException(
                    status_code=400,
                    detail=f"Move would exceed max depth {LIBRARY_MAX_DEPTH}",
                )
            f.parent_id = parent.id
            f.depth = parent.depth + 1
    db.commit()
    db.refresh(f)
    return _serialize_folder(f)


@router.delete("/folders/{folder_id}", status_code=204)
def delete_folder(folder_id: str, _: AdminUser, db: DbSession) -> None:
    f = db.execute(
        select(LibraryFolder).where(LibraryFolder.id == uuid.UUID(folder_id))
    ).scalar_one_or_none()
    if f is None:
        raise HTTPException(status_code=404, detail="Folder not found")
    db.delete(f)
    db.commit()


# ── Items ───────────────────────────────────────────────────────────────


class ItemCreate(BaseModel):
    folder_id: str | None = None
    name: str
    kind: str = "other"
    url: str | None = None
    size_bytes: int | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class ItemUpdate(BaseModel):
    folder_id: str | None = None
    name: str | None = None
    kind: str | None = None
    metadata: dict[str, Any] | None = None


@router.get("/items")
def list_items(
    _: CurrentUser, db: DbSession, folder_id: str | None = None
) -> list[dict[str, Any]]:
    stmt = select(LibraryItem)
    if folder_id == "root" or folder_id is None:
        stmt = stmt.where(LibraryItem.folder_id.is_(None))
    else:
        stmt = stmt.where(LibraryItem.folder_id == uuid.UUID(folder_id))
    rows = db.execute(stmt.order_by(LibraryItem.name)).scalars().all()
    return [_serialize_item(i) for i in rows]


@router.post("/items", status_code=201)
def create_item(body: ItemCreate, _: AdminUser, db: DbSession) -> dict[str, Any]:
    folder_id = uuid.UUID(body.folder_id) if body.folder_id else None
    if folder_id is not None:
        f = db.execute(
            select(LibraryFolder).where(LibraryFolder.id == folder_id)
        ).scalar_one_or_none()
        if f is None:
            raise HTTPException(status_code=404, detail="Folder not found")
    item = LibraryItem(
        folder_id=folder_id,
        name=body.name,
        kind=body.kind,
        url=body.url,
        size_bytes=body.size_bytes,
        item_metadata=body.metadata,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return _serialize_item(item)


@router.patch("/items/{item_id}")
def update_item(
    item_id: str, body: ItemUpdate, _: AdminUser, db: DbSession
) -> dict[str, Any]:
    item = db.execute(
        select(LibraryItem).where(LibraryItem.id == uuid.UUID(item_id))
    ).scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="Item not found")
    if body.name is not None: item.name = body.name
    if body.kind is not None: item.kind = body.kind
    if body.metadata is not None: item.item_metadata = body.metadata
    if body.folder_id is not None:
        item.folder_id = uuid.UUID(body.folder_id) if body.folder_id else None
    db.commit()
    db.refresh(item)
    return _serialize_item(item)


@router.delete("/items/{item_id}", status_code=204)
def delete_item(item_id: str, _: AdminUser, db: DbSession) -> None:
    item = db.execute(
        select(LibraryItem).where(LibraryItem.id == uuid.UUID(item_id))
    ).scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="Item not found")
    db.delete(item)
    db.commit()


class BulkOp(BaseModel):
    item_ids: list[str]
    op: str  # 'delete' | 'move'
    target_folder_id: str | None = None


@router.post("/items/bulk")
def bulk_items(body: BulkOp, _: AdminUser, db: DbSession) -> dict[str, Any]:
    if body.op not in {"delete", "move"}:
        raise HTTPException(status_code=400, detail="op must be 'delete' or 'move'")
    ids = [uuid.UUID(i) for i in body.item_ids]
    items = (
        db.execute(select(LibraryItem).where(LibraryItem.id.in_(ids))).scalars().all()
    )
    if body.op == "delete":
        for i in items:
            db.delete(i)
    else:
        target = (
            uuid.UUID(body.target_folder_id) if body.target_folder_id else None
        )
        for i in items:
            i.folder_id = target
    db.commit()
    return {"affected": len(items)}
