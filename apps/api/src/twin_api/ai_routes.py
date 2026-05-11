"""AI provider helpers — server-side credential detection for CLI-
based authentication flows.

Currently exposes one endpoint:

  POST /api/ai/detect-openai-cli

…which reads the standard OpenAI CLI credential locations on the
server's filesystem, extracts the bearer token if any is found,
and returns a preview + the full token. The full token is returned
so the BYOK localStorage path on the frontend keeps working
identically to the manual paste flow — there is no separate
server-side credential vault today. A future commit can store the
token in an encrypted column and stop returning the full string;
the endpoint shape (`{found, token, token_preview, paths_checked}`)
gives us room to drop the `token` field later without changing the
detection UX.

OpenAI's CLI has shipped several credential storage formats over
its lifetime:

  • Legacy:  ~/.openai/credentials  — INI-style `api_key = sk-…`
  • Newer:   ~/.openai/auth.json     — `{"access_token": "…"}`
  • XDG:     ~/.config/openai/auth.json
  • Codex:   ~/.config/codex/auth.json + ~/.codex/auth.json
  • Cache:   ~/.cache/openai/{credentials,auth.json}

We try them all in order and return the first match. The bearer
token field name varies — `api_key` / `access_token` / `token` —
so the loader handles each format explicitly."""

from __future__ import annotations

import configparser
import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter

from .auth import CurrentUser


router = APIRouter(prefix="/api/ai", tags=["ai"])


# Ordered list of (path-relative-to-home, parser-name) pairs.
_CRED_LOCATIONS: list[tuple[str, str]] = [
    (".openai/credentials",        "ini"),
    (".openai/auth.json",          "json"),
    (".config/openai/credentials", "ini"),
    (".config/openai/auth.json",   "json"),
    (".config/codex/auth.json",    "json"),
    (".codex/auth.json",           "json"),
    (".cache/openai/credentials",  "ini"),
    (".cache/openai/auth.json",    "json"),
]


def _read_ini(path: Path) -> str | None:
    """Pull a bearer token out of an INI-style credentials file. We
    look for any of `api_key`, `access_token`, or `token` under the
    `[default]` (or first) section, falling back to a flat
    key = value scan when the file isn't sectioned."""
    try:
        text = path.read_text()
    except OSError:
        return None
    # configparser needs a section header — synthesise one if missing.
    if "[" not in text:
        text = "[default]\n" + text
    parser = configparser.ConfigParser()
    try:
        parser.read_string(text)
    except configparser.Error:
        return None
    for section in parser.sections() or ["default"]:
        for key in ("api_key", "access_token", "token"):
            try:
                value = parser.get(section, key, fallback="").strip().strip('"').strip("'")
            except configparser.Error:
                continue
            if value:
                return value
    return None


def _read_json(path: Path) -> str | None:
    """Pull a bearer token out of a JSON credentials file. The schema
    varies — read every plausible top-level field and the first
    matching nested entry."""
    try:
        data: Any = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(data, dict):
        return None
    for key in ("access_token", "api_key", "token", "OPENAI_API_KEY"):
        value = data.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    # Some Codex versions nest under `tokens` or `credentials`.
    for parent in ("tokens", "credentials"):
        nested = data.get(parent)
        if isinstance(nested, dict):
            for key in ("access_token", "api_key", "token"):
                value = nested.get(key)
                if isinstance(value, str) and value.strip():
                    return value.strip()
    return None


def _preview(token: str) -> str:
    """Return a masked preview like `sk-pr...abcd` — never the full
    string. Used in the UI so the user can confirm which credential
    was detected without leaking the secret to the page."""
    if len(token) <= 8:
        return "•" * len(token)
    return f"{token[:3]}…{token[-4:]}"


@router.post("/detect-openai-cli")
def detect_openai_cli(_user: CurrentUser) -> dict[str, Any]:
    """Look for OpenAI CLI credentials in the standard locations on
    the server's filesystem. Returns:

        { found: bool,
          token: str | None,         # full token when found
          token_preview: str | None, # `sk-pr…abcd`
          source_path: str | None,   # which file matched
          paths_checked: [str, …] }

    The auth dependency guards against unauthenticated calls so a
    drive-by request can't probe the home directory."""
    home = Path.home()
    paths_checked: list[str] = []
    for rel, kind in _CRED_LOCATIONS:
        path = home / rel
        paths_checked.append(str(path))
        if not path.is_file():
            continue
        token = _read_ini(path) if kind == "ini" else _read_json(path)
        if token:
            return {
                "found": True,
                "token": token,
                "token_preview": _preview(token),
                "source_path": str(path),
                "paths_checked": paths_checked,
            }
    return {
        "found": False,
        "token": None,
        "token_preview": None,
        "source_path": None,
        "paths_checked": paths_checked,
    }
