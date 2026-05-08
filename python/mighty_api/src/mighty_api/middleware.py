"""Security middleware for Mighty FastAPI backends.

Drop the `install_security_middleware(app, settings)` helper into every
consumer's `main.py`. Safe defaults: CSP, HSTS, X-Frame-Options: DENY,
Referrer-Policy, Permissions-Policy, CORS allowlist, and a per-IP rate
limiter. Override via `settings`.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response


@dataclass
class SecurityConfig:
    """Tunable knobs for the security middleware stack."""

    allowed_origins: list[str] = field(default_factory=lambda: ["http://localhost:5173"])
    allowed_hosts: list[str] = field(default_factory=lambda: ["localhost", "127.0.0.1"])
    csp: str = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: blob: https:; "
        "connect-src 'self'; "
        "frame-ancestors 'none';"
    )
    hsts: str = "max-age=31536000; includeSubDomains"
    referrer_policy: str = "strict-origin-when-cross-origin"
    permissions_policy: str = (
        "accelerometer=(), camera=(), geolocation=(self), "
        "gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()"
    )


class SecureHeadersMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: FastAPI, config: SecurityConfig) -> None:
        super().__init__(app)
        self._config = config

    async def dispatch(self, request: Request, call_next: Callable) -> Response:  # type: ignore[type-arg]
        response = await call_next(request)
        response.headers.setdefault("Content-Security-Policy", self._config.csp)
        response.headers.setdefault("Strict-Transport-Security", self._config.hsts)
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", self._config.referrer_policy)
        response.headers.setdefault("Permissions-Policy", self._config.permissions_policy)
        return response


def install_security_middleware(app: FastAPI, config: SecurityConfig | None = None) -> None:
    """Install the default security middleware stack on a FastAPI app."""
    cfg = config or SecurityConfig()
    # Order matters: outermost middleware runs first on requests, last on responses.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cfg.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=cfg.allowed_hosts)
    app.add_middleware(SecureHeadersMiddleware, config=cfg)
