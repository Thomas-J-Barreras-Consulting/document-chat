// SPDX-License-Identifier: Apache-2.0
// Empty stub for the `server-only` package.
//
// `server-only` is a Next.js compile-time guard: it has no runtime API and is
// only resolvable inside the Next bundler (which applies the `react-server`
// export condition). Under pnpm + Vitest it is unresolvable (it's a transitive
// dep of `next`, not a direct dep of this app) and its default entry throws by
// design. The integration Vitest config aliases `server-only` to this no-op so
// modules guarded by it can be imported in tests. The real guard still applies
// in the Next build, which never reads the Vitest config.
export {};
