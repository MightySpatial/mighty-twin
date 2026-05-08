"""OAuth login flows — Google + Microsoft.

Authorization-code flow with state CSRF protection. The state is a
short-lived (5 min) signed JWT that encodes the original ``next`` URL
the user was on, so we can return them to the right place after the
identity provider hop.

Flow:

    GET  /api/auth/{provider}                       (initiate)
        → 302 to provider's authorize endpoint with state + redirect_uri
    GET  /api/auth/{provider}/callback?code&state   (callback)
        → exchange code for token at provider's token endpoint
        → fetch userinfo
        → upsert local User row (by email; OAuth-only users have NULL
          hashed_password — that's why the column is nullable)
        → issue Twin access + refresh JWTs
        → 302 back to ``next`` with ?access_token=…&refresh_token=… so
          the frontend's existing useAuth.useEffect URL-param handler
          picks them up

Provider-specific knobs (client id/secret, tenant) come from
``Settings``; the routes are mounted regardless but each provider
self-disables (returns 503 with a helpful message) when its client
credentials aren't configured.
"""

from __future__ import annotations

import base64
import json
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlencode

import httpx
import jwt
from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select

from mighty_models import User

from .auth import ALGORITHM, issue_token
from .config import get_settings
from .db import DbSession

router = APIRouter(prefix="/api/auth", tags=["oauth"])

STATE_TTL = timedelta(minutes=5)


def _state_token(next_url: str, provider: str) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "next": next_url,
        "provider": provider,
        "nonce": secrets.token_urlsafe(8),
        "iat": int(now.timestamp()),
        "exp": int((now + STATE_TTL).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def _verify_state(token: str, provider: str) -> str:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
    except jwt.PyJWTError as e:
        raise HTTPException(status_code=400, detail=f"Invalid state token: {e}") from e
    if payload.get("provider") != provider:
        raise HTTPException(status_code=400, detail="State / provider mismatch")
    return str(payload.get("next") or "/")


def _resolve_redirect_origin(request: Request) -> str:
    settings = get_settings()
    if settings.oauth_redirect_origin:
        return settings.oauth_redirect_origin.rstrip("/")
    if settings.allowed_origins:
        return settings.allowed_origins[0].rstrip("/")
    base = str(request.base_url).rstrip("/")
    return base


def _resolve_callback_url(request: Request, provider: str) -> str:
    """Where the provider should redirect back to. Lives on the API
    origin, not the frontend, so we can run the token exchange + user
    creation server-side before the frontend ever sees a credential."""
    base = str(request.base_url).rstrip("/")
    return f"{base}/api/auth/{provider}/callback"


def _frontend_handoff(origin: str, next_url: str, access: str, refresh: str) -> str:
    """Stitch the access + refresh tokens onto the next URL the user
    came from. The frontend's useAuth listener already strips these
    out of window.location on mount."""
    base = origin
    target = next_url if next_url.startswith("/") else "/"
    sep = "&" if "?" in target else "?"
    return f"{base}{target}{sep}access_token={access}&refresh_token={refresh}"


def _frontend_error(origin: str, provider: str, message: str) -> str:
    encoded = base64.urlsafe_b64encode(message.encode()).decode().rstrip("=")
    return f"{origin}/login?oauth_error={provider}:{encoded}"


def _upsert_oauth_user(
    db: DbSession,
    *,
    email: str,
    name: str,
    avatar: str | None,
) -> User:
    """Find a user by email or create one. OAuth-only users have a
    NULL hashed_password — local-password login can't impersonate
    them by guessing a password."""
    email_lower = email.strip().lower()
    user = db.execute(select(User).where(User.email == email_lower)).scalar_one_or_none()
    if user is None:
        user = User(
            email=email_lower,
            name=name or email_lower,
            hashed_password=None,
            role="viewer",
            avatar_url=avatar,
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        # Refresh the avatar + name on every login — providers update.
        if avatar and user.avatar_url != avatar:
            user.avatar_url = avatar
        if name and user.name != name:
            user.name = name
        db.commit()
    return user


# ── Google ──────────────────────────────────────────────────────────────


@router.get("/google")
async def google_initiate(request: Request, next: str = "/") -> RedirectResponse:
    settings = get_settings()
    if not settings.google_client_id:
        raise HTTPException(
            status_code=503,
            detail="Google OAuth not configured. Set GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET.",
        )
    redirect_uri = _resolve_callback_url(request, "google")
    state = _state_token(next, "google")
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "online",
        "prompt": "select_account",
    }
    return RedirectResponse(
        url=f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}",
        status_code=status.HTTP_302_FOUND,
    )


@router.get("/google/callback")
async def google_callback(
    request: Request,
    db: DbSession,
    code: str = "",
    state: str = "",
    error: str = "",
) -> RedirectResponse:
    settings = get_settings()
    origin = _resolve_redirect_origin(request)
    if error:
        return RedirectResponse(_frontend_error(origin, "google", error))
    if not code or not state:
        return RedirectResponse(_frontend_error(origin, "google", "missing code/state"))
    if not settings.google_client_id or not settings.google_client_secret:
        return RedirectResponse(_frontend_error(origin, "google", "not configured"))
    next_url = _verify_state(state, "google")
    redirect_uri = _resolve_callback_url(request, "google")

    async with httpx.AsyncClient(timeout=15) as client:
        token_res = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        if token_res.status_code >= 400:
            return RedirectResponse(
                _frontend_error(origin, "google", f"token exchange failed ({token_res.status_code})")
            )
        token_payload = token_res.json()
        access_token = token_payload.get("access_token")
        if not access_token:
            return RedirectResponse(_frontend_error(origin, "google", "no access_token from provider"))

        user_res = await client.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if user_res.status_code >= 400:
            return RedirectResponse(
                _frontend_error(origin, "google", f"userinfo failed ({user_res.status_code})")
            )
        info = user_res.json()

    email = info.get("email")
    if not email:
        return RedirectResponse(_frontend_error(origin, "google", "no email in userinfo"))
    name = info.get("name") or email
    avatar = info.get("picture")

    user = _upsert_oauth_user(db, email=email, name=name, avatar=avatar)
    twin_access = issue_token(user.id, "access")
    twin_refresh = issue_token(user.id, "refresh")
    return RedirectResponse(_frontend_handoff(origin, next_url, twin_access, twin_refresh))


# ── Microsoft (Entra ID / Azure AD) ─────────────────────────────────────


@router.get("/microsoft")
async def microsoft_initiate(request: Request, next: str = "/") -> RedirectResponse:
    settings = get_settings()
    if not settings.microsoft_client_id:
        raise HTTPException(
            status_code=503,
            detail="Microsoft OAuth not configured. Set MICROSOFT_CLIENT_ID + MICROSOFT_CLIENT_SECRET.",
        )
    redirect_uri = _resolve_callback_url(request, "microsoft")
    state = _state_token(next, "microsoft")
    tenant = settings.microsoft_tenant or "common"
    params = {
        "client_id": settings.microsoft_client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile User.Read",
        "state": state,
        "response_mode": "query",
        "prompt": "select_account",
    }
    return RedirectResponse(
        url=f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize?{urlencode(params)}",
        status_code=status.HTTP_302_FOUND,
    )


@router.get("/microsoft/callback")
async def microsoft_callback(
    request: Request,
    db: DbSession,
    code: str = "",
    state: str = "",
    error: str = "",
    error_description: str = "",
) -> RedirectResponse:
    settings = get_settings()
    origin = _resolve_redirect_origin(request)
    if error:
        return RedirectResponse(_frontend_error(origin, "microsoft", error_description or error))
    if not code or not state:
        return RedirectResponse(_frontend_error(origin, "microsoft", "missing code/state"))
    if not settings.microsoft_client_id or not settings.microsoft_client_secret:
        return RedirectResponse(_frontend_error(origin, "microsoft", "not configured"))
    next_url = _verify_state(state, "microsoft")
    redirect_uri = _resolve_callback_url(request, "microsoft")
    tenant = settings.microsoft_tenant or "common"

    async with httpx.AsyncClient(timeout=15) as client:
        token_res = await client.post(
            f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token",
            data={
                "code": code,
                "client_id": settings.microsoft_client_id,
                "client_secret": settings.microsoft_client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
                "scope": "openid email profile User.Read",
            },
        )
        if token_res.status_code >= 400:
            return RedirectResponse(
                _frontend_error(
                    origin, "microsoft", f"token exchange failed ({token_res.status_code})"
                )
            )
        token_payload = token_res.json()
        access_token = token_payload.get("access_token")
        id_token = token_payload.get("id_token")
        if not access_token:
            return RedirectResponse(_frontend_error(origin, "microsoft", "no access_token"))

        # Prefer id_token for stable claims; fall back to /me if absent.
        info: dict[str, Any] = {}
        if id_token:
            try:
                info = jwt.decode(id_token, options={"verify_signature": False})
            except jwt.PyJWTError:
                info = {}
        if not info.get("email"):
            user_res = await client.get(
                "https://graph.microsoft.com/oidc/userinfo",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if user_res.status_code < 400:
                info = {**user_res.json(), **info}

    email = info.get("email") or info.get("preferred_username")
    if not email or "@" not in email:
        return RedirectResponse(_frontend_error(origin, "microsoft", "no email in profile"))
    name = info.get("name") or info.get("preferred_username") or email

    user = _upsert_oauth_user(db, email=email, name=name, avatar=None)
    twin_access = issue_token(user.id, "access")
    twin_refresh = issue_token(user.id, "refresh")
    return RedirectResponse(_frontend_handoff(origin, next_url, twin_access, twin_refresh))


# ── Provider availability probe (used by frontend feature flag) ────────


@router.get("/oauth/providers")
def list_providers() -> dict[str, dict[str, bool]]:
    """Tells the frontend which OAuth buttons to render. Returned shape::

        {
          "google":    {"enabled": true},
          "microsoft": {"enabled": false}
        }
    """
    settings = get_settings()
    return {
        "google": {
            "enabled": bool(settings.google_client_id and settings.google_client_secret),
        },
        "microsoft": {
            "enabled": bool(
                settings.microsoft_client_id and settings.microsoft_client_secret
            ),
        },
    }


# Silence the unused `json` import lint without removing it — future
# providers may need it for body parsing.
_ = json
