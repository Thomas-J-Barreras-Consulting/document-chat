# Architecture

System shape, technology choices, and structural decisions for both repos.
For business context see [goals.md](./goals.md); for delivery process see
[implementation.md](./implementation.md).

## API-first contract architecture

- **OpenAPI 3.1 spec is the source of truth** for every backend contract.
- Spec lives in `packages/contracts/openapi.yaml`, versioned, reviewed in PRs.
- Backend implements the spec; frontend consumes a **generated TypeScript client**.
- **Contract tests** run in CI: assert backend responses match the spec.
- Spec changes require a PR — no implementation-led API drift.

Benefit: frontend and backend can be developed in parallel against a stable
contract. One person can stub a route while the other builds the UI, and they
meet at the spec.

---

## Technology choices

### Core stack (Tiers 0–3)

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js 15 (App Router) + React + TypeScript | Industry default, strong Vercel integration, RSC-capable |
| UI | Tailwind + shadcn/ui | Avoid building a design system |
| Backend | Next.js API routes (Tiers 0–2) → consider Fastify later | One deployable to start; split when justified |
| Auth | Supabase Auth | JWT, row-level security integration, free tier |
| Database | Supabase Postgres + pgvector | One DB does relational + vector; cheaper than a separate vector DB at our scale |
| Migrations | Supabase CLI | Native, no extra tooling |
| LLM (primary) | Anthropic Claude | Best citation behavior in our use case |
| LLM (secondary) | OpenAI | For comparison, fallback, and keyword breadth |
| Embeddings | OpenAI `text-embedding-3-small` | Cheap, good enough; revisit at Tier 2 |
| Hosting | Vercel | Pairs with Next.js; PR previews built-in |
| CI | GitHub Actions | Free for public repos |
| Background jobs | Inngest | Durable, typed, integrates with Vercel; introduced at Tier 1 |
| Observability | Langfuse (LLM) + Sentry (errors) | OSS-friendly LLM tracing + standard error monitoring |
| Billing | Stripe | Default; introduced at Tier 2 |
| Eval | Custom harness in `packages/eval` + Ragas where useful | Owned IP |

### Tier 4 (KG) candidates

- **Phase 4a:** Triples stored in Postgres (no new infrastructure).
- **Phase 4b:** Apache Jena / Fuseki as OSS SPARQL endpoint, OR Stardog if
  going commercial. Decision deferred until 4a proves the need; ADR required
  before starting.

### Library choices (specifics)

- **OpenAPI tooling:** openapi-typescript (types), Zod (runtime validation
  on the boundary), Spectral (lint the spec in CI), Prism (mock server for
  frontend dev).
- **Testing:** Vitest (unit + integration), Playwright (E2E), MSW (network mocking).
- **Linting:** ESLint + Prettier + TypeScript strict.

---

## Repo layout

Two repos. Both share the same underlying monorepo shape; the private one is
a superset that adds packages and apps.

### Public starter — `knowledge-graph-starter` (Apache 2.0)

```
knowledge-graph-starter/
├── LICENSE                 # Apache 2.0
├── NOTICE                  # Required by Apache 2.0
├── CONTRIBUTING.md         # DCO sign-off, PR process
├── CODE_OF_CONDUCT.md      # Contributor Covenant
├── apps/
│   ├── web/                # Next.js frontend + API routes
│   └── eval-cli/           # Standalone CLI for the eval harness
├── packages/
│   ├── contracts/          # OpenAPI specs + generated TypeScript client
│   ├── eval/               # Golden Q&A harness, metrics, runners
│   └── retrieval/          # Embedding, chunking, retrieval logic
├── supabase/
│   └── migrations/         # SQL migrations
├── .github/
│   ├── workflows/          # CI: lint, typecheck, test, build, deploy
│   ├── ISSUE_TEMPLATE/
│   └── PULL_REQUEST_TEMPLATE.md
└── docs/
    ├── adr/                # Architecture decision records
    ├── architecture.md     # Diagram + narrative
    └── deploy.md           # Self-deployment guide for forkers
```

### Private commercial — `knowledge-graph` (proprietary)

Forks from `knowledge-graph-starter` at end of Tier 1. Adds:

```
knowledge-graph/                # (forked from starter; same scaffold)
├── apps/
│   ├── web/                    # Extended with multi-tenant UI, admin, billing
│   └── eval-cli/
├── packages/
│   ├── contracts/              # Extended with commercial endpoints
│   ├── eval/                   # Extended with lifecycle + KG metrics
│   ├── retrieval/              # Extended with permission-aware retrieval
│   ├── lifecycle/              # NEW — document lifecycle state machine (Tier 3)
│   ├── billing/                # NEW — Stripe integration (Tier 2)
│   ├── tenancy/                # NEW — multi-tenant + RLS helpers (Tier 2)
│   ├── audit/                  # NEW — audit log writer + queries (Tier 2)
│   └── kg/                     # NEW — knowledge graph layer (Tier 4)
├── supabase/migrations/        # Adds RLS policies, billing tables, lifecycle, KG
├── .github/workflows/          # Adds deploy-to-production, eval-regression
└── docs/runbooks/              # NEW — production ops, key rotation, incident response
```

### Sync mechanics

- Private repo's `upstream` remote points at the public repo.
- Periodic sync: `git fetch upstream && git merge upstream/main` in private.
- Bugfixes that aren't commercially-differentiating are developed in **public**
  first, then pulled into private via the sync.
- Commercial features developed in private do not flow back unless we
  deliberately open-source them.
- No npm package gymnastics initially. Revisit only if package boundaries
  become genuinely stable and the duplication hurts.

---

## Architectural Decision Records

ADRs live in `docs/adr/`. One page, markdown, immutable once accepted.
Required for non-obvious decisions:

- Why monorepo
- Why OpenAPI as source of truth
- Why Inngest over alternatives
- Why pgvector over a dedicated vector DB
- Why Claude as primary LLM
- (Future) Stardog vs. Fuseki for Phase 4b
- (Future) Any new vendor adoption

---

## See also

- [goals.md](./goals.md) — business goals and project structure
- [implementation.md](./implementation.md) — tiers, working agreements, execution plan
