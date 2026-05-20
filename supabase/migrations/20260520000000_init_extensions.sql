-- Tier 0 baseline migration.
--
-- Deliberately feature-free: it enables the Postgres extensions that later
-- tiers depend on and nothing else. Its job is to prove the migration
-- pipeline works end-to-end (apply on `supabase db reset`, replay in CI)
-- without inventing schema ahead of the features that need it.

-- pgvector — embedding storage and ANN similarity search (Tier 1, REQ-1.1.4).
create extension if not exists vector with schema extensions;

-- pgcrypto — gen_random_uuid() and digest helpers used across tiers.
create extension if not exists pgcrypto with schema extensions;
