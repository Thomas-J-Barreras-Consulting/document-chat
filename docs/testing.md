# Testing

The project tests in four layers. Lower layers are fast and hermetic; higher
layers trade speed for fidelity. This follows the test pyramid in
[../implementation.md](../implementation.md) (many unit, fewer integration, a
few E2E).

| Layer | Runner | Database | Command | Runs in |
|---|---|---|---|---|
| Unit + contract | Vitest | none | `pnpm --filter web run test` | every PR |
| Integration / functional | Vitest | local Supabase | `pnpm --filter web run test:integration` | `integration` CI job + local |
| E2E (local) | Playwright | local stack | `pnpm --filter web run test:e2e` | every PR |
| E2E (deployment) | Playwright | preview's DB | auto on Vercel deploy | `e2e-preview` workflow |

As of Tier 0 each layer has exactly one example proving the harness works.
Real cases grow with the features (integration: upload → query → answer;
deployment E2E: signup → upload → chat → citation) per the Tier 1 test
strategy.

## Layer 1 — Unit + contract

Pure-function and route-handler tests. Handlers are imported and called
directly (no server). Response bodies are validated against the OpenAPI spec
with the ajv schema validator from `@document-chat/contracts/test-utils`.

```bash
pnpm --filter web run test          # apps/web
pnpm --filter @document-chat/contracts run test
pnpm test                           # everything, via turbo
```

Files: `apps/web/app/api/**/route.test.ts`,
`packages/contracts/src/**/*.test.ts`. The default Vitest run **excludes**
`*.integration.test.ts`.

## Layer 2 — Integration / functional

Tests that exercise a real Supabase stack (Postgres + Auth + Storage) running
locally via Docker. Named `*.integration.test.ts`, run by a separate Vitest
config.

### One-time + per-session local setup

```bash
pnpm db:start          # supabase start (needs Docker + the Supabase CLI)

# Write apps/web/.env.test (gitignored) from the running stack:
supabase status -o env \
  --override-name api.url=NEXT_PUBLIC_SUPABASE_URL \
  --override-name auth.anon_key=NEXT_PUBLIC_SUPABASE_ANON_KEY \
  --override-name auth.service_role_key=SUPABASE_SERVICE_ROLE_KEY \
  > apps/web/.env.test

pnpm --filter web run test:integration
pnpm db:stop
```

The Supabase CLI install is documented in [deploy.md](./deploy.md)
(`scoop install supabase` on Windows, `brew install supabase/tap/supabase`
on macOS). Local Supabase keys are deterministic but are **never committed** —
they're derived at runtime from `supabase status`.

Example: `apps/web/lib/supabase/admin.integration.test.ts` connects with the
service-role client and calls `auth.admin.listUsers()`, proving the client,
the key, and the local Auth service work end to end.

## Layer 3 — E2E (local)

Playwright drives a real browser against a local production build
(`next start`). One smoke test confirms the homepage renders.

```bash
pnpm --filter web run build
pnpm --filter web exec playwright install chromium   # one-time
pnpm --filter web run test:e2e
```

## Layer 4 — E2E (deployment)

The same Playwright suite, pointed at a deployed URL via `E2E_BASE_URL`. When
set, the config skips the local web server and tests the remote.

```bash
E2E_BASE_URL=https://your-preview.vercel.app pnpm --filter web run test:e2e
```

In CI this is wired through [`.github/workflows/e2e-preview.yml`](../.github/workflows/e2e-preview.yml),
which triggers on `deployment_status` and runs the smoke test against the
Vercel preview URL once the deployment succeeds.

It is **opt-in and dormant by default**: the job skips unless the repository
variable `ENABLE_PREVIEW_E2E` is set to `true` (Settings → Secrets and
variables → Actions → Variables). This keeps the check green/neutral until
deployment E2E is genuinely ready (Tier 1).

To enable it later, two things are needed:

1. Set `ENABLE_PREVIEW_E2E=true`.
2. Make preview URLs reachable by anonymous CI. Vercel **Deployment
   Protection** puts an auth wall in front of preview URLs by default, so
   Playwright would hit a login page. Either turn protection off for previews,
   or keep it on and add a **Protection Bypass for Automation** secret in
   Vercel, expose it as a GitHub secret, and send it on requests via the
   `x-vercel-protection-bypass` header.

DB-backed deployment E2E additionally needs a hosted Supabase test project
wired to the preview env vars — deferred until Tier 1 features exist.

## CI

`.github/workflows/ci.yml` runs two jobs in parallel on every PR:

- **build** — install, license check, lint, typecheck, contracts codegen
  freshness, unit/contract tests, build, local Playwright E2E.
- **integration** — installs the Supabase CLI, `supabase start`, derives the
  env vars from `supabase status`, runs the integration tests, `supabase stop`.

No Supabase keys are stored as GitHub secrets — the local stack's keys are
derived at runtime, so secret scanning (gitleaks) stays clean.

See [docs/adr/0003-testing-strategy.md](./adr/0003-testing-strategy.md) for
why integration tests use a local Supabase in CI rather than a hosted project.
