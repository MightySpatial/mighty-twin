#!/usr/bin/env python3
"""CLI test for Mai's voxel tool-use loop (provider-agnostic).

Exercises the same VOXEL_TOOLS catalogue, system prompt, tool
dispatcher, and provider abstraction that ``/api/mai/chat`` uses, but
without spinning up FastAPI / the DB. The point is to verify the
chosen LLM calls the right tools in the right order with sensible
inputs — the SSE plumbing is a thin wrapper above this loop.

Reads the matching API key from env (or ``apps/api/.env``). The exact
env var depends on ``--provider``:

    anthropic   → ANTHROPIC_API_KEY
    openai      → OPENAI_API_KEY
    groq        → GROQ_API_KEY
    together    → TOGETHER_API_KEY
    fireworks   → FIREWORKS_API_KEY
    openrouter  → OPENROUTER_API_KEY
    perplexity  → PERPLEXITY_API_KEY
    mistral     → MISTRAL_API_KEY
    deepseek    → DEEPSEEK_API_KEY
    xai         → XAI_API_KEY
    ollama      → (no key required)
    lmstudio    → (no key required)

Usage:
    python scripts/test_mai_voxel.py \\
        --site space-angel \\
        --message "Draw an open pit, 500m wide, 200m deep, 45° walls, at the centre"

    python scripts/test_mai_voxel.py --provider openai --model gpt-4o-mini ...
    python scripts/test_mai_voxel.py --provider ollama --model llama3.2 ...
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

from twin_api.mai_providers import (  # noqa: E402
    LLMProvider,
    NormMsg,
    ProviderResponse,
    ToolCall,
    ToolResult,
    get_provider,
)
from twin_api.mai_voxel_routes import (  # noqa: E402
    DEFAULT_MODELS,
    MAX_TOOL_ROUNDS,
    SYSTEM_PROMPT_TEMPLATE,
    VOXEL_TOOLS,
    execute_voxel_tool,
)


# Per-provider env var name. Only providers that need an API key have
# an entry; ollama / lmstudio are local and accept None.
PROVIDER_ENV_VARS: dict[str, str] = {
    "anthropic":           "ANTHROPIC_API_KEY",
    "openai":              "OPENAI_API_KEY",
    "groq":                "GROQ_API_KEY",
    "together":            "TOGETHER_API_KEY",
    "fireworks":           "FIREWORKS_API_KEY",
    "openrouter":          "OPENROUTER_API_KEY",
    "perplexity":          "PERPLEXITY_API_KEY",
    "mistral":             "MISTRAL_API_KEY",
    "deepseek":            "DEEPSEEK_API_KEY",
    "xai":                 "XAI_API_KEY",
    "openai-compatible":   "OPENAI_COMPATIBLE_API_KEY",
}


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
    p = argparse.ArgumentParser(
        description="Exercise Mai's tool-use loop end-to-end against any supported provider.",
    )
    p.add_argument("--site", default="space-angel", help="Site slug (used in the system prompt).")
    p.add_argument(
        "--message",
        default="Draw a simple open cut mine pit, 500m wide, 200m deep, 45 degree walls, at the centre of the site",
        help="The user prompt to send to the model.",
    )
    p.add_argument("--datum-lon", type=float, default=121.4768, help="Datum lon for the system prompt.")
    p.add_argument("--datum-lat", type=float, default=-30.7556, help="Datum lat for the system prompt.")
    p.add_argument("--datum-alt", type=float, default=350.0, help="Datum alt for the system prompt.")
    p.add_argument(
        "--provider",
        default="anthropic",
        choices=[
            "anthropic", "openai", "openrouter", "groq", "together", "fireworks",
            "perplexity", "mistral", "deepseek", "xai", "ollama", "lmstudio",
            "openai-compatible",
        ],
        help="LLM provider id (matches AGENT_PRESETS on the frontend).",
    )
    p.add_argument(
        "--model",
        default=None,
        help="Model id. Defaults to the provider's preset (e.g. claude-sonnet-4-6).",
    )
    p.add_argument(
        "--base-url",
        default=None,
        help="OpenAI-compat base URL override (Ollama on a non-default port, vLLM, etc.).",
    )
    p.add_argument("--max-rounds", type=int, default=MAX_TOOL_ROUNDS, help="Tool-use round cap.")
    p.add_argument(
        "--dry-run",
        action="store_true",
        help=(
            "Skip the live API and replay a canned tool-use script "
            "(search_location → pyramid_fill → final text). Useful for "
            "smoke-testing the dispatcher without burning tokens."
        ),
    )
    return p.parse_args()


# ── Mock provider (dry-run only) ────────────────────────────────────────


class MockProvider(LLMProvider):
    """Replay a fixed two-round tool-use trace so we can exercise the
    dispatcher + history bookkeeping without hitting any provider.
    Mirrors a plausible model response to the canned --message."""

    name = "mock"

    def __init__(self) -> None:
        self._round = 0

    async def call(self, **kwargs) -> ProviderResponse:  # noqa: ARG002
        self._round += 1
        if self._round == 1:
            return ProviderResponse(
                text=(
                    "I'll geocode the site centre first to confirm the "
                    "anchor point, then carve the pit."
                ),
                tool_calls=[
                    ToolCall(
                        id="tu_search_1",
                        name="search_location",
                        input={"query": "Kalgoorlie Super Pit"},
                    )
                ],
                stop_reason="tool_use",
            )
        if self._round == 2:
            return ProviderResponse(
                text="Got it. Carving a 500×500 m pit, 200 m deep, 45° walls, at the search hit.",
                tool_calls=[
                    ToolCall(
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
                    )
                ],
                stop_reason="tool_use",
            )
        return ProviderResponse(
            text="Done. Pit carved at level 6 (8 m blocks).",
            tool_calls=[],
            stop_reason="end_turn",
        )


# ── Loop ────────────────────────────────────────────────────────────────


async def run(args: argparse.Namespace) -> int:
    if args.dry_run:
        provider: LLMProvider = MockProvider()
        provider_label = "mock (dry-run)"
        model = args.model or DEFAULT_MODELS.get(args.provider) or "(none)"
        print("(dry-run: using mock responses — no API call)")
    else:
        env_var = PROVIDER_ENV_VARS.get(args.provider)
        api_key = os.environ.get(env_var) if env_var else None
        if env_var and not api_key and args.provider not in ("ollama", "lmstudio"):
            print(f"ERROR: {env_var} not set (env or apps/api/.env)", file=sys.stderr)
            return 2
        try:
            provider = get_provider(
                args.provider,
                api_key=api_key,
                base_url=args.base_url,
            )
        except ValueError as e:
            print(f"ERROR: {e}", file=sys.stderr)
            return 2
        model = args.model or DEFAULT_MODELS.get(args.provider) or ""
        if not model:
            print(
                f"ERROR: --model required for provider {args.provider!r} "
                "(no preset).",
                file=sys.stderr,
            )
            return 2
        provider_label = args.provider

    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(
        site_slug=args.site,
        datum_lon=args.datum_lon,
        datum_lat=args.datum_lat,
        datum_alt=args.datum_alt,
    )
    history: list[NormMsg] = [NormMsg(role="user", text=args.message)]
    tool_call_count = 0
    total_input_tokens = 0
    total_output_tokens = 0

    print("── Mai voxel test ─────────────────────────────────────────")
    print(f"provider:  {provider_label}")
    print(f"model:     {model}")
    print(f"site:      {args.site}")
    print(f"datum:     {args.datum_lon}, {args.datum_lat}, {args.datum_alt}")
    print(f"prompt:    {args.message}")
    print("───────────────────────────────────────────────────────────")

    for round_idx in range(args.max_rounds):
        resp = await provider.call(
            system=system_prompt,
            tools=VOXEL_TOOLS,
            messages=history,
            model=model,
        )
        total_input_tokens += resp.input_tokens
        total_output_tokens += resp.output_tokens

        if resp.stop_reason == "error":
            print(f"\nERROR: {resp.error_message}", file=sys.stderr)
            return 1

        if resp.text.strip():
            print(f"\n[round {round_idx + 1}] {provider_label}: {resp.text}")

        if not resp.tool_calls:
            print("\n── done ───────────────────────────────────────────────────")
            print(f"stop_reason: {resp.stop_reason}")
            print(f"rounds:      {round_idx + 1}")
            print(f"tool_calls:  {tool_call_count}")
            print(f"tokens:      {total_input_tokens} in / {total_output_tokens} out")
            return 0

        history.append(
            NormMsg(role="assistant", text=resp.text or None, tool_calls=resp.tool_calls)
        )

        tool_results: list[ToolResult] = []
        for tool in resp.tool_calls:
            tool_call_count += 1
            print(f"\n  🔧 [{tool.name}] {json.dumps(dict(tool.input), indent=2)}")
            try:
                result = await execute_voxel_tool(tool.name, dict(tool.input))
                is_error = False
            except Exception as e:  # noqa: BLE001
                result = {"error": f"{type(e).__name__}: {e}"}
                is_error = True
            print(f"  ← {json.dumps(result, indent=2)}")
            tool_results.append(
                ToolResult(
                    id=tool.id,
                    name=tool.name,
                    output=json.dumps(result),
                    is_error=is_error,
                )
            )
        history.append(NormMsg(role="user", tool_results=tool_results))

    print("\n── round cap reached ──────────────────────────────────────")
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
