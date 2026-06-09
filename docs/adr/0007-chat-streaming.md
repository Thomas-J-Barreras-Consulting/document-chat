# ADR-0007: Chat streaming via SSE with Claude + inline-marker citations

- Status: accepted
- Date: 2026-06-08
- Deciders: @tombarreras, @chrisbarreras

## Context and Problem Statement

Tier 1 needs to ship a working chat endpoint that streams an LLM reply with
inline citations (REQ-1.4.3, REQ-1.5.1, REQ-1.5.4). Three coupled decisions:
(1) the streaming protocol on the wire, (2) the LLM provider + how it's
invoked, and (3) how citations get extracted and enforced.

## Decision Drivers

- The OpenAPI sendMessage operation already declares `text/event-stream` as
  one content-type variant, and `chat-events.schema.json` fixes the event
  shapes. The implementation must match this contract exactly.
- The citation contract is hard: every chunk_id referenced in a token MUST
  be pre-declared in a `citation` event (REQ-1.5.4 — no hallucinated
  citations). Need a reliable way to enforce this regardless of LLM output.
- architecture.md names Claude as the primary LLM ("best citation behavior
  in our use case").
- We want to ship without an SDK runtime dependency where reasonable —
  Anthropic's stream protocol is small enough to parse with `fetch` + a
  text decoder.
- The orchestration has to be unit-testable without standing up Supabase or
  hitting Anthropic, so deps must be injectable.

## Considered Options

### Wire protocol

- **A1. Server-Sent Events (SSE)** (chosen)
- A2. WebSocket / JSON-over-fetch chunks
- A3. Long-poll with JSON deltas

### LLM provider

- **B1. Anthropic Claude via direct fetch to `/v1/messages`** (chosen)
- B2. Anthropic via the official `@anthropic-ai/sdk`
- B3. OpenAI as primary (defer Claude to later)

### Citation pattern

- **C1. Inline `[<chunk-uuid>]` markers + pre-declare every retrieved chunk
  as a citation event** (chosen)
- C2. Inline markers, declare citations only for actually-cited chunks
- C3. Tool-use: the LLM calls a `cite(chunk_id)` tool

## Decision Outcome

**Protocol: A1 — SSE.** The contract is already SSE; reusing the browser's
`EventSource` API in the chat UI (chunk #16) is the path of least friction.
Frame shape per the spec: `event: <type>\nid: <int>\ndata: <json>\n\n`.

**Provider: B1 — Anthropic via direct fetch.** Implementation lives in
`packages/retrieval/src/providers/anthropic.ts` as a typed async generator
that parses Anthropic's SSE frames and yields normalized events
(`text_delta`, `usage`, `stop`, `error`). No SDK runtime dep; the generator
can be stubbed in tests with a hand-rolled async iterable. The model
identifier comes from architecture.md (claude-opus-4-7 as the default).

**Citations: C1 — inline markers + pre-declare every retrieved chunk.**
The orchestrator emits a `citation` event for each chunk that the
retrieval step surfaced, *before* any tokens stream. The system prompt
instructs the LLM to insert `[<chunk-uuid>]` after each cited claim. After
the stream completes, a small parser walks the accumulated content,
strips any marker whose UUID wasn't in the retrieval set, and records the
distinct chunks the LLM actually used (in first-seen order) for the
`citations` table.

This pattern has three nice properties:
- The SSE schema constraint ("every chunk_id in tokens must appear in a
  prior citation event") is satisfied by construction — citations for the
  whole retrieval set are emitted up-front.
- REQ-1.5.4 is enforced by the post-stream strip pass; a hallucinated id
  never reaches the client's persisted content.
- The citation rows we persist match what the LLM actually referenced, not
  the larger retrieval set — keeps the message clean.

The pure orchestrator (`runChatTurn`) takes deps via dependency injection:
`retrieve`, `stream`, `persistAssistant`, `newId`, `now`. The route handler
wires production deps; unit tests pass stubs.

### Consequences

- Good: contract-exact SSE event sequence; client UI is trivial with
  `EventSource`.
- Good: no Anthropic SDK runtime dep; the provider is ~150 lines of
  fetch + parsing.
- Good: citation correctness is enforced once, in one place; the LLM's
  cooperation is best-effort, but a hostile or sloppy LLM can't sneak a
  fake citation past the post-stream filter.
- Good: orchestrator is pure with respect to deps; tests cover the full
  event sequence without mocking modules.
- Bad: switching providers means another async-generator implementation
  matching the same event shape. Mitigated by the narrow interface
  (`AnthropicStreamEvent`); any provider that produces text+usage+stop
  can plug in.
- Bad: SSE doesn't support backpressure as cleanly as WebSocket. Acceptable
  for chat reply traffic.
- Bad: long-running requests on Vercel serverless functions have a 60s
  default cap (300s on Pro). A chat reply over that limit will drop. The
  chat UI handles this via `Last-Event-ID` resume in a later Tier 2 chunk;
  for Tier 1 we accept the cap.

## Pros and Cons of the Options

### A1. SSE
- Pro: contract already specifies SSE; native browser support; simple
  unidirectional flow
- Con: 60s Vercel serverless cap; no backpressure

### A2. WebSocket
- Pro: bidirectional, no time cap
- Con: requires migrating the contract; loses native EventSource client

### A3. Long-poll
- Pro: works behind anything
- Con: terrible for first-token latency; not what the spec declares

### B1. Anthropic via direct fetch
- Pro: no SDK runtime dep; small surface area; easy to stub in tests
- Con: SDK version drift requires manual chasing of stream-protocol changes

### B2. Anthropic SDK
- Pro: handled retries/version drift
- Con: extra dep; the SDK's stream API is convenient but not necessary

### B3. OpenAI as primary
- Pro: single-vendor (we already use OpenAI for embeddings)
- Con: architecture.md picked Claude on citation quality — that decision
  shouldn't be revisited in chunk #15

### C1. Pre-declare every retrieved chunk
- Pro: satisfies the SSE schema "must pre-declare" rule by construction
- Pro: REQ-1.5.4 enforced at the post-stream strip pass
- Con: emits more citation events than the LLM ends up using; the client
  filters when rendering

### C2. Declare only what's cited
- Pro: leaner SSE stream
- Con: requires either two-pass generation or peeking ahead in the token
  stream to declare citations before referencing them — both are messy

### C3. Tool-use citations
- Pro: structured, model-validated
- Con: complicates the request/response shape; doubles round-trip
  complexity for marginal Tier 1 benefit

## Links

- [REQ-1.4.3 — Streaming responses](../../requirements.md#req-143--streaming-responses)
- [REQ-1.5.1 — Inline citations](../../requirements.md#req-151--inline-citations)
- [REQ-1.5.4 — No hallucinated citations](../../requirements.md#req-154--no-hallucinated-citations)
- [chat-events.schema.json](../../packages/contracts/chat-events.schema.json)
- [ADR-0006 — Embeddings + retrieval](./0006-embeddings-and-retrieval.md)
- [architecture.md — Claude as primary LLM](../../architecture.md)
