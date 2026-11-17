# FUTURIA: notes for Claude Code sessions

FUTURIA is an AI "what if" simulator for career decisions ("Should I quit my job to freelance?").
**Numbers come from math, the story comes from Claude.** A deterministic Monte Carlo engine
produces every number; Claude only structures the decision and narrates engine output.

The full build guide is in `docs/ROADMAP.md`. Work proceeds phase by phase, and each phase ends
when its ✅ checks pass.

## Layout

| Path              | What                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------- |
| `packages/shared` | Zod schemas (`DecisionModel`), engine result types, plan limits, `SARA_MODEL` fixture |
| `packages/engine` | Pure-TS Monte Carlo engine, used by the browser (Web Worker) and the API              |
| `packages/config` | Shared tsconfig and ESLint presets                                                    |
| `apps/api`        | NestJS 12 API (ESM)                                                                   |
| `apps/web`        | Next.js 16 App Router (Cache Components on), Tailwind 4                               |

## Commands (run from the repo root)

```sh
pnpm install
pnpm dev                              # all dev servers (web :3000, api :4000) + package watchers
pnpm check                            # lint + typecheck + test + build (what CI runs)
pnpm format                           # prettier
pnpm --filter @futuria/engine test    # engine unit + property tests
pnpm --filter @futuria/engine demo    # Sara's 3 paths: metrics, sensitivity, action plan, timing
pnpm --filter @futuria/api test:e2e       # needs local MongoDB (throwaway futuria_test_* databases)
pnpm --filter @futuria/api db:setup       # create collections + indexes in the futuria database
pnpm --filter @futuria/api db:setup --seed  # ...and add Sara's sample simulation for dev-user
pnpm --filter @futuria/api smoke          # walk every API endpoint against a running API (see docs/TESTING.md)
```

## Local services

- **MongoDB:** local Windows service (8.3) at `mongodb://127.0.0.1:27017`, no auth, localhost
  only. The app database is `futuria`. Tests create and drop `futuria_test_*` databases; never
  point tests at `futuria`. `test/test-app.ts` refuses to drop non-test databases.
- **Auth:** with no `CLERK_SECRET_KEY`, the API runs in `AUTH_MODE=dev`. The user comes from the
  `x-dev-user` header (default `dev-user`) and is stored as `dev:<name>`. Dev mode is refused
  when `NODE_ENV=production`.

Packages are built with tsup to `dist/` (ESM + CJS + d.ts). Apps import the built output, so after
changing `shared` or `engine` outside `pnpm dev`, rebuild them (`pnpm build` or turbo does it via
`^build`).

## Conventions and gotchas

- **TypeScript is pinned to `~6.0.3`.** TS 7 (the native port) is `latest` on npm, but
  typescript-eslint supports `<6.1` and Nest CLI pins `~6.0`. Don't bump without checking both.
- **pnpm 11 supply-chain policy:** `minimumReleaseAge` rejects packages published in the last day.
  Pin a slightly older version instead of adding `minimumReleaseAgeExclude` entries. Dependency
  build scripts must be allowed in `pnpm-workspace.yaml` (`allowBuilds`).
- **NestJS 12 is ESM-only:** relative imports end in `.js`, use `import.meta.dirname`, and tests
  use Vitest (`vi.fn()`). Injected classes must be **value imports**, never `import type`
  (DI reads `emitDecoratorMetadata`). That's why `consistent-type-imports` is off in `apps/api`.
  Validate requests with Zod via `@Body({ schema })` / `@Param('id', { schema })` (the global
  `StandardSchemaValidationPipe` from `common/validation.ts`). Request schemas, the status
  machine and response DTO types live in `packages/shared/src/simulation.ts`.
- **API conventions:** every route requires auth unless marked `@Public()`. Queries are scoped
  to the owner, so another user's simulation is a 404. Status changes go through
  `SimulationsService.transition` (an atomic conditional update using `statusesThatCanReach`).
  Errors use the `ApiErrorBody` shape `{ statusCode, error, code, message, issues? }`.
- **Next.js 16 differs from older docs.** Read `apps/web/node_modules/next/dist/docs/` before
  writing Next code. With Cache Components, uncached data (fetches, cookies) must sit inside
  `<Suspense>`.
- **Engine determinism rules (`packages/engine`):**
  - All randomness comes from `rng.ts` streams keyed by (seed, path id, run index). Never use
    `Math.random()` in simulation code.
  - Every distribution sample consumes exactly one draw (`Sampler.dist`, triangular inverse CDF),
    and every month consumes exactly five event draws. This keeps "common random numbers" across
    input changes (smooth sliders, low-noise sensitivity). Keep it that way when adding variables.
  - Baseline draws use a shared stream, so run _i_ has the same expenses on every path.
  - Series are indexed by month (index 0 = today, length = horizon + 1).
  - Break-even means _sustained_: income covers expenses (3-month average) from that month to the
    horizon.
- **Money and rates:** monthly amounts in the model's currency; rates and probabilities are
  fractions (0.25 = 25%).
- **Claude API (Phase 3+):** `@anthropic-ai/sdk`, model `claude-opus-5-5`, `client.messages.parse`
  with `zodOutputFormat`, explicit `output_config.effort`, no `temperature`, check `stop_reason`
  (refusal / max_tokens) before reading output. Claude must never invent final numbers; the
  engine computes them.
- Never put secrets in the repo. `.env*` files are gitignored except `.env.example`.
