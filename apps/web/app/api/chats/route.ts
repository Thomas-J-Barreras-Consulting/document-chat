// SPDX-License-Identifier: Apache-2.0
import { NextResponse } from 'next/server';
import type { components } from '@document-chat/contracts';
import { DEFAULT_CHAT_MODEL } from '@document-chat/retrieval';
import { getOptionalUser } from '../../../lib/auth';
import { getCurrentWorkspace } from '../../../lib/workspace';
import {
  insertChat,
  insertMessage,
  listChats,
} from '../../../lib/chats-store';
import {
  defaultChatTitle,
  FEATURE_NOT_AVAILABLE_CODE,
  toContractChat,
} from '../../../lib/chats';
import { problemResponse, unauthorized } from '../../../lib/problem';
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from '../../../lib/documents';
import { runChatTurn } from '../../../lib/chat/orchestrate';
import { buildOrchestratorDeps } from '../../../lib/chat/runtime';
import { sseResponse } from '../../../lib/chat/sse';
import { createSSRClient } from '../../../lib/supabase/server';

const DEFAULT_TOP_K = 8;

type CreateChatRequest = components['schemas']['CreateChatRequest'];
type SendMessageRequest = components['schemas']['SendMessageRequest'];
type PaginatedChats = components['schemas']['PaginatedChats'];

function badRequest(detail: string): NextResponse {
  return problemResponse({ status: 400, code: 'request.invalid', title: 'Bad Request', detail });
}

function unprocessable(detail: string): NextResponse {
  return problemResponse({
    status: 422,
    code: FEATURE_NOT_AVAILABLE_CODE,
    title: 'Feature not available',
    detail,
  });
}

/**
 * Tier 1 rejects `as_of_date` (Tier 3) and `retrieval.mode` (Tier 4) per the
 * OpenAPI description. Centralized so the chat-create + send-message paths
 * stay in sync.
 */
export function checkTier1FeatureGuards(body: SendMessageRequest): string | null {
  if (body.as_of_date !== undefined && body.as_of_date !== null) {
    return 'as_of_date is a Tier 3 feature; this server returns null.';
  }
  if (
    body.retrieval !== undefined &&
    body.retrieval !== null &&
    (body.retrieval.mode !== undefined ||
      body.retrieval.max_chunks !== undefined ||
      body.retrieval.max_triples !== undefined)
  ) {
    return 'retrieval options are a Tier 4 feature; this server ignores them.';
  }
  return null;
}

// GET /chats — paginated chat list, newest-active first.
export async function GET(request: Request): Promise<NextResponse> {
  const user = await getOptionalUser();
  if (!user) return unauthorized('Sign in to list chats.');

  const workspace = await getCurrentWorkspace();
  if (!workspace) {
    return problemResponse({
      status: 500,
      code: 'workspace.not_provisioned',
      title: 'Workspace not provisioned',
    });
  }

  const params = new URL(request.url).searchParams;

  let limit = DEFAULT_PAGE_LIMIT;
  const limitRaw = params.get('limit');
  if (limitRaw !== null) {
    const n = Number(limitRaw);
    if (!Number.isInteger(n) || n < 1 || n > MAX_PAGE_LIMIT) {
      return badRequest(`limit must be an integer between 1 and ${MAX_PAGE_LIMIT}.`);
    }
    limit = n;
  }

  const cursor = params.get('cursor') ?? undefined;
  const archivedRaw = params.get('archived');
  const archived =
    archivedRaw === 'true' ? true : archivedRaw === 'false' ? false : undefined;

  const { items, nextCursor } = await listChats({
    workspaceId: workspace.id,
    ...(archived !== undefined ? { archived } : {}),
    ...(cursor ? { cursor } : {}),
    limit,
  });

  const body: PaginatedChats = {
    items: items.map(toContractChat),
    page: { limit, next_cursor: nextCursor },
  };
  return NextResponse.json(body);
}

// POST /chats — create a chat. Content-negotiates: JSON path returns the
// new Chat; SSE path (only when `first_message` is present) returns the
// streaming assistant reply with the new chat id in the `stream_start` event.
export async function POST(request: Request): Promise<Response> {
  const user = await getOptionalUser();
  if (!user) return unauthorized('Sign in to create a chat.');

  const workspace = await getCurrentWorkspace();
  if (!workspace) {
    return problemResponse({
      status: 500,
      code: 'workspace.not_provisioned',
      title: 'Workspace not provisioned',
    });
  }

  // Empty bodies are valid here (CreateChatRequest has no required fields).
  let body: CreateChatRequest = {};
  const raw = await request.text();
  if (raw.length > 0) {
    try {
      body = JSON.parse(raw) as CreateChatRequest;
    } catch {
      return problemResponse({
        status: 400,
        code: 'request.invalid_json',
        title: 'Bad Request',
        detail: 'Request body must be valid JSON.',
      });
    }
  }

  if (body.first_message) {
    const feature = checkTier1FeatureGuards(body.first_message);
    if (feature) return unprocessable(feature);
    if (
      typeof body.first_message.content !== 'string' ||
      body.first_message.content.trim().length === 0
    ) {
      return badRequest('first_message.content must be a non-empty string.');
    }
  }

  const accept = request.headers.get('accept') ?? '';
  const wantsStream = accept.includes('text/event-stream');
  if (wantsStream && !body.first_message) {
    return badRequest('SSE requires first_message; send a JSON body for an empty chat.');
  }
  if (wantsStream && !process.env.ANTHROPIC_API_KEY) {
    return problemResponse({
      status: 503,
      code: 'streaming.not_available',
      title: 'Streaming not available',
      detail: 'ANTHROPIC_API_KEY is not configured on this server.',
    });
  }

  const title =
    typeof body.title === 'string' && body.title.trim().length > 0
      ? body.title.trim()
      : defaultChatTitle(body.first_message?.content);

  const chat = await insertChat({
    workspaceId: workspace.id,
    userId: user.id,
    title,
  });
  if (!chat) {
    return problemResponse({
      status: 500,
      code: 'chat.create_failed',
      title: 'Could not create chat',
    });
  }

  // Persist any first_message regardless of negotiation — both paths need it.
  if (body.first_message) {
    await insertMessage({
      chatId: chat.id,
      role: 'user',
      content: body.first_message.content,
    });
  }

  if (!wantsStream) {
    return NextResponse.json(toContractChat(chat), { status: 201 });
  }

  // SSE path — the orchestrator drives retrieve → stream → persist; the
  // stream_start event carries chat.id so the client can wire its UI.
  const rlsClient = await createSSRClient();
  const deps = buildOrchestratorDeps(rlsClient, workspace.id);
  const userContent = body.first_message!.content;
  const events = runChatTurn(deps, {
    chatId: chat.id,
    userMessage: userContent,
    topK: typeof body.first_message!.top_k === 'number' ? body.first_message!.top_k : DEFAULT_TOP_K,
    model:
      typeof body.first_message!.model === 'string'
        ? body.first_message!.model
        : DEFAULT_CHAT_MODEL,
  });
  return sseResponse(events);
}
