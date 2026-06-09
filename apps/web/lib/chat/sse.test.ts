// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import { frame, sseResponse, type ChatEvent } from './sse';

const MSG_ID = '11111111-1111-1111-1111-111111111111';
const CHAT_ID = '22222222-2222-2222-2222-222222222222';

describe('frame', () => {
  it('produces a well-formed SSE frame ending in a blank line', () => {
    const out = frame(
      {
        event: 'stream_start',
        data: {
          message_id: MSG_ID,
          chat_id: CHAT_ID,
          model: 'claude-opus-4-7',
          started_at: '2026-06-08T00:00:00.000Z',
        },
      },
      7,
    );
    expect(out).toMatch(/^event: stream_start\n/);
    expect(out).toMatch(/\nid: 7\n/);
    expect(out).toMatch(/\ndata: \{.*"message_id":"11111111-1111-1111-1111-111111111111".*\}\n\n$/);
  });

  it('escapes embedded JSON correctly via JSON.stringify', () => {
    const out = frame(
      {
        event: 'token',
        data: { message_id: MSG_ID, delta: 'line1\nline2', index: 3 },
      },
      0,
    );
    // The literal `\n` inside the delta becomes `\\n` in the JSON body, so
    // the SSE wire frame has no spurious blank line.
    expect(out.split('\n\n')).toHaveLength(2); // one frame + trailing terminator
    expect(out).toContain('"delta":"line1\\nline2"');
  });
});

async function* arrayEvents(events: ChatEvent[]): AsyncGenerator<ChatEvent> {
  for (const e of events) yield e;
}

async function readBody(res: Response): Promise<string> {
  return await new Response(res.body).text();
}

describe('sseResponse', () => {
  it('sets the SSE response headers', async () => {
    const res = sseResponse(arrayEvents([]));
    expect(res.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('no-cache, no-transform');
    expect(res.status).toBe(200);
    expect(await readBody(res)).toBe('');
  });

  it('numbers ids monotonically across events', async () => {
    const res = sseResponse(
      arrayEvents([
        {
          event: 'stream_start',
          data: { message_id: MSG_ID, chat_id: CHAT_ID, model: 'm', started_at: 'now' },
        },
        { event: 'token', data: { message_id: MSG_ID, delta: 'hi', index: 0 } },
      ]),
    );
    const body = await readBody(res);
    expect(body).toContain('id: 0\n');
    expect(body).toContain('id: 1\n');
    expect(body.indexOf('id: 0')).toBeLessThan(body.indexOf('id: 1'));
  });

  it('emits a terminal error frame when the generator throws', async () => {
    async function* boom(): AsyncGenerator<ChatEvent> {
      yield {
        event: 'stream_start',
        data: { message_id: MSG_ID, chat_id: CHAT_ID, model: 'm', started_at: 'now' },
      };
      throw new Error('upstream broke');
    }
    const res = sseResponse(boom());
    const body = await readBody(res);
    expect(body).toContain('event: stream_start');
    expect(body).toContain('event: error');
    expect(body).toContain('"chat.stream_failed"');
    expect(body).toContain('upstream broke');
  });
});
