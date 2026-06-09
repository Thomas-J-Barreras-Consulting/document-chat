// SPDX-License-Identifier: Apache-2.0
//
// SSE event serializer for the chat reply stream. Frame shape per the
// OpenAPI sendMessage description:
//     event: <type>
//     id:    <monotonic-int>
//     data:  <json>
//
// Each event must validate against `chat-events.schema.json`. The shapes
// below mirror that schema; the validation lives in the unit test (and the
// existing AJV harness in packages/contracts/src/test-utils).

import type { components } from '@document-chat/contracts';

type Citation = components['schemas']['Citation'];
type Message = components['schemas']['Message'];
type Problem = components['schemas']['Problem'];

/** Discriminated union of the events we emit at Tier 1. */
export type ChatEvent =
  | {
      event: 'stream_start';
      data: { message_id: string; chat_id: string; model: string; started_at: string };
    }
  | {
      event: 'retrieval_started';
      data: { message_id: string; top_k: number; mode: 'vector'; as_of_date: null };
    }
  | {
      event: 'retrieval_completed';
      data: { message_id: string; chunk_ids: string[]; elapsed_ms: number };
    }
  | { event: 'citation'; data: { message_id: string; citation: Citation } }
  | { event: 'token'; data: { message_id: string; delta: string; index: number } }
  | {
      event: 'usage';
      data: {
        message_id: string;
        input_tokens: number;
        output_tokens: number;
        total_tokens: number;
      };
    }
  | {
      event: 'message_completed';
      data: {
        message_id: string;
        finish_reason: 'stop' | 'length' | 'content_filter' | 'error';
        full_message: Message;
      };
    }
  | { event: 'error'; data: { message_id: string | null; problem: Problem } };

/**
 * Serialize one chat event to its wire frame, including the trailing blank
 * line that separates SSE frames.
 */
export function frame(event: ChatEvent, id: number): string {
  return `event: ${event.event}\nid: ${id}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

/**
 * Build an SSE Response from an async generator of events. Sets the
 * required headers (`text/event-stream`, no cache, keep-alive) and feeds
 * frames through a TextEncoder so the body is a real ReadableStream of
 * bytes — Next.js streams these as fast as the LLM produces them.
 *
 * Each yielded event is auto-assigned a monotonic `id`, so callers
 * shouldn't number frames themselves.
 */
export function sseResponse(
  events: AsyncIterable<ChatEvent>,
): Response {
  const encoder = new TextEncoder();
  let id = 0;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        for await (const event of events) {
          controller.enqueue(encoder.encode(frame(event, id++)));
        }
        controller.close();
      } catch (err) {
        // Emit a final SSE error frame instead of dropping the stream silently;
        // the client UI can render the message.
        const problem: Problem = {
          type: 'https://docs.knowledge-graph.dev/errors/chat-stream-failed',
          title: 'Chat stream failed',
          status: 500,
          code: 'chat.stream_failed',
          request_id: crypto.randomUUID(),
          detail: err instanceof Error ? err.message : String(err),
        };
        controller.enqueue(
          encoder.encode(
            frame(
              { event: 'error', data: { message_id: null, problem } },
              id++,
            ),
          ),
        );
        controller.close();
      }
    },
  });
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
}
