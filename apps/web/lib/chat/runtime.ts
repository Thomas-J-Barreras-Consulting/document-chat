// SPDX-License-Identifier: Apache-2.0
//
// Production deps for the chat orchestrator. Keeps the chat route thin: the
// route handles auth + body parsing + the SSE response shape, and delegates
// the LLM round-trip + DB writes to these wiring functions. Unit tests for
// the orchestrator pass their own stubs and never load this module.

import {
  searchChunks,
  streamAnthropicChat,
  type RpcClient,
  type SearchResultRow,
} from '@document-chat/retrieval';
import type { SupabaseClient } from '@supabase/supabase-js';
import { persistAssistantMessage } from '../chats-store';
import { toContractMessage } from '../chats';
import type { OrchestratorDeps, PersistAssistantInput } from './orchestrate';

/**
 * Wrap a SupabaseClient so it matches the retrieval package's RpcClient
 * shape. Same adapter as the retrieval integration test.
 */
function rpcAdapter(client: SupabaseClient): RpcClient {
  return {
    rpc: (fn, args) =>
      client.rpc(fn, args) as unknown as Promise<{
        data: SearchResultRow[] | null;
        error: { message: string } | null;
      }>,
  };
}

/**
 * Build the dependency bundle the orchestrator consumes. The Supabase
 * client passed in must be RLS-scoped to the user (it's used for retrieval
 * so cross-workspace chunks stay hidden); admin writes happen inside
 * `persistAssistantMessage` after ownership is already verified.
 */
export function buildOrchestratorDeps(rlsClient: SupabaseClient, workspaceId: string): OrchestratorDeps {
  return {
    retrieve: (query, topK) => searchChunks(rpcAdapter(rlsClient), workspaceId, query, { topK }),
    stream: (system, messages) => streamAnthropicChat(system, messages),
    persistAssistant: async (input: PersistAssistantInput) => {
      const persisted = await persistAssistantMessage(input);
      if (!persisted) {
        throw new Error('Failed to persist assistant message');
      }
      return toContractMessage(persisted.message, persisted.citations);
    },
    newId: () => crypto.randomUUID(),
    now: () => new Date().toISOString(),
  };
}
