// SPDX-License-Identifier: Apache-2.0
import { config } from 'dotenv';

// Local dev reads Supabase URL + keys from apps/web/.env.test (gitignored,
// produced by `supabase status -o env`). CI injects the same vars via
// $GITHUB_ENV, so real environment values must win — hence override: false.
config({ path: '.env.test', override: false });
