# Deploy & local development

This guide covers running the starter locally and deploying it to Vercel.
For the system shape see [../architecture.md](../architecture.md); for the
delivery plan see [../implementation.md](../implementation.md).

## Local development

### Prerequisites

- **Node 20 LTS** (see `.nvmrc`). `nvm use` if you use nvm.
- **pnpm 9** — `corepack enable pnpm` (ships with Node), or install per
  <https://pnpm.io/installation>.
- **Docker** — only needed once you run Supabase locally (Tier 1+).
- **Supabase CLI** — only needed for the database. Install per
  <https://supabase.com/docs/guides/cli> (`scoop install supabase` on
  Windows, `brew install supabase/tap/supabase` on macOS).

### Run the app (Tier 0 — no database needed)

```bash
pnpm install
pnpm dev
```

Open <http://localhost:3000>. The Tier 0 endpoints are
<http://localhost:3000/api/health> and <http://localhost:3000/api/version>.
Target: clone → running in under 15 minutes.

### Run with the database (Tier 1+)

```bash
pnpm db:start     # supabase start — boots Postgres, Auth, Storage in Docker
pnpm dev          # in a second terminal, or use `pnpm dev:all` for both
```

`pnpm db:start` prints the local API URL, anon key, and service-role key —
copy them into `.env.local` (see [`.env.example`](../.env.example)). Other
database commands:

- `pnpm db:reset` — drop, recreate, and re-apply every migration in
  `supabase/migrations/` (run this after pulling new migrations).
- `pnpm db:stop` — stop the local stack.
- `pnpm dev:all` — `supabase start` followed by `pnpm dev`.

Migrations live in [`supabase/migrations/`](../supabase/migrations/). The
Tier 0 baseline migration only enables the `vector` and `pgcrypto`
extensions; feature schema arrives with Tier 1.

## Deploy to Vercel (native Git integration)

Deployment uses Vercel's built-in Git integration — no deploy workflow in the
repo. Push to a branch → preview deployment; merge to `main` → production
deployment. The build is configured by [`vercel.json`](../vercel.json) at the
repo root.

### One-time setup

1. **Create the project.** In the Vercel dashboard, *Add New… → Project* and
   import the `document-chat` GitHub repo.
2. **Root Directory.** Leave it at the repository root (`./`). `vercel.json`
   already points the build at `apps/web` via
   `turbo run build --filter=web` and `outputDirectory: apps/web/.next`.
   _Alternative:_ if you hit Next.js detection issues, set Root Directory to
   `apps/web` instead and remove `buildCommand`/`outputDirectory` from
   `vercel.json` (Vercel then auto-detects Next.js).
3. **Framework preset.** Next.js (auto-detected).
4. **Environment variables** (*Settings → Environment Variables*). None are
   required for the Tier 0 hello-world. Add these when Tier 1 lands, scoped to
   the right environments (Production / Preview / Development):

   | Variable | Scope | Notes |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | all | From the Supabase project (or a Vercel-managed integration). |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | all | Public anon key. |
   | `SUPABASE_SERVICE_ROLE_KEY` | Production, Preview | Server-only secret — never `NEXT_PUBLIC_`. |

   `VERCEL_ENV` and `VERCEL_GIT_COMMIT_SHA` are injected by Vercel
   automatically, so `/api/version` reports the environment and git SHA with
   no configuration (see [`apps/web/lib/build-info.ts`](../apps/web/lib/build-info.ts)).
5. **Enable preview deployments** for pull requests (on by default).

### Verify a deployment

After the first deploy, hit `/api/health` and `/api/version` on the deployment
URL. `/api/version` should report `environment: "prod"` on production and
`"preview"` on PR previews.

## Secret hygiene

`gitleaks` scans every push and PR (see
[`.github/workflows/gitleaks.yml`](../.github/workflows/gitleaks.yml)). Never
commit `.env.local` or real keys — they belong in Vercel env vars (deploy) and
`.env.local` (local, gitignored). To scan locally before pushing:

```bash
gitleaks detect --no-banner
```
