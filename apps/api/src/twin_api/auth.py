"""Auth — bcrypt password hashing, JWT pair (access + refresh), router.

Token model: HS256-signed JWTs. Access tokens TTL 1h, refresh 30d. The
``kind`` claim distinguishes the two so a refresh can't be used as an
access. Subject is the user UUID as a string.

Deliberately small — no OAuth callbacks yet (Google/Microsoft SSO is a
later phase), no password reset flow, no session table. Refresh tokens
are stateless: a stolen refresh token works until expiry. We can layer
revocation on top once it's needed.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal

import bcrypt
import jwt
from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select

from mighty_models import User

from .config import get_settings
from .db import DbSession

ACCESS_TTL = timedelta(hours=1)
REFRESH_TTL = timedelta(days=30)
ALGORITHM = "HS256"


# ── Password hashing ────────────────────────────────────────────────────


def hash_password(plain: str) -> str:
    """bcrypt hash, returned as a UTF-8 string for direct DB storage."""
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str | None) -> bool:
    """Constant-time compare. Returns False for any malformed hash or for
    accounts with no local password (OAuth-only)."""
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


# ── JWT helpers ─────────────────────────────────────────────────────────


def issue_token(user_id: uuid.UUID, kind: Literal["access", "refresh"]) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    ttl = ACCESS_TTL if kind == "access" else REFRESH_TTL
    payload = {
        "sub": str(user_id),
        "kind": kind,
        "iat": int(now.timestamp()),
        "exp": int((now + ttl).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def decode_token(token: str, expected_kind: Literal["access", "refresh"]) -> uuid.UUID:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired"
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
        )
    if payload.get("kind") != expected_kind:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Wrong token kind"
        )
    try:
        return uuid.UUID(payload["sub"])
    except (KeyError, ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token subject"
        )


# ── Dependencies ────────────────────────────────────────────────────────


def get_current_user(
    db: DbSession,
    authorization: Annotated[str | None, Header()] = None,
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = authorization.split(" ", 1)[1]
    user_id = decode_token(token, "access")
    user = db.execute(
        select(User).where(User.id == user_id, User.is_active.is_(True))
    ).scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_admin(user: CurrentUser) -> User:
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required"
        )
    return user


AdminUser = Annotated[User, Depends(require_admin)]


# ── Schemas ─────────────────────────────────────────────────────────────


class LoginBody(BaseModel):
    email: str
    password: str


class RefreshBody(BaseModel):
    refresh_token: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    role: str
    avatar: str | None = None
    is_active: bool = True
    created_at: str | None = None

    @classmethod
    def from_user(cls, user: User) -> "UserOut":
        return cls(
            id=str(user.id),
            email=user.email,
            name=user.name,
            role=user.role,
            avatar=user.avatar_url,
            is_active=bool(user.is_active),
            created_at=user.created_at.isoformat() if user.created_at else None,
        )


class UserUpdate(BaseModel):
    name: str | None = None
    role: Literal["admin", "creator", "viewer"] | None = None
    is_active: bool | None = None
    avatar: str | None = None


# ── Router ──────────────────────────────────────────────────────────────


router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login")
def login(body: LoginBody, db: DbSession) -> TokenPair:
    user = db.execute(
        select(User).where(
            User.email == body.email.lower(),
            User.is_active.is_(True),
        )
    ).scalar_one_or_none()
    if user is None or not verify_password(body.password, user.hashed_password):
        # Generic message — don't disclose whether the email exists.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    return TokenPair(
        access_token=issue_token(user.id, "access"),
        refresh_token=issue_token(user.id, "refresh"),
    )


@router.post("/refresh")
def refresh(body: RefreshBody, db: DbSession) -> TokenPair:
    user_id = decode_token(body.refresh_token, "refresh")
    # Confirm the user still exists and is active before reissuing.
    user = db.execute(
        select(User).where(User.id == user_id, User.is_active.is_(True))
    ).scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )
    return TokenPair(
        access_token=issue_token(user.id, "access"),
        refresh_token=issue_token(user.id, "refresh"),
    )


@router.get("/me")
def me(user: CurrentUser) -> UserOut:
    return UserOut.from_user(user)


@router.get("/users")
def list_users(_: AdminUser, db: DbSession) -> list[UserOut]:
    users = db.execute(select(User).order_by(User.email)).scalars().all()
    return [UserOut.from_user(u) for u in users]


@router.patch("/users/{user_id}")
def update_user(
    user_id: str, body: UserUpdate, admin: AdminUser, db: DbSession
) -> UserOut:
    target = db.execute(
        select(User).where(User.id == uuid.UUID(user_id))
    ).scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    # Admins can't strip their own admin role or deactivate themselves —
    # otherwise a single admin could lock the workspace.
    if target.id == admin.id:
        if body.role is not None and body.role != "admin":
            raise HTTPException(
                status_code=400,
                detail="You can't demote yourself from admin",
            )
        if body.is_active is False:
            raise HTTPException(
                status_code=400,
                detail="You can't deactivate yourself",
            )
    if body.name is not None:
        target.name = body.name
    if body.role is not None:
        target.role = body.role
    if body.is_active is not None:
        target.is_active = body.is_active
    if body.avatar is not None:
        target.avatar_url = body.avatar or None
    db.commit()
    db.refresh(target)
    return UserOut.from_user(target)


@router.delete("/users/{user_id}", status_code=204)
def delete_user(user_id: str, admin: AdminUser, db: DbSession) -> None:
    target = db.execute(
        select(User).where(User.id == uuid.UUID(user_id))
    ).scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == admin.id:
        raise HTTPException(status_code=400, detail="You can't delete yourself")
    db.delete(target)
    db.commit()
