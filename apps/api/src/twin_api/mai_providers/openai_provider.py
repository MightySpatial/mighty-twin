"""OpenAICompatProvider — covers every /v1/chat/completions endpoint.

OpenAI, Ollama (≥0.5 with tool calling), Groq, Together, Fireworks,
OpenRouter, Mistral, DeepSeek, xAI, Perplexity, LM Studio, and any
"openai-compatible" custom URL all share the same wire format. One
implementation, one base URL knob.

Tool calling: OpenAI wraps each tool in ``{"type":"function","function":
{name,description,parameters}}``. The model returns ``tool_calls`` on the
assistant message — each entry has a JSON-string ``arguments`` field
which we parse back into a dict for the canonical ``ToolCall``.
"""

from __future__ import annotations

import json
from typing import Any

import httpx

from .base import LLMProvider, NormMsg, ProviderResponse, ToolCall, ToolDef

# Default base URLs per provider id. Mirrors the frontend DEFAULTS map in
# `apps/web/src/ai/client.ts` so the server picks the same endpoint the
# UI documents in its picker.
_DEFAULTS: dict[str, str] = {
    "openai":              "https://api.openai.com/v1",
    # openai-codex shares the OpenAI Chat Completions endpoint — the
    # only difference is the bearer credential (codex_sess_… token
    # instead of sk-… API key). Wire format is identical.
    "openai-codex":        "https://api.openai.com/v1",
    "openrouter":          "https://openrouter.ai/api/v1",
    "groq":                "https://api.groq.com/openai/v1",
    "together":            "https://api.together.xyz/v1",
    "fireworks":           "https://api.fireworks.ai/inference/v1",
    "perplexity":          "https://api.perplexity.ai",
    "mistral":             "https://api.mistral.ai/v1",
    "deepseek":            "https://api.deepseek.com/v1",
    "xai":                 "https://api.x.ai/v1",
    "ollama":              "http://localhost:11434/v1",
    "lmstudio":            "http://localhost:1234/v1",
    "openai-compatible":   "",
}


class OpenAICompatProvider(LLMProvider):
    """One class for every OpenAI-compatible endpoint. Distinguishable
    only by ``name`` (used for error messages + the SSE start event)
    and ``base_url`` (the actual endpoint to POST to)."""

    def __init__(
        self,
        *,
        provider_name: str,
        api_key: str | None,
        base_url: str | None = None,
    ) -> None:
        self.name = provider_name
        # base_url priority: explicit override → preset default → require
        # an explicit value (openai-compatible has no preset, so the
        # caller must supply one).
        resolved = (base_url or "").strip() or _DEFAULTS.get(provider_name, "")
        if not resolved:
            raise ValueError(
                f"Provider {provider_name!r} requires an explicit base_url."
            )
        self._base_url = resolved.rstrip("/")
        # Local providers (ollama, lmstudio) don't need a key; everything
        # else does. We don't enforce here because openai-compatible
        # custom endpoints might or might not — let the upstream 401.
        self._api_key = api_key

    async def call(
        self,
        *,
        system: str,
        tools: list[ToolDef],
        messages: list[NormMsg],
        model: str,
    ) -> ProviderResponse:
        wire_tools = [
            {
                "type": "function",
                "function": {
                    "name": t.name,
                    "description": t.description,
                    "parameters": t.input_schema,
                },
            }
            for t in tools
        ]
        wire_messages: list[dict[str, Any]] = []
        if system:
            wire_messages.append({"role": "system", "content": system})
        for m in messages:
            wire_messages.extend(_to_openai_messages(m))

        headers: dict[str, str] = {"content-type": "application/json"}
        if self._api_key:
            headers["authorization"] = f"Bearer {self._api_key}"

        body: dict[str, Any] = {
            "model": model,
            "messages": wire_messages,
            "max_tokens": 4096,
        }
        if wire_tools:
            body["tools"] = wire_tools

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                r = await client.post(
                    f"{self._base_url}/chat/completions",
                    headers=headers,
                    json=body,
                )
        except httpx.HTTPError as e:
            return ProviderResponse(
                text="",
                tool_calls=[],
                stop_reason="error",
                error_message=f"{self.name} request failed: {e}",
            )

        if r.status_code >= 400:
            return ProviderResponse(
                text="",
                tool_calls=[],
                stop_reason="error",
                error_message=f"{self.name} {r.status_code}: {r.text[:500]}",
            )

        try:
            data = r.json()
        except json.JSONDecodeError as e:
            return ProviderResponse(
                text="",
                tool_calls=[],
                stop_reason="error",
                error_message=f"{self.name}: malformed JSON response ({e})",
            )

        choice = (data.get("choices") or [{}])[0]
        msg = choice.get("message") or {}
        text = msg.get("content") or ""
        if not isinstance(text, str):
            # OpenAI sometimes returns null for content when only tool
            # calls fire; coerce to empty string so the SSE consumer
            # doesn't render the literal "None".
            text = ""

        tool_calls: list[ToolCall] = []
        for tc in msg.get("tool_calls") or []:
            fn = tc.get("function") or {}
            args_raw = fn.get("arguments") or "{}"
            try:
                args = json.loads(args_raw) if isinstance(args_raw, str) else dict(args_raw)
            except json.JSONDecodeError:
                # Some models occasionally produce un-parseable arguments
                # under load. Surface as a tool call with empty input
                # plus the raw string so the orchestrator can route a
                # tool_result back explaining the parse failure.
                args = {"_raw_arguments": args_raw, "_parse_error": True}
            tool_calls.append(
                ToolCall(id=tc.get("id") or "", name=fn.get("name") or "", input=args)
            )

        finish_reason = choice.get("finish_reason") or "stop"
        if finish_reason == "tool_calls":
            stop_reason = "tool_use"
        elif finish_reason == "length":
            stop_reason = "max_tokens"
        elif finish_reason == "content_filter":
            stop_reason = "refusal"
        else:
            stop_reason = "end_turn"

        usage = data.get("usage") or {}
        return ProviderResponse(
            text=text,
            tool_calls=tool_calls,
            stop_reason=stop_reason,
            input_tokens=int(usage.get("prompt_tokens") or 0),
            output_tokens=int(usage.get("completion_tokens") or 0),
        )


def _to_openai_messages(m: NormMsg) -> list[dict[str, Any]]:
    """Translate a normalized message to OpenAI's wire format.

    OpenAI splits tool results into one ``role: tool`` message per
    result (each carrying its own ``tool_call_id``), so a single
    ``NormMsg`` can expand to multiple wire messages. Assistant turns
    that called tools collapse into one assistant message with
    ``content`` (text) plus a ``tool_calls`` array."""
    if m.tool_results:
        return [
            {
                "role": "tool",
                "tool_call_id": r.id,
                "content": r.output,
            }
            for r in m.tool_results
        ]
    if m.tool_calls:
        return [
            {
                "role": "assistant",
                "content": m.text or None,
                "tool_calls": [
                    {
                        "id": c.id,
                        "type": "function",
                        "function": {
                            "name": c.name,
                            # Arguments must be a JSON string per the
                            # OpenAI schema, even when round-tripping our
                            # own previous response.
                            "arguments": json.dumps(c.input),
                        },
                    }
                    for c in m.tool_calls
                ],
            }
        ]
    return [{"role": m.role, "content": m.text or ""}]
