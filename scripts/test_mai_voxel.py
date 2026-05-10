#!/usr/bin/env python3
"""CLI test for Mai's voxel tool-use loop.

Exercises the same VOXEL_TOOLS catalogue, system prompt, and tool
dispatcher that ``/api/mai/chat`` uses, but without spinning up
FastAPI / the DB. The point is to verify Claude calls the right tools
in the right order with sensible inputs — the SSE plumbing is a thin
wrapper above this loop.

Reads the Anthropic API key from ``ANTHROPIC_API_KEY`` (env or
``apps/api/.env``). Prints each tool call, each tool result, and the
final response.

Usage:
    python scripts/test_mai_voxel.py \\
        --site space-angel \\
        --message "Draw a simple open cut mine pit, 500m wide, 200m deep, \\
                   45 degree walls, at the centre of the site"
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

# Make the api source importable so we share the exact tool catalogue
# and dispatcher with the live route. No code drift between the test
# and what runs in production.
REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "apps" / "api" / "src"))

from anthropic import Anthropic  # noqa: E402

from twin_api.mai_voxel_routes import (  # noqa: E402
    DEFAULT_MODEL,
    MAX_TOOL_ROUNDS,
    SYSTEM_PROMPT_TEMPLATE,
    VOXEL_TOOLS,
    execute_voxel_tool,
)


def load_env_file(path: Path) -> None:
    """Tiny .env reader — no external dependency. Only sets keys that
    aren't already in os.environ so explicit env wins over file."""
    if not path.is_file():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k = k.strip()
        v = v.strip().strip('"').strip("'")
        os.environ.setdefault(k, v)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Exercise Mai's Claude tool-use loop end-to-end.")
    p.add_argument("--site", default="space-angel", help="Site slug (used in the system prompt).")
    p.add_argument(
        "--message",
        default="Draw a simple open cut mine pit, 500m wide, 200m deep, 45 degree walls, at the centre of the site",
        help="The user prompt to send to Claude.",
    )
    p.add_argument("--datum-lon", type=float, default=121.4768, help="Datum lon for the system prompt.")
    p.add_argument("--datum-lat", type=float, default=-30.7556, help="Datum lat for the system prompt.")
    p.add_argument("--datum-alt", type=float, default=350.0, help="Datum alt for the system prompt.")
    p.add_argument("--model", default=DEFAULT_MODEL, help=f"Model id (default {DEFAULT_MODEL}).")
    p.add_argument("--max-rounds", type=int, default=MAX_TOOL_ROUNDS, help="Tool-use round cap.")
    p.add_argument(
        "--dry-run",
        action="store_true",
        help=(
            "Skip the Anthropic API and replay a canned tool-use script "
            "(search_location → pyramid_fill → final text). Useful for "
            "smoke-testing the tool dispatcher without burning tokens."
        ),
    )
    return p.parse_args()


# ── Mock Claude (dry-run only) ──────────────────────────────────────────


class _MockBlock:
    def __init__(self, **kw): self.__dict__.update(kw)


class _MockUsage:
    def __init__(self): self.input_tokens = 0; self.output_tokens = 0


class _MockResponse:
    def __init__(self, content, stop_reason):
        self.content = content
        self.stop_reason = stop_reason
        self.usage = _MockUsage()


class MockAnthropic:
    """Replay a fixed two-round tool-use trace so we can exercise the
    dispatcher + history bookkeeping without hitting the API. Mirrors a
    plausible Claude response to the canned --message about a pit."""

    def __init__(self):
        self.messages = self
        self._round = 0

    def create(self, **kw):  # noqa: ARG002
        self._round += 1
        if self._round == 1:
            return _MockResponse(
                [
                    _MockBlock(type="text", text=(
                        "I'll geocode the site centre first to confirm the "
                        "anchor point, then carve the pit."
                    )),
                    _MockBlock(
                        type="tool_use",
                        id="tu_search_1",
                        name="search_location",
                        input={"query": "Kalgoorlie Super Pit"},
                    ),
                ],
                stop_reason="tool_use",
            )
        if self._round == 2:
            return _MockResponse(
                [
                    _MockBlock(type="text", text=(
                        "Got it. Carving a 500×500 m pit, 200 m deep, "
                        "45° walls, at the search hit."
                    )),
                    _MockBlock(
                        type="tool_use",
                        id="tu_pyramid_1",
                        name="pyramid_fill",
                        input={
                            "center_lon": 121.4768,
                            "center_lat": -30.7556,
                            "base_width_m": 500,
                            "base_depth_m": 500,
                            "height_m": -200,
                            "wall_angle_deg": 45,
                            "material": "rock",
                            "level": 6,
                        },
                    ),
                ],
                stop_reason="tool_use",
            )
        return _MockResponse(
            [_MockBlock(type="text", text="Done. Pit carved at level 6 (8 m blocks).")],
            stop_reason="end_turn",
        )


async def run(args: argparse.Namespace) -> int:
    if args.dry_run:
        client: object = MockAnthropic()
        print("(dry-run: using mock Claude responses — no API call)")
    else:
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            print("ERROR: ANTHROPIC_API_KEY not set (env or apps/api/.env)", file=sys.stderr)
            return 2
        client = Anthropic(api_key=api_key)
    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(
        site_slug=args.site,
        datum_lon=args.datum_lon,
        datum_lat=args.datum_lat,
        datum_alt=args.datum_alt,
    )

    history: list[dict[str, object]] = [{"role": "user", "content": args.message}]
    tool_call_count = 0

    print(f"── Mai voxel test ─────────────────────────────────────────")
    print(f"site:    {args.site}")
    print(f"datum:   {args.datum_lon}, {args.datum_lat}, {args.datum_alt}")
    print(f"model:   {args.model}")
    print(f"prompt:  {args.message}")
    print(f"───────────────────────────────────────────────────────────")

    for round_idx in range(args.max_rounds):
        response = client.messages.create(
            model=args.model,
            max_tokens=4096,
            system=system_prompt,
            tools=VOXEL_TOOLS,
            messages=history,
        )

        # Surface assistant text from this round.
        for block in response.content:
            if block.type == "text" and block.text.strip():
                print(f"\n[round {round_idx + 1}] Claude: {block.text}")

        tool_uses = [b for b in response.content if b.type == "tool_use"]

        if not tool_uses or response.stop_reason in ("end_turn", "stop_sequence"):
            print(f"\n── done ───────────────────────────────────────────────────")
            print(f"stop_reason: {response.stop_reason}")
            print(f"rounds:      {round_idx + 1}")
            print(f"tool_calls:  {tool_call_count}")
            print(
                f"tokens:      {response.usage.input_tokens} in / "
                f"{response.usage.output_tokens} out"
            )
            return 0

        history.append({"role": "assistant", "content": response.content})

        results: list[dict[str, object]] = []
        for tool in tool_uses:
            tool_call_count += 1
            print(f"\n  🔧 [{tool.name}] {json.dumps(dict(tool.input), indent=2)}")
            try:
                result = await execute_voxel_tool(tool.name, dict(tool.input))
                is_error = False
            except Exception as e:  # noqa: BLE001
                result = {"error": f"{type(e).__name__}: {e}"}
                is_error = True
            print(f"  ← {json.dumps(result, indent=2)}")
            results.append({
                "type": "tool_result",
                "tool_use_id": tool.id,
                "content": json.dumps(result),
                "is_error": is_error,
            })

        history.append({"role": "user", "content": results})

    print(f"\n── round cap reached ──────────────────────────────────────")
    print(f"tool_calls: {tool_call_count}")
    return 1


def main() -> int:
    load_env_file(REPO / "apps" / "api" / ".env")
    load_env_file(REPO / ".env")
    args = parse_args()
    try:
        return asyncio.run(run(args))
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
