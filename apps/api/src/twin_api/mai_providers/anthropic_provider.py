"""AnthropicProvider — Claude API via the official Anthropic SDK.

Uses adaptive thinking by default (cheap on cost, lets the model decide
how much to reason per round). Tool definitions translate 1:1 — the
canonical ``ToolDef`` shape is already Anthropic's native format."""

from __future__ import annotations

from typing import Any

from anthropic import Anthropic
from anthropic import APIError as AnthropicAPIError

from .base import LLMProvider, NormMsg, ProviderResponse, ToolCall, ToolDef


class AnthropicProvider(LLMProvider):
    name = "anthropic"

    def __init__(self, api_key: str) -> None:
        if not api_key:
            raise ValueError("Anthropic API key is required.")
        self._client = Anthropic(api_key=api_key)

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
                "name": t.name,
                "description": t.description,
                "input_schema": t.input_schema,
            }
            for t in tools
        ]
        wire_messages = [_to_anthropic_message(m) for m in messages]

        try:
            resp = self._client.messages.create(
                model=model,
                max_tokens=4096,
                system=system,
                tools=wire_tools,
                messages=wire_messages,
            )
        except AnthropicAPIError as e:
            return ProviderResponse(
                text="",
                tool_calls=[],
                stop_reason="error",
                error_message=f"Anthropic API: {e}",
            )

        text_parts: list[str] = []
        tool_calls: list[ToolCall] = []
        for block in resp.content:
            if block.type == "text":
                text_parts.append(block.text)
            elif block.type == "tool_use":
                tool_calls.append(
                    ToolCall(id=block.id, name=block.name, input=dict(block.input))
                )

        # Map Anthropic's stop reasons. ``stop_sequence`` and ``max_tokens``
        # also count as terminal (no more tool calls coming) — the
        # orchestrator bases its loop on ``tool_calls`` being empty.
        sr = resp.stop_reason or "end_turn"
        if sr == "tool_use":
            stop_reason = "tool_use"
        elif sr == "refusal":
            stop_reason = "refusal"
        elif sr == "max_tokens":
            stop_reason = "max_tokens"
        else:
            stop_reason = "end_turn"

        return ProviderResponse(
            text="".join(text_parts),
            tool_calls=tool_calls,
            stop_reason=stop_reason,
            input_tokens=resp.usage.input_tokens,
            output_tokens=resp.usage.output_tokens,
        )


def _to_anthropic_message(m: NormMsg) -> dict[str, Any]:
    """Translate a normalized message to Anthropic's content-block form.

    User + tool_results → a user turn whose content is a list of
    ``tool_result`` blocks. Assistant + tool_calls → an assistant turn
    whose content is text blocks (if any) followed by ``tool_use``
    blocks. Bare text → ``role`` with a string content."""
    if m.tool_results:
        return {
            "role": "user",
            "content": [
                {
                    "type": "tool_result",
                    "tool_use_id": r.id,
                    "content": r.output,
                    "is_error": r.is_error,
                }
                for r in m.tool_results
            ],
        }
    if m.tool_calls:
        blocks: list[dict[str, Any]] = []
        if m.text:
            blocks.append({"type": "text", "text": m.text})
        for c in m.tool_calls:
            blocks.append(
                {"type": "tool_use", "id": c.id, "name": c.name, "input": c.input}
            )
        return {"role": "assistant", "content": blocks}
    return {"role": m.role, "content": m.text or ""}
