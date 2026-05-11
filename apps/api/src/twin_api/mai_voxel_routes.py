"""Mai voxel assistant — provider-agnostic tool-use orchestration.

POST /api/mai/chat takes a natural-language message plus the current site
slug, runs an LLM tool-use loop with the voxel toolset, executes each
tool call server-side, and streams the model's progress back as SSE
events. The loop terminates when the model emits a final turn with no
more tool calls.

Provider abstraction lives in ``mai_providers`` — Mai is BYOK and
multi-provider. The frontend forwards the active ``provider`` (matching
the ``AGENT_PRESETS`` list in ``apps/web/src/ai/types.ts``) plus its
``api_key`` / ``base_url`` / ``model`` from localStorage; the route
falls back to ``ANTHROPIC_API_KEY`` from env when the provider is
anthropic and no key is sent (used by the CLI test script).

Voxel tool execution is currently stubbed — the voxel layer endpoints
are being built in parallel. The stubs compute deterministic synthetic
results (block counts, ranges) so the loop completes end-to-end and the
tool-call shape is exercised. Real implementations slot in at
``execute_voxel_tool`` when the voxel layer endpoints land.
"""

from __future__ import annotations

import json
import math
import os
from typing import Any, AsyncIterator, Iterable

import httpx
from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select

from mighty_models import Site

from .auth import CurrentUser
from .db import DbSession
from .mai_providers import (
    LLMProvider,
    NormMsg,
    ToolCall,
    ToolDef,
    ToolResult,
    get_provider,
)

router = APIRouter(prefix="/api/mai", tags=["mai"])


# ── System prompt template ──────────────────────────────────────────────

SYSTEM_PROMPT_TEMPLATE = """You are Mai, a spatial design assistant for MightyTwin. \
You help users design infrastructure projects using a voxel block system on a \
geo-referenced 3D globe.

The voxel system uses ENU (East-North-Up) coordinates from a site datum. Base block \
size is 12.5cm (level 0), doubling each level up to 128m (level 10). For mine sites \
use level 5-6 (4m-8m blocks). For buildings use level 1-3 (25cm-1m).

Current site: {site_slug}
Site datum: {datum_lon}, {datum_lat}, {datum_alt}

When the user describes a shape, location, or intervention: call the appropriate \
voxel tools to create it. Always confirm what you built with a brief summary.

Material types: rock, ore, overburden, fill, concrete, steel, water, topsoil"""


# ── Tool catalogue (canonical, provider-agnostic) ───────────────────────

VOXEL_TOOLS: list[ToolDef] = [
    ToolDef(
        name="search_location",
        description="Search for a real-world location by name and get its coordinates",
        input_schema={
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Location name, e.g. 'Super Pit Kalgoorlie'",
                }
            },
            "required": ["query"],
        },
    ),
    ToolDef(
        name="terrain_mask",
        description="Sample terrain height within a polygon and fill voxel columns with terrain blocks",
        input_schema={
            "type": "object",
            "properties": {
                "polygon": {
                    "type": "array",
                    "items": {"type": "array", "items": {"type": "number"}},
                    "description": "[[lon,lat],...] polygon vertices",
                },
                "level": {
                    "type": "integer",
                    "description": "Block level (0=12.5cm, 3=1m, 5=4m, 6=8m)",
                },
                "depth_below_surface": {
                    "type": "integer",
                    "description": "How many block layers below terrain surface to fill",
                },
                "scope": {"type": "string", "enum": ["site", "sketch"]},
            },
            "required": ["polygon", "level"],
        },
    ),
    ToolDef(
        name="pyramid_fill",
        description="Create a pyramid or pit shape (negative pyramid = open pit mine)",
        input_schema={
            "type": "object",
            "properties": {
                "center_lon": {"type": "number"},
                "center_lat": {"type": "number"},
                "base_width_m": {
                    "type": "number",
                    "description": "Base width in metres",
                },
                "base_depth_m": {
                    "type": "number",
                    "description": "Base depth in metres",
                },
                "height_m": {
                    "type": "number",
                    "description": "Height in metres (negative = pit going down)",
                },
                "wall_angle_deg": {
                    "type": "number",
                    "description": "Wall angle from vertical (0=vertical, 45=stepped slope)",
                },
                "material": {"type": "string"},
                "level": {"type": "integer"},
            },
            "required": [
                "center_lon",
                "center_lat",
                "base_width_m",
                "base_depth_m",
                "height_m",
                "wall_angle_deg",
                "material",
                "level",
            ],
        },
    ),
    ToolDef(
        name="box_fill",
        description="Fill a rectangular block volume",
        input_schema={
            "type": "object",
            "properties": {
                "center_lon": {"type": "number"},
                "center_lat": {"type": "number"},
                "base_alt_m": {"type": "number"},
                "width_m": {"type": "number"},
                "depth_m": {"type": "number"},
                "height_m": {"type": "number"},
                "material": {"type": "string"},
                "level": {"type": "integer"},
            },
            "required": [
                "center_lon",
                "center_lat",
                "width_m",
                "depth_m",
                "height_m",
                "material",
                "level",
            ],
        },
    ),
    ToolDef(
        name="water_fill",
        description="Flood fill all air voxels below a given elevation with water blocks",
        input_schema={
            "type": "object",
            "properties": {
                "fill_elevation_m": {
                    "type": "number",
                    "description": "Altitude in metres WGS84 to fill up to",
                },
                "level": {"type": "integer"},
            },
            "required": ["fill_elevation_m", "level"],
        },
    ),
]


# ── Tool execution ──────────────────────────────────────────────────────


def _block_size_m(level: int) -> float:
    """Voxel block size at a given level. Level 0 = 12.5cm, doubling per level."""
    return 0.125 * (2 ** level)


async def _search_location(query: str) -> dict[str, Any]:
    """Geocode via Nominatim. Public OpenStreetMap endpoint — no auth, but
    require a descriptive User-Agent per their usage policy."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.get(
            "https://nominatim.openstreetmap.org/search",
            params={"q": query, "format": "json", "limit": 1},
            headers={"User-Agent": "MightyTwin/0.1 (mighty-twin mai assistant)"},
        )
        r.raise_for_status()
        results = r.json()
    if not results:
        return {"found": False, "query": query}
    top = results[0]
    return {
        "found": True,
        "query": query,
        "name": top.get("display_name", query),
        "lon": float(top["lon"]),
        "lat": float(top["lat"]),
        "type": top.get("type"),
        "class": top.get("class"),
    }


def _terrain_mask_stub(args: dict[str, Any]) -> dict[str, Any]:
    """Estimate column count from polygon area. Real impl will sample
    terrain heights and write voxel columns."""
    polygon = args.get("polygon") or []
    level = int(args.get("level", 5))
    depth_layers = int(args.get("depth_below_surface", 1))
    block = _block_size_m(level)

    # Shoelace for the polygon area in degrees², roughly converted to m².
    # For tool-use plumbing this approximation is fine; a real impl uses
    # geodesic area (e.g. shapely + pyproj) or ST_Area on the server.
    area_deg2 = _polygon_area_deg2(polygon)
    # 1 degree ≈ 111_320 m near the equator. For non-equatorial sites the
    # caller's stub estimate will be off by cos(lat); the response carries
    # `note: stub` so consumers know not to trust it as ground-truth.
    area_m2 = abs(area_deg2) * (111_320 ** 2)
    columns = max(0, int(area_m2 / (block ** 2)))
    blocks = columns * max(1, depth_layers)
    return {
        "stub": True,
        "blocks_added": blocks,
        "columns_sampled": columns,
        "block_size_m": block,
        "level": level,
        "depth_layers": depth_layers,
        "note": "Voxel terrain-mask backend pending — synthesized result.",
    }


def _pyramid_fill_stub(args: dict[str, Any]) -> dict[str, Any]:
    base_w = float(args["base_width_m"])
    base_d = float(args["base_depth_m"])
    height = float(args["height_m"])
    angle = float(args["wall_angle_deg"])
    material = str(args["material"])
    level = int(args["level"])
    block = _block_size_m(level)

    # Frustum volume approximation. Top dims shrink by 2*|height|*tan(angle).
    setback = abs(height) * math.tan(math.radians(min(89.0, angle)))
    top_w = max(0.0, base_w - 2 * setback)
    top_d = max(0.0, base_d - 2 * setback)
    base_area = base_w * base_d
    top_area = top_w * top_d
    avg_area = (base_area + top_area + math.sqrt(base_area * top_area)) / 3.0
    volume_m3 = avg_area * abs(height)
    blocks = max(0, int(volume_m3 / (block ** 3)))
    return {
        "stub": True,
        "blocks_added": blocks,
        "block_size_m": block,
        "level": level,
        "material": material,
        "is_pit": height < 0,
        "wall_angle_deg": angle,
        "approx_volume_m3": int(volume_m3),
        "note": "Voxel pyramid backend pending — synthesized result.",
    }


def _box_fill_stub(args: dict[str, Any]) -> dict[str, Any]:
    width = float(args["width_m"])
    depth = float(args["depth_m"])
    height = float(args["height_m"])
    material = str(args["material"])
    level = int(args["level"])
    block = _block_size_m(level)
    volume_m3 = width * depth * height
    blocks = max(0, int(volume_m3 / (block ** 3)))
    return {
        "stub": True,
        "blocks_added": blocks,
        "block_size_m": block,
        "level": level,
        "material": material,
        "approx_volume_m3": int(volume_m3),
        "note": "Voxel box backend pending — synthesized result.",
    }


def _water_fill_stub(args: dict[str, Any]) -> dict[str, Any]:
    level = int(args["level"])
    fill_alt = float(args["fill_elevation_m"])
    return {
        "stub": True,
        "blocks_added": 0,
        "block_size_m": _block_size_m(level),
        "level": level,
        "fill_elevation_m": fill_alt,
        "note": (
            "Voxel water-fill backend pending — needs a populated voxel "
            "layer to flood-fill air voxels below the elevation. Returning "
            "a no-op result so the agent loop can confirm a clean run."
        ),
    }


def _polygon_area_deg2(polygon: Iterable[Iterable[float]]) -> float:
    pts = [tuple(p) for p in polygon if len(p) >= 2]
    if len(pts) < 3:
        return 0.0
    s = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i][0], pts[i][1]
        x2, y2 = pts[(i + 1) % len(pts)][0], pts[(i + 1) % len(pts)][1]
        s += x1 * y2 - x2 * y1
    return s / 2.0


async def execute_voxel_tool(name: str, args: dict[str, Any]) -> dict[str, Any]:
    """Tool dispatcher. Real voxel routes slot in here once the parallel
    work lands — until then, every voxel tool returns a stub with
    ``stub: true`` so the agent loop and the frontend can both detect it.
    ``search_location`` is implemented for real (Nominatim)."""
    if name == "search_location":
        return await _search_location(str(args.get("query", "")))
    if name == "terrain_mask":
        return _terrain_mask_stub(args)
    if name == "pyramid_fill":
        return _pyramid_fill_stub(args)
    if name == "box_fill":
        return _box_fill_stub(args)
    if name == "water_fill":
        return _water_fill_stub(args)
    return {"error": f"Unknown tool: {name}"}


# ── Site datum lookup ───────────────────────────────────────────────────


def _resolve_site_datum(site_slug: str, db) -> dict[str, Any]:
    """Pull lat/lon/alt for the site. Datum lives in the schema-less
    ``site.config`` blob (keys checked in order: ``datum``, ``camera``,
    top-level lon/lat/alt). Falls back to (0,0,0) so the system prompt
    always renders cleanly even when the site is unknown — the test
    script and dev runs without a DB seed depend on this."""
    site = db.execute(select(Site).where(Site.slug == site_slug)).scalar_one_or_none()
    if site is None:
        return {"lon": 0.0, "lat": 0.0, "alt": 0.0, "found": False}
    config = site.config or {}
    datum = config.get("datum") or config.get("camera") or {}
    return {
        "lon": float(datum.get("lon") or config.get("lon") or 0.0),
        "lat": float(datum.get("lat") or config.get("lat") or 0.0),
        "alt": float(datum.get("alt") or config.get("alt") or 0.0),
        "found": True,
    }


# ── Request body ────────────────────────────────────────────────────────


class ChatTurn(BaseModel):
    role: str
    content: str


class ChatBody(BaseModel):
    message: str = Field(min_length=1)
    site_slug: str = Field(min_length=1)
    sketch_id: str | None = None
    conversation_history: list[ChatTurn] = Field(default_factory=list)
    api_key: str | None = None
    """API key for the active provider. The frontend forwards its
    BYOK localStorage key here. For Anthropic specifically, falls back
    to ``ANTHROPIC_API_KEY`` env when absent."""
    model: str | None = None
    """Override for the model id. Defaults derived from provider."""
    provider: str = "anthropic"
    """Provider id matching ``AGENT_PRESETS`` in ai/types.ts:
    anthropic, openai, openrouter, groq, together, fireworks, perplexity,
    mistral, deepseek, xai, ollama, lmstudio, openai-compatible.
    Gemini lands in v2."""
    base_url: str | None = None
    """OpenAI-compatible base URL override (Ollama on a non-default
    port, vLLM, custom deployments). Ignored for Anthropic."""


# Per-provider default model ids when the body doesn't specify one.
# Mirrors `apps/web/src/ai/client.ts` DEFAULTS and the AGENT_PRESETS
# defaultModel field.
DEFAULT_MODELS: dict[str, str] = {
    "anthropic":           "claude-sonnet-4-6",
    "openai":              "gpt-4o-mini",
    # openai-codex uses the same Chat Completions endpoint as openai
    # but with a CLI session token instead of an sk- API key.
    "openai-codex":        "gpt-4o-mini",
    "openrouter":          "openrouter/auto",
    "groq":                "llama-3.3-70b-versatile",
    "together":            "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    "fireworks":           "accounts/fireworks/models/llama-v3p1-405b-instruct",
    "perplexity":          "sonar",
    "mistral":             "mistral-large-latest",
    "deepseek":            "deepseek-chat",
    "xai":                 "grok-2-latest",
    "ollama":              "llama3.2",
    "lmstudio":            "",
    "openai-compatible":   "",
}

MAX_TOOL_ROUNDS = 10


# ── SSE helpers ─────────────────────────────────────────────────────────


def _sse(event: str, data: dict[str, Any]) -> bytes:
    """Format a single SSE message. Each chunk is a discrete JSON-encoded
    event so the frontend can route it (text vs tool_call vs done)."""
    body = json.dumps({"event": event, **data}, separators=(",", ":"))
    return f"data: {body}\n\n".encode("utf-8")


# ── Streaming generator ─────────────────────────────────────────────────


async def _stream_chat(
    *,
    body: ChatBody,
    site_datum: dict[str, Any],
    provider: LLMProvider,
    model: str,
) -> AsyncIterator[bytes]:
    """Run the provider-agnostic tool-use loop and yield SSE chunks.

    Each chunk is one of:
      ``start``       — provider + model + site context
      ``text``        — model text turn (concatenated for the round)
      ``tool_call``   — model requested a tool execution
      ``tool_result`` — local tool finished, ready to feed back
      ``done``        — final turn, no more tool calls
      ``error``       — something blew up; the stream is closing

    The loop is bounded by ``MAX_TOOL_ROUNDS`` so a runaway model can't
    pin the connection open forever.
    """
    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(
        site_slug=body.site_slug,
        datum_lon=site_datum["lon"],
        datum_lat=site_datum["lat"],
        datum_alt=site_datum["alt"],
    )

    # Build the normalized message history. Prior turns from the client
    # are plain text; the new user message is appended at the end.
    history: list[NormMsg] = []
    for turn in body.conversation_history:
        if turn.role in ("user", "assistant"):
            history.append(NormMsg(role=turn.role, text=turn.content))
    history.append(NormMsg(role="user", text=body.message))

    yield _sse(
        "start",
        {"provider": provider.name, "model": model, "site_slug": body.site_slug},
    )

    total_input_tokens = 0
    total_output_tokens = 0

    for round_idx in range(MAX_TOOL_ROUNDS):
        try:
            resp = await provider.call(
                system=system_prompt,
                tools=VOXEL_TOOLS,
                messages=history,
                model=model,
            )
        except Exception as e:  # network errors, validation errors
            yield _sse("error", {"message": f"{type(e).__name__}: {e}"})
            return

        total_input_tokens += resp.input_tokens
        total_output_tokens += resp.output_tokens

        if resp.stop_reason == "error":
            yield _sse("error", {"message": resp.error_message or "Provider error"})
            return

        if resp.text:
            yield _sse("text", {"content": resp.text})

        # No tool calls → final answer, we're done.
        if not resp.tool_calls:
            yield _sse(
                "done",
                {
                    "stop_reason": resp.stop_reason,
                    "input_tokens": total_input_tokens,
                    "output_tokens": total_output_tokens,
                    "rounds": round_idx + 1,
                },
            )
            return

        if resp.stop_reason == "refusal":
            yield _sse(
                "error",
                {"message": "Model declined the request (refusal stop_reason)."},
            )
            return

        # Persist the assistant turn (text + tool_use blocks). The
        # provider needs to echo these back on the next call so its
        # tool_call_id resolution works (OpenAI is strict about this).
        history.append(
            NormMsg(role="assistant", text=resp.text or None, tool_calls=resp.tool_calls)
        )

        tool_results: list[ToolResult] = []
        for call in resp.tool_calls:
            yield _sse(
                "tool_call",
                {"id": call.id, "name": call.name, "input": call.input},
            )
            try:
                result = await execute_voxel_tool(call.name, dict(call.input))
                is_error = False
            except Exception as e:
                result = {"error": f"{type(e).__name__}: {e}"}
                is_error = True

            yield _sse(
                "tool_result",
                {
                    "id": call.id,
                    "name": call.name,
                    "result": result,
                    "is_error": is_error,
                },
            )
            tool_results.append(
                ToolResult(
                    id=call.id,
                    name=call.name,
                    output=json.dumps(result),
                    is_error=is_error,
                )
            )

        history.append(NormMsg(role="user", tool_results=tool_results))

    # Round cap.
    yield _sse(
        "error",
        {
            "message": (
                f"Tool-use round cap reached ({MAX_TOOL_ROUNDS}). "
                "Try a simpler request."
            )
        },
    )


# ── Route ───────────────────────────────────────────────────────────────


def _resolve_credentials(body: ChatBody) -> tuple[str | None, str]:
    """Pull (api_key, model) from the body, with sensible fallbacks.

    Anthropic specifically falls back to ``ANTHROPIC_API_KEY`` env so
    the CLI test script + a server with a global key can both work
    without the BYOK localStorage detour. Other providers don't have
    well-known env vars (and we don't want to invent one per provider),
    so they require the body to carry the key.
    """
    api_key = body.api_key
    if not api_key and body.provider == "anthropic":
        api_key = os.environ.get("ANTHROPIC_API_KEY")

    model = body.model or DEFAULT_MODELS.get(body.provider) or ""
    return api_key, model


@router.post("/chat")
async def mai_chat(
    body: ChatBody,
    user: CurrentUser,
    db: DbSession,
    request: Request,
) -> StreamingResponse:
    """Stream a Mai chat turn back as Server-Sent Events.

    Provider, model, api_key, and base_url all arrive in the request
    body (matching the BYOK localStorage shape on the frontend). The
    route is provider-agnostic via the ``mai_providers`` abstraction —
    every supported provider id (anthropic, openai, ollama, groq,
    together, …) routes through the same SSE pipeline.
    """
    api_key, model = _resolve_credentials(body)
    if not model:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"No model configured for provider {body.provider!r}. "
                f"Pass `model` in the request body."
            ),
        )

    try:
        provider = get_provider(
            body.provider,
            api_key=api_key,
            base_url=body.base_url,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e

    site_datum = _resolve_site_datum(body.site_slug, db)

    return StreamingResponse(
        _stream_chat(
            body=body,
            site_datum=site_datum,
            provider=provider,
            model=model,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/voxel-tools")
def list_voxel_tools(_: CurrentUser) -> dict[str, Any]:
    """Surface the tool catalogue. Useful for the frontend to render the
    voxel-context indicator (which tools the model will reach for) and
    for debugging the schema without invoking the chat route."""
    return {
        "tools": [
            {
                "name": t.name,
                "description": t.description,
                "input_schema": t.input_schema,
            }
            for t in VOXEL_TOOLS
        ],
        "default_models": DEFAULT_MODELS,
    }
