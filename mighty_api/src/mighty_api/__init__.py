"""mighty_api — shared FastAPI routers, middleware, and dependencies.

Consumer apps (dev-api, mighty-lite, mighty-twin) import routers (auth, sites,
layers, uploads) from this package and mount app-specific ones alongside.

Security middleware (`SecureHeaders`, `CORS` with allowlist, `TrustedHost`,
rate limiter, request-id) lives in `middleware.py` and ships with safe
defaults; each consumer app overrides only what it needs to.
"""

__version__ = "0.1.0"
