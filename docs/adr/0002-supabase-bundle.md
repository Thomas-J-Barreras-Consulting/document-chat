# ADR-0002: Use the Supabase bundle (Postgres + Auth + Storage + pgvector)

- Status: accepted
- Date: 2026-05-20
- Deciders: @tombarreras, @chrisbarreras

## Context and Problem Statement

The starter needs a relational database, vector search, authentication, file
storage, and row-level security — and a two-person team that can't run
infrastructure. Tier 1 (REQ-1.1.x, REQ-1.4.x, REQ-1.NF.1) requires all of
these working together. We want one managed provider rather than stitching
several services, and we want vendor lock-in confined to a place we can swap.

## Decision Drivers

- One managed bundle for DB + auth + storage + vector, on a free tier
- pgvector in the same database as relational data — no separate vector store
  at our scale (REQ-1.1.4)
- Row-level security available from day one for the Tier 2 multi-tenant story
- Local development parity via `supabase start` (Docker)
- Lock-in must be containable: business logic stays in `packages/`, not in
  vendor-specific glue (per goals.md business risks)

## Considered Options

- **Supabase** (Postgres + Auth + Storage + pgvector + RLS)
- Neon (Postgres) + Clerk (auth) + S3/R2 (storage), assembled
- PlanetScale (MySQL) + a separate vector DB (Pinecone/Qdrant) + auth + storage
- Self-hosted Postgres + pgvector on a VPS

## Decision Outcome

Chosen: **Supabase**, because one provider covers DB, auth, storage, vector,
and RLS on a free tier with first-class local dev — minimal ceremony for a
two-person team.

### Consequences

- Good: a single migration pipeline (`supabase/migrations/`) and one set of
  credentials; pgvector lives beside relational data.
- Good: RLS is native, so the Tier 2 multi-tenant isolation story builds on
  Postgres primitives rather than app-layer filtering.
- Good: `supabase start` gives a full local stack that mirrors production.
- Good: it's plain Postgres underneath — migrating off Supabase later means
  moving a Postgres database, not rewriting the data layer.
- Bad: vendor lock-in on Auth and Storage APIs; mitigated by keeping their use
  behind `packages/` boundaries and reading config from env.
- Bad: local stack requires Docker, so DB-touching work has a heavier prereq
  than the Tier 0 hello-world (which needs neither Docker nor Supabase).

## Pros and Cons of the Options

### Supabase
- Pro: DB + auth + storage + vector + RLS in one place, free tier
- Pro: standard Postgres + pgvector — portable data layer
- Con: lock-in on Auth/Storage SDKs; Docker needed for local DB

### Neon + Clerk + S3/R2 (assembled)
- Pro: best-of-breed pieces; Neon branching is excellent
- Con: three vendors, three bills, three local-dev stories to wire
- Con: no built-in RLS-to-auth integration; more glue to own

### PlanetScale + separate vector DB
- Con: MySQL has no pgvector; needs a separate vector store now
- Con: most moving parts of any option for our scale

### Self-hosted Postgres + pgvector
- Pro: zero vendor lock-in, full control
- Con: we'd run auth, storage, backups, and ops ourselves — the opposite of
  "don't hand-roll infrastructure managed services solve cheaply" (goals.md)

## Links

- [ADR-0001: monorepo](./0001-monorepo-pnpm-turborepo.md)
- [architecture.md — technology choices](../../architecture.md)
- [pgvector](https://github.com/pgvector/pgvector)
- [Supabase local development](https://supabase.com/docs/guides/cli/local-development)
