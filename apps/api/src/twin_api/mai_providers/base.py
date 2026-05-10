"""LLM provider abstraction for Mai's voxel tool-use loop.

The voxel tool catalogue is defined once in canonical (Anthropic-style)
JSON Schema. Each provider translates messages + tools to its native
wire format and parses responses back into the same ``ProviderResponse``
shape. The orchestrator in ``mai_voxel_routes`` is provider-agnostic.

Design constraints:
  • Stateless providers — the orchestrator owns the message history in
    normalized form (``NormMsg``) and passes it to ``call()`` each round.
    This keeps providers easy to test and lets the orchestrator persist
    history without coupling to a wire format.
  • Tool-call parity — every provider must surface ``ToolCall`` objects
    with stable ``id`` / ``name`` / ``input`` even when the underlying
    API uses different fields (Anthropic's ``tool_use`` blocks vs
    OpenAI's ``tool_calls`` array with JSON-string arguments).
  • One round per call — ``call()`` returns after a single round-trip.
    Multi-round tool-use loops are the orchestrator's job.

Spec V1: voxel_routes §provider abstraction.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Literal


@dataclass
class ToolDef:
    """Canonical tool definition. Matches Anthropic's input_schema shape
    (a JSON Schema for the tool's input). The OpenAI-compat provider
    wraps this in its ``{"type": "function", "function": {…}}`` envelope
    at translation time."""

    name: str
    description: str
    input_schema: dict[str, Any]


@dataclass
class ToolCall:
    """A request from the model to invoke a tool.

    ``id`` is the provider-assigned correlation id — the orchestrator
    must echo it back in the matching ``ToolResult`` so the next round
    can resolve which call produced which output."""

    id: str
    name: str
    input: dict[str, Any]


@dataclass
class ToolResult:
    """The orchestrator's reply to a ``ToolCall``. ``output`` is a
    JSON-serialised string — providers stringify it differently
    (Anthropic accepts strings or arrays of content blocks; OpenAI
    expects a string), but a JSON string is the universal lowest
    common denominator."""

    id: str
    name: str
    output: str
    is_error: bool = False


@dataclass
class NormMsg:
    """Normalized message — captures the union of role + content shapes
    we need without committing to one provider's wire format.

    Exactly one of ``text`` / ``tool_calls`` / ``tool_results`` is
    populated:
      • ``user`` + text         → a plain user prompt
      • ``user`` + tool_results → reply with tool outputs (after the
                                  assistant called tools last round)
      • ``assistant`` + text    → a plain assistant reply
      • ``assistant`` + tool_calls (and optional text) → assistant
                                  decided to call one or more tools
    """

    role: Literal["user", "assistant"]
    text: str | None = None
    tool_calls: list[ToolCall] = field(default_factory=list)
    tool_results: list[ToolResult] = field(default_factory=list)


StopReason = Literal["end_turn", "tool_use", "max_tokens", "refusal", "error"]


@dataclass
class ProviderResponse:
    """One round's worth of model output — text + tool calls + reason
    why the round ended. Token usage is best-effort: providers that
    don't surface usage report zeros."""

    text: str
    tool_calls: list[ToolCall]
    stop_reason: StopReason
    input_tokens: int = 0
    output_tokens: int = 0
    error_message: str | None = None


class LLMProvider(ABC):
    """One round-trip to the model. Subclasses translate to the wire
    format and parse the response. Stateless by design — the
    orchestrator owns the conversation."""

    #: Stable provider id (matches the `provider` field in the request
    #: body and the AGENT_PRESETS list on the frontend).
    name: str = ""

    @abstractmethod
    async def call(
        self,
        *,
        system: str,
        tools: list[ToolDef],
        messages: list[NormMsg],
        model: str,
    ) -> ProviderResponse:
        """Send one request, parse the response into a normalized
        ``ProviderResponse``.

        Implementations must:
          • Translate ``messages`` to the provider's wire format
            (carrying tool calls + tool results through verbatim — we
            depend on round-trip integrity for the next call).
          • Translate ``tools`` to the provider's tool/function schema.
          • Parse the response into a single text string + a list of
            ``ToolCall`` objects with stable ids.
          • Map the provider's stop reason to ``StopReason``. When in
            doubt, ``"end_turn"`` is the safe default — the
            orchestrator stops looping when there are no more tool
            calls regardless of the stop reason.
        """
