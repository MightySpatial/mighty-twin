"""Mai LLM providers — provider-agnostic wrapper for the voxel chat loop.

Public surface:
  • ``LLMProvider``, ``NormMsg``, ``ToolCall``, ``ToolResult``,
    ``ToolDef``, ``ProviderResponse`` — types the orchestrator passes
    through.
  • ``get_provider(name, *, api_key, base_url)`` — factory that resolves
    a provider id (matching ``AGENT_PRESETS`` on the frontend) to a
    concrete implementation.

The 14 frontend providers collapse to two backend implementations:
``AnthropicProvider`` for Claude, and ``OpenAICompatProvider`` for
everything else (every OpenAI-compatible endpoint shares the same
wire format).
"""

from __future__ import annotations

from .anthropic_provider import AnthropicProvider
from .base import (
    LLMProvider,
    NormMsg,
    ProviderResponse,
    StopReason,
    ToolCall,
    ToolDef,
    ToolResult,
)
from .openai_provider import OpenAICompatProvider

# Provider ids that resolve to OpenAICompatProvider. The frontend's
# AGENT_PRESETS list (apps/web/src/ai/types.ts) is the source of truth;
# this set must stay in sync with it minus 'anthropic' and 'gemini'.
# Gemini uses a different envelope (generateContent, not chat/completions)
# and is on the v2 list — return a clear error until then.
_OPENAI_COMPAT_PROVIDERS = frozenset({
    "openai",
    # openai-codex hits the same Chat Completions endpoint as openai
    # but the bearer credential is a `codex_sess_…` session token
    # captured by the user from `codex auth print` rather than an
    # sk- API key. Wire-format is identical.
    "openai-codex",
    "openrouter",
    "groq",
    "together",
    "fireworks",
    "perplexity",
    "mistral",
    "deepseek",
    "xai",
    "ollama",
    "lmstudio",
    "openai-compatible",
})


def get_provider(
    provider_name: str,
    *,
    api_key: str | None,
    base_url: str | None = None,
) -> LLMProvider:
    """Resolve a provider id to a concrete ``LLMProvider``.

    Raises ``ValueError`` for unknown providers (with a list of valid
    options), Anthropic without an api_key, or openai-compatible
    without a base_url. Local providers (ollama, lmstudio) accept a
    null api_key.
    """
    if provider_name == "anthropic":
        if not api_key:
            raise ValueError(
                "Anthropic provider requires an api_key. Set one in "
                "Settings → AI or ANTHROPIC_API_KEY in the API env."
            )
        return AnthropicProvider(api_key=api_key)

    if provider_name == "gemini":
        # Gemini uses generateContent + a different tool schema. Tracked
        # for v2 — see PORT_PLAN.md. Until then, surface a clean error
        # rather than silently routing to OpenAI-compat.
        raise ValueError(
            "Gemini provider isn't wired yet — pick anthropic, openai, "
            "ollama, or any other OpenAI-compatible provider."
        )

    if provider_name in _OPENAI_COMPAT_PROVIDERS:
        return OpenAICompatProvider(
            provider_name=provider_name,
            api_key=api_key,
            base_url=base_url,
        )

    valid = sorted({"anthropic", "gemini", *_OPENAI_COMPAT_PROVIDERS})
    raise ValueError(
        f"Unknown provider {provider_name!r}. "
        f"Valid options: {', '.join(valid)}."
    )


__all__ = [
    "AnthropicProvider",
    "LLMProvider",
    "NormMsg",
    "OpenAICompatProvider",
    "ProviderResponse",
    "StopReason",
    "ToolCall",
    "ToolDef",
    "ToolResult",
    "get_provider",
]
