# FUTURIA: notes for Claude Code sessions

FUTURIA is an AI "what if" simulator for career decisions ("Should I quit my job to freelance?").
**Numbers come from math, the story comes from Claude.** A deterministic Monte Carlo engine
produces every number; Claude only structures the decision and narrates engine output.

The full build guide is in `docs/ROADMAP.md`. Work proceeds phase by phase, and each phase ends
when its ✅ checks pass.

## Layout

| Path              | What                                                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared` | Zod schemas (`DecisionModel`, profile), engine result types, plan limits, `FIELD_META` (units, bounds), `SARA_MODEL` fixture |
| `packages/engine` | Pure-TS Monte Carlo engine, used by the browser (Web Worker) and the API                                                     |
| `packages/config` | Shared tsconfig and ESLint presets                                                                                           |
| `apps/api`        | NestJS 12 API (ESM)                                                                                                          |
| `apps/web`        | Next.js 16 App Router (Cache Components on), Tailwind 4                                                                      |

## Commands (run from the repo root)

```sh
pnpm install
pnpm dev                              # all dev servers (web :3000, api :4000) + package watchers
pnpm check                            # lint + typecheck + test + build (what CI runs)
pnpm format                           # prettier
pnpm --filter @futuria/engine test    # engine unit + property tests
pnpm --filter @futuria/engine demo    # Sara's 3 paths: metrics, sensitivity, action plan, timing
pnpm --filter @futuria/web test       # web unit tests (pure helpers in src/lib)
pnpm --filter @futuria/web test:e2e   # Playwright: Sara's journey, desktop + mobile (run `pnpm build` first)
pnpm --filter @futuria/web build:e2e  # rebuild the web app without Clerk (needed when .env.local has Clerk keys)
pnpm --filter @futuria/api test:e2e       # throwaway futuria_test_* databases on MONGODB_TEST_URI or local MongoDB
pnpm --filter @futuria/api db:setup       # create collections + indexes in the futuria database
pnpm --filter @futuria/api db:setup --seed  # ...and add Sara's sample simulation for dev-user
pnpm --filter @futuria/api smoke          # walk Sara's journey through a running API (see docs/TESTING.md)
pnpm --filter @futuria/api ai:probe       # check the Claude endpoint/gateway supports what we use (~$0.05)
pnpm eval --fixture                       # free dry run of the AI eval harness
pnpm eval --yes                           # real-Claude eval of 30 personas (~$9; run before prompt changes)
pnpm eval --replay evals/results/<file>.json   # re-score a saved run for free (after changing checks)
pnpm --filter @futuria/api fixtures:record --yes   # record real intake/model outputs for AI_MODE=fixture
pnpm --filter @futuria/api stripe:setup   # Stripe products, monthly/yearly prices, Customer Portal (test key)
pnpm --filter @futuria/api stripe:listen  # Stripe CLI webhook forwarding (events from billing/webhook-events.ts); copy whsec_ to STRIPE_WEBHOOK_SECRET
npx inngest-cli@latest dev -u http://localhost:4000/api/inngest   # Inngest Dev Server (UI on :8288)
```

## Local services

- **MongoDB:** MongoDB Atlas, via `MONGODB_URI` (`mongodb+srv://...`) in `apps/api/.env`. The
  app database is `futuria`; a URI without a database name gets `futuria`
  (`src/database/mongo-uri.ts`), never the driver's `test`. A local MongoDB at
  `mongodb://127.0.0.1:27017` still works as an alternative.
- **E2E tests:** they create and drop `futuria_test_*` databases on `MONGODB_TEST_URI` (process
  env or `apps/api/.env`), else local MongoDB. They never read `MONGODB_URI`; never point tests
  at `futuria`. `test/test-app.ts` refuses to drop non-test databases. CI uses a `mongo:8`
  service container.
- **Auth:** with no `CLERK_SECRET_KEY`, the API runs in `AUTH_MODE=dev`. The user comes from the
  `x-dev-user` header (default `dev-user`) and is stored as `dev:<name>`. Dev mode is refused
  when `NODE_ENV=production`. An explicit `AUTH_MODE=dev` wins over a Clerk key; when the web app
  has Clerk keys the API must run in Clerk mode.
- **Anonymous visitors (signup gate):** a request with only `x-anon-id` (a UUID the web proxy keeps
  in the httpOnly `futuria_anon` cookie, Clerk mode only) is an anonymous user `anon:<uuid>`. It
  may only reach `@AllowAnonymous()` routes (the wizard up to the run); everything else answers
  401 `signup_required`. Max 3 drafts; anonymous users and their drafts expire (TTL, 14 days).
  The first signed-in request that still carries `x-anon-id` claims the drafts (`ClaimService`).
- **Billing:** with no `STRIPE_SECRET_KEY`, `BILLING_MODE=disabled` and checkout answers 503
  `billing_disabled`. Stripe mode needs `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`; production
  refuses disabled. Prices are found by lookup key (`priceLookupKey`, e.g. `futuria_pro_month`).
  The webhook (`POST /billing/webhook`, raw body, `rawBody: true` in `main.ts`) never trusts the
  event payload: `syncCustomer` re-reads the subscriptions from Stripe. E2E tests force disabled;
  `billing.e2e-spec.ts` swaps in a fake `STRIPE` provider and signs webhooks with a test secret.
- **Claude:** with no `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN`, the API runs in
  `AI_MODE=fixture`: recorded outputs (`apps/api/fixtures/ai/`) when the input matches exactly,
  else deterministic synthetic ones (`src/ai/synthetic.ts`). No API calls, no cost. Calls can go
  through a gateway via `ANTHROPIC_BASE_URL` (root, no `/v1`); `AI_REFUSAL_FALLBACK` and
  `AI_PROMPT_CACHE` switch off features a gateway rejects. Fixture mode is refused in production.
- **Pipeline:** `PIPELINE_MODE=inline` (default without Inngest config) runs the run steps in the
  API process; `inngest` sends an event (`INNGEST_DEV=1` for the local Dev Server, cloud keys in
  production). Inline is refused in production. E2E tests force fixture AI + inline pipeline.

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
  to the owner, so another user's simulation is a 404.
- **Plan limits (`packages/shared/src/plans.ts`):** every run (first run, "Update the story",
  renarrate) uses one simulation from the quota via `UsageService.consume` (atomic conditional
  `$inc`; monthly periods roll from `usage.periodStart`, Stripe renewals re-anchor them). Failed
  runs and queue failures are refunded (`RunJob.charged`). A finished simulation
  (`completedRuns > 0`) can only change (answers, model, run) with `features.storyRefresh`.
  Route-level features use `@UseGuards(PlanGuard)` + `@RequiresFeature(...)`. Plan errors are 403
  `plan_limit` / `plan_feature` / `quota_exceeded` with `requiredPlan` (`common/plan-errors.ts`). Status changes go through
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
- **Claude API (`apps/api/src/ai`):** `@anthropic-ai/sdk` (pinned 1.8.0), model `claude-opus-5-5`,
  `client.beta.messages.parse` with `betaZodOutputFormat`, explicit `output_config.effort`, no
  `temperature`, server-side refusal fallback, `cache_control` on the two system blocks (domain
  prompt, step rules) with user data last as escaped JSON in `<user_data>`. Check `stop_reason`
  (refusal / max_tokens) before reading output; SDK errors map to `AiError` (retryable or not).
  Claude must never invent final numbers; the engine computes them.
  - **Claude-facing schemas carry no bounds** (no min/max/length): structured outputs can't
    enforce them and the SDK would reject the whole answer. Limits are applied after parsing:
    `normalize.ts` (intake), `clamps.ts` (model numbers, percent-to-fraction), then
    `decisionModelSchema`.
  - **Output grammars have a size limit.** Intake and narrative use `betaZodOutputFormat`. The
    decision model can't: from two paths up the API answers "compiled grammar is too large", so
    `buildModel` puts the JSON Schema in the prompt and validates the JSON reply with Zod (one
    correction round). Its schema is built per request (`modelOutputSchemaFor`): distributions are
    `{low, likely, high}` (equal values = fixed) and paths are keyed `path_1..n`. Before adding
    fields to the intake or narrative schemas, check they still compile against the real API.
  - Prompts live in `ai/prompts/*.ts`; bump the step's version (`intake@1`, ...) on any prompt
    change and run the eval. Every call records an `AiUsageRecord` on `simulation.aiUsage`.
  - Narratives may only state money figures from the facts (`grounding.ts`, checked by evals and
    logged at runtime).
- **Web app (`apps/web`):**
  - The browser never calls the API directly: it goes through the same-origin proxy
    `app/api/backend/[...path]/route.ts` (an endpoint allowlist; add new API routes there). The
    proxy adds the Clerk token, or the `futuria_dev_user` cookie as `x-dev-user` for
    `AUTH_MODE=dev`. `API_URL` is server-only.
  - Clerk is optional (`lib/clerk.ts`): without `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` there is no
    sign-in UI and the proxy uses the dev identity. CI and the e2e build run this way.
  - Data fetching is client-side with TanStack Query (`lib/api.ts`, `queryKeys`). Pages are
    static shells; dynamic `params` are awaited inside `<Suspense>` (Cache Components).
  - Navigate after a mutation with `useNavigate()` (`lib/navigation.ts`), not bare
    `router.push`: Clerk's `router.refresh()` on load can swallow a pending push.
  - Plan gates: `openGate()` (`lib/gate-events.ts`) opens the upgrade dialog or the signup gate
    (`components/billing/gate-provider.tsx`). The `MutationCache` opens it for any mutation that
    fails with a plan error, so locked controls only need to call `openGate` before spending.
    Gate logic (which plan to suggest, copy) lives in `lib/plan-gates.ts`.
  - `NEXT_PUBLIC_CLERK_DISABLED=1` forces Clerk off even with keys (`build:e2e`). Root-level
    providers must not use dynamic hooks like `usePathname` (they block prerendering).
  - Sliders recompute in a Web Worker (`engine/engine.worker.ts`, Comlink) with the stored seed,
    so an untweaked model reproduces the stored results. `useEngine` keeps only the latest model.
  - Chart colours: `--series-1..8` in `globals.css` (validated categorical palette; colour follows
    the path's position in the model). Charts ship a legend and a table view.
  - Pure logic lives in `src/lib` with Vitest tests; UI flows are covered by Playwright (`e2e/`).
    The e2e run starts the built API from `apps/web` (so it never reads `apps/api/.env`) on :4100
    with fixture AI and a `futuria_test_web_e2e` database, and `next start` on :3100.
- **Run pipeline (`apps/api/src/pipeline`):** `POST /run` and `/renarrate` return 202 and queue
  a run; clients poll `GET /simulations/:id`. Steps (`load`, `engine`, `narrate-<path>`,
  `finalize`) are plain `PipelineService` methods scoped to `pipelineRunId`, so retries are safe
  and stale runs touch nothing. A refused story leaves that path without a narrative instead of
  failing the run.
- Never put secrets in the repo. `.env*` files are gitignored except `.env.example`.
