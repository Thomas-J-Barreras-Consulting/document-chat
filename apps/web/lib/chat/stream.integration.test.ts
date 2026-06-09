// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import {
  EMBEDDING_DIMENSIONS,
  type AnthropicStreamEvent,
  type SearchResultRow,
} from '@document-chat/retrieval';
import { runChatTurn } from './orchestrate';
import { persistAssistantMessage } from '../chats-store';
import { toContractMessage } from '../chats';
import type { ChatEvent } from './sse';

// Requires a running local Supabase stack (see docs/testing.md). Drives the
// full SSE orchestration end-to-end against real Postgres: seeds chunks,
// stubs the retrieval RPC + LLM stream, runs runChatTurn, and asserts the
// emitted event sequence + the rows persisted to messages + citations.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PASSWORD = 'Password123!';

function makeClient(key: string): SupabaseClient {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
  });
}

async function signedInClient(admin: SupabaseClient, email: string): Promise<SupabaseClient> {
  const { error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  expect(error).toBeNull();
  const client = makeClient(anonKey);
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  expect(signInErr).toBeNull();
  return client;
}

function fakeVector(seed: number): number[] {
  return Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (i === seed ? 1 : 0));
}
function pgVector(v: number[]): string {
  return `[${v.join(',')}]`;
}

async function* fakeStream(text: string): AsyncGenerator<AnthropicStreamEvent> {
  yield { type: 'text_delta', text };
  yield { type: 'usage', input_tokens: 5, output_tokens: 9 };
  yield { type: 'stop', finish_reason: 'stop' };
}

describe('chat stream orchestration (integration)', () => {
  it('persists the assistant message and its citations', async () => {
    const admin = makeClient(serviceKey);
    const client = await signedInClient(admin, `s-${crypto.randomUUID()}@example.com`);

    const { data: ws } = await client.from('workspaces').select('id').single();
    const { data: u } = await client.auth.getUser();

    // Seed a single doc + two chunks so retrieval has something to return.
    const docInsert = await admin
      .from('documents')
      .insert({
        workspace_id: ws!.id,
        title: 'Doc',
        version: '1.0',
        status: 'current',
        size_bytes: 1024,
        page_count: 1,
        content_type: 'application/pdf',
        storage_object_key: `${ws!.id}/${crypto.randomUUID()}.pdf`,
        embedding_model: 'text-embedding-3-small',
        uploaded_by: u.user!.id,
        ingestion_state: 'ready',
      })
      .select('id')
      .single();
    const documentId = (docInsert.data as { id: string }).id;

    const chunkAId = crypto.randomUUID();
    const chunkBId = crypto.randomUUID();
    await admin.from('chunks').insert([
      {
        id: chunkAId,
        document_id: documentId,
        index: 0,
        text: 'first chunk',
        token_count: 10,
        embedding_model: 'text-embedding-3-small',
        page_number: 1,
        char_start: 0,
        char_end: 10,
        embedding: pgVector(fakeVector(0)),
      },
      {
        id: chunkBId,
        document_id: documentId,
        index: 1,
        text: 'second chunk',
        token_count: 12,
        embedding_model: 'text-embedding-3-small',
        page_number: 1,
        char_start: 11,
        char_end: 22,
        embedding: pgVector(fakeVector(7)),
      },
    ]);

    // Open a chat as the user so RLS will allow the orchestration writes
    // referencing the chat.
    const chatInsert = await client
      .from('chats')
      .insert({ workspace_id: ws!.id, user_id: u.user!.id, title: 'test chat' })
      .select('id')
      .single();
    const chatId = (chatInsert.data as { id: string }).id;

    // Pre-canned retrieve that ignores the query and returns both chunks.
    const retrieve = async (): Promise<SearchResultRow[]> => [
      {
        id: chunkAId,
        document_id: documentId,
        document_title: 'Doc',
        document_version: '1.0',
        index: 0,
        text: 'first chunk',
        token_count: 10,
        embedding_model: 'text-embedding-3-small',
        page_number: 1,
        char_start: 0,
        char_end: 10,
        section_path: null,
        score: 0.95,
        created_at: '',
        updated_at: '',
      },
      {
        id: chunkBId,
        document_id: documentId,
        document_title: 'Doc',
        document_version: '1.0',
        index: 1,
        text: 'second chunk',
        token_count: 12,
        embedding_model: 'text-embedding-3-small',
        page_number: 1,
        char_start: 11,
        char_end: 22,
        section_path: null,
        score: 0.85,
        created_at: '',
        updated_at: '',
      },
    ];

    const llmReply = `Per [${chunkAId}] and [${chunkBId}], yes.`;
    const events: ChatEvent[] = [];
    for await (const e of runChatTurn(
      {
        retrieve,
        stream: () => fakeStream(llmReply),
        persistAssistant: async (input) => {
          const persisted = await persistAssistantMessage(input);
          if (!persisted) throw new Error('persist failed');
          return toContractMessage(persisted.message, persisted.citations);
        },
        newId: () => crypto.randomUUID(),
        now: () => new Date().toISOString(),
      },
      { chatId, userMessage: 'what is X?', topK: 8, model: 'm' },
    )) {
      events.push(e);
    }

    // Event order: stream_start, retrieval_started, retrieval_completed,
    // 2 × citation, ≥1 × token, usage, message_completed.
    const types = events.map((e) => e.event);
    expect(types[0]).toBe('stream_start');
    expect(types.filter((t) => t === 'citation')).toHaveLength(2);
    expect(types.includes('token')).toBe(true);
    expect(types[types.length - 1]).toBe('message_completed');

    // Assistant message + citation rows persisted.
    const completed = events.find((e) => e.event === 'message_completed') as
      | Extract<ChatEvent, { event: 'message_completed' }>
      | undefined;
    const messageId = completed!.data.message_id;

    const { data: msgRows } = await admin
      .from('messages')
      .select('id, role, content, input_tokens, output_tokens')
      .eq('id', messageId);
    expect(msgRows).toHaveLength(1);
    expect((msgRows![0] as { role: string }).role).toBe('assistant');
    expect((msgRows![0] as { content: string }).content).toContain(chunkAId);

    const { data: citRows } = await admin
      .from('citations')
      .select('chunk_id, index')
      .eq('message_id', messageId)
      .order('index', { ascending: true });
    expect(citRows).toHaveLength(2);
    expect((citRows![0] as { chunk_id: string }).chunk_id).toBe(chunkAId);
    expect((citRows![1] as { chunk_id: string }).chunk_id).toBe(chunkBId);
  });

  it('strips an invalid citation marker before persisting', async () => {
    const admin = makeClient(serviceKey);
    const client = await signedInClient(admin, `t-${crypto.randomUUID()}@example.com`);
    const { data: ws } = await client.from('workspaces').select('id').single();
    const { data: u } = await client.auth.getUser();

    // No retrieval rows — every marker is "hallucinated".
    const retrieve = async (): Promise<SearchResultRow[]> => [];

    const chatInsert = await client
      .from('chats')
      .insert({ workspace_id: ws!.id, user_id: u.user!.id, title: 'strip test' })
      .select('id')
      .single();
    const chatId = (chatInsert.data as { id: string }).id;

    const events: ChatEvent[] = [];
    for await (const e of runChatTurn(
      {
        retrieve,
        stream: () => fakeStream('See [aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa]: yes.'),
        persistAssistant: async (input) => {
          const persisted = await persistAssistantMessage(input);
          if (!persisted) throw new Error('persist failed');
          return toContractMessage(persisted.message, persisted.citations);
        },
        newId: () => crypto.randomUUID(),
        now: () => new Date().toISOString(),
      },
      { chatId, userMessage: 'q', topK: 8, model: 'm' },
    )) {
      events.push(e);
    }

    const completed = events.find((e) => e.event === 'message_completed') as
      | Extract<ChatEvent, { event: 'message_completed' }>
      | undefined;
    const messageId = completed!.data.message_id;

    const { data: msgRows } = await admin
      .from('messages')
      .select('content')
      .eq('id', messageId);
    expect((msgRows![0] as { content: string }).content).toBe('See : yes.');

    const { count: citCount } = await admin
      .from('citations')
      .select('id', { count: 'exact', head: true })
      .eq('message_id', messageId);
    expect(citCount).toBe(0);
  });
});

