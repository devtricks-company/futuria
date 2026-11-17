# FUTURIA — Step-by-Step Build Guide (from empty folder to final version)

_Explore the Future Before You Live It._

## Progress

| Phase                | Status                                                                                                     |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| 0. Foundations       | ✅ Done (2026-11-16). Hosted deploys pending accounts.                                                     |
| 1. Simulation engine | ✅ Done (2026-11-16): 31 engine + 6 schema tests green, 3 paths × 1,000 runs × 24 months in ~43 ms         |
| 2. API core and data | ✅ Done (2026-11-16): local MongoDB `futuria` database, dev auth until Clerk keys are added (see notes)    |
| 3. AI layer          | ✅ Done (2026-11-17): real Claude via the gateway, full eval 30/30, $0.367 per simulation. Pro quota open  |
| 4. Web app MVP       | 🟡 Built (2026-11-17): Playwright journey green on desktop + mobile (fixture). Manual real-Claude run open |
| 5–11                 | Not started                                                                                                |

**Phase 2 notes (deviations from the plan below):**

- **Database:** first built on local MongoDB 8.3 (Windows service). On 2026-11-16 it moved to MongoDB Atlas: `MONGODB_URI` is a `mongodb+srv://` string, and a URI without a database name gets `futuria`. `pnpm --filter @futuria/api db:setup [--seed]` creates the collections and indexes, and optionally adds Sara's sample.
- **E2E tests:** they use real MongoDB (one throwaway `futuria_test_*` database per test file) instead of mongodb-memory-server, on `MONGODB_TEST_URI` (Atlas or anything else) or local MongoDB. CI provides a `mongo:8` service container.
- **Auth:** Clerk verification is implemented. With no `CLERK_SECRET_KEY`, the API runs in `AUTH_MODE=dev` and trusts an `x-dev-user` header. That mode is refused when `NODE_ENV=production`.
- **Engine run:** it currently happens synchronously in the request (about 200 ms for Sara). Phase 3 moves it into the Inngest pipeline.

**Phase 3 status and notes (2026-11-17):**

- **Done:** `AiProvider` with `AnthropicAiProvider` and `FixtureAiProvider`; versioned prompts with the Career Leap domain prompt cached; sanity clamps; the intake → answers → model flow; the Inngest `simulation-run` function mounted at `/api/inngest`; usage and cost logging per call; the eval harness (30 personas); the gateway probe; the fixture recorder. Verified with 107 automated tests, a fixture-mode eval dry run (30/30), and the smoke test end to end through the Inngest Dev Server (`COMPLETED` runs).
- **Real Claude, through the gateway (2026-11-17):**
  - The probe passed every check: Messages API, effort, structured outputs, refusal fallback, and prompt caching (3,159 cached tokens on a repeat).
  - The smoke test ran Sara's full journey: intake 11 s, model 35 s, run with three stories 41 s.
  - **Full eval:** all 30 personas pass every hard check, and 140 of 141 soft checks pass. The one soft miss is a laid-off persona with no pay to ask about, which is correct. It cost $9.20 for 25 simulations and 5 intakes.
    - The first scoring was 27/30. All three failures were checker false positives: rounding to $50, rounding down ("savings pass $27.7k" for 27,763), and the contract term "guaranteed minimums". The checks were fixed and the same outputs re-scored with `--replay`.
    - Routing was right in every case: out of scope, crisis, and burnout that must not be flagged as a crisis.
- **Measured cost:** **$0.367 per 3-path simulation** (full eval, 25 simulations; individual runs $0.22–0.44). That breaks down as intake $0.021, model $0.111, and narrative $0.082 per path. Most of it is output tokens; prompt caching read about 530k tokens across the eval. At the planned Pro quota (20 simulations at $12/mo), a fully used plan costs about $7.40 in AI, about 62% of revenue against the 30% target. The levers (lower narrative effort, a cheaper narrative model, a smaller quota) are your decision.
- **Fixed by real testing:**
  - The decision model was too large for a structured-output grammar. It now uses a JSON Schema in the prompt plus Zod validation (see `CLAUDE.md`).
  - The grounding check misread figures at the end of sentences and natural rounding.
  - Narratives said "no risk" when the engine reported 0%; the prompt now forbids it.
  - Intake `informs` names are now restricted to real model fields.
  - `signOnBonus` may be negative, for relocation and similar one-off costs.
- **Fixtures:** Sara's real intake and model outputs are recorded in `apps/api/fixtures/ai/`, so fixture mode replays them for her exact sentence.
- **Still open (a decision, not a ✅ blocker):** the Pro quota and price, given the cost above.
- **Gateway:** Claude calls can go through a gateway (`ANTHROPIC_BASE_URL`, plus `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN`). If the gateway bills differently, the logged costs are list-price estimates.
- **Pipeline modes:** besides Inngest, `PIPELINE_MODE=inline` runs the same steps in the API process. Tests and quick local runs use it; production refuses it. The `load` step claims the run, and every step is scoped to a `pipelineRunId`, so stale runs can't overwrite newer state.
- **Fixtures:** without a matching recording, fixture mode returns deterministic synthetic output, so tests and offline UI work for any input. Narratives depend on each simulation's random seed, so they are always synthetic in fixture mode.
- **Status machine:** runs go `queued → simulating → narrating → ready`; `POST /run` now answers 202. A story refresh (`POST /renarrate`) goes `queued → narrating → ready`. Out-of-scope and crisis intakes stay `draft`, with `intake.routing` recorded.
- **Partial stories:** if Claude refuses one path's story, the run still finishes with the engine results and an `error` note. Retryable failures use the Inngest retries, then mark the run `failed`.
- **Not gated yet:** "story refresh" is a Pro feature in `plans.ts`, but `/renarrate` isn't plan-gated until Phase 5 (`PlanGuard`).

**Phase 4 status and notes (2026-11-17):**

- **Built:**
  - landing page (hero input that works without JavaScript, examples, how it works, pricing from `PLANS`)
  - the `/new` → `/new/[id]` wizard: decision, questions, paths, assumptions review with AI estimates in amber and every value editable
  - `/s/[id]`: progress screen, Compare (path cards and the fan chart), the scenario switch, the Tweak panel, What matters most (tornado), Time Machine and Action plan
  - `/dashboard` and `/settings/profile`
  - dark mode with a toggle, phone layouts, disclaimers
- **Verified:**
  - `pnpm check` (web unit tests included)
  - Playwright (`pnpm --filter @futuria/web test:e2e`): Sara's journey, profile pre-fill, out-of-scope and crisis routing, each on desktop and a Pixel 7 viewport, against the built API in fixture mode
  - a screenshot pass in light and dark
- **Open for ✅:** a manual run with real Claude on a phone and a desktop (your part; about $0.40 per run, plus about $0.25 per "Update the story").
- **Deviations from the plan above:**
  - **API access goes through a same-origin proxy** (`app/api/backend/[...path]`, endpoint allowlist). The browser never holds the API URL or a token. It adds the Clerk token, or the dev identity in `AUTH_MODE=dev`.
  - **"Update the story" runs the simulation again** (`PATCH /model` with the tweaks, then `POST /run`) instead of calling `/renarrate`, which reuses the stored numbers and would describe the old future. The cost is the same as a story refresh.
  - **Sliders recompute in a Web Worker** with the stored seed: `simulate` while dragging, the full `analyze` 300 ms after release. With no tweaks the stored analysis is shown. During a re-run the page keeps this device's computation of the new model on screen (same seed, so the same numbers).
  - **Profile:** `GET/PUT /me/profile` (new) stores the baseline. It pre-fills intake questions through their `informs` field, on the client. Nothing new is sent to Claude, so no prompt change was needed.
  - **Out-of-scope intakes** show a "not yet" screen with no new waitlist store: the intake (with `routing`) is already saved as demand data.
  - **Clerk is optional in the web app.** Without a publishable key it runs without sign-in (CI, e2e), which keeps Phase 5's signup gate separate.
  - **Shared code:** `FIELD_META` (units and bounds) is now shared by the API clamps and the web inputs. `milestoneMonths` moved to `@futuria/shared`.
- **Found while testing:** Clerk's `router.refresh()` when its script loads can swallow a pending `router.push`, which could leave the wizard spinning after a fast step. Navigations after mutations go through `useNavigate()` (`lib/navigation.ts`), which falls back to a full page load if the page didn't change.

## Context

`F:\futuria` is empty: this is a greenfield build. The idea is an AI "what if" simulator. To stand out from "ChatGPT with a nice UI", it has to be an **interactive simulation environment** where you can move a slider and see every future update instantly. Decisions already made:

- **Launch niche: Career Leap.** "Should I quit my job to freelance / start a business / switch jobs?" The outcomes are measurable: savings runway, monthly income, break-even month, and the chance of running out of money.
- **Stack: Turborepo monorepo.** `apps/web` (Next.js) + `apps/api` (NestJS) + shared packages. MongoDB, Claude, Recharts, Inngest.
- **Builder: solo developer working with Claude Code.** Each phase below is a unit of work we implement together. Each one ends in a working, testable result.

### The core design principle (what makes FUTURIA different)

> **Numbers come from math. The story comes from Claude.**

- A deterministic **Monte Carlo engine** (pure TypeScript, shared by browser and server) simulates 1,000 possible futures per path.
  - Optimistic, Realistic and Pessimistic are the **P90, P50 and P10 outcomes** of the same model, so they are consistent rather than three separately invented stories.
  - Sliders re-run the engine in a Web Worker in under 50 ms, with **no AI call and no cost**.
- **Claude does what math can't:**
  1. Turns a free-text decision into a structured model with sensible assumptions and follow-up questions.
  2. Writes the Time Machine narrative grounded in the engine's numbers.
  3. Explains risks and actions.
- **LangGraph is dropped.** The pipeline is a fixed sequence, so Inngest steps (durable, retried) plus the Anthropic SDK with structured outputs do the job with less machinery.

---

## Concrete User Journey: "Sara"

Sara is 29 and a senior UX designer. She takes home $5,200/mo, spends $3,100/mo and has $18,000 in savings. She is thinking about going freelance.

| #   | Step                  | What Sara sees                                                                                                                                                                        | Under the hood                                                      |
| --- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1   | Landing               | Hero input: _"What if I…"_. She types _"What if I quit my job to become a freelance UX designer?"_                                                                                    | No login needed yet                                                 |
| 2   | Smart intake (~1 min) | 5–7 tailored questions with smart defaults: take-home pay, expenses, savings, existing leads, expected rate, hours/week, dependents, "could you return to a job?"                     | Claude `analyzeIntake` call (structured output)                     |
| 3   | Path builder          | AI proposes **Path 1: Stay employed**, **Path 2: Quit & freelance full-time** and **Path 3: Hybrid** (side-freelance 6 months, then quit). She can rename, edit or add paths.         | Part of the intake output                                           |
| 4   | Assumptions review    | _"Here's what we assumed"_, for example: first client in 1–3 months; rate $45–70/h; 15–30 billable h/week. AI estimates are flagged amber. Everything is editable.                    | Claude `buildModel` call, then server-side sanity clamps            |
| 5   | Signup gate           | _"Create a free account to see your 3 futures"_ (the conversion moment)                                                                                                               | Clerk sign-up; the draft simulation is attached to her account      |
| 6   | Simulating (~20 s)    | _"Simulating 1,000 possible futures…"_ progress screen                                                                                                                                | Inngest pipeline: engine, then narrative                            |
| 7   | **Compare dashboard** | One card per path: median savings at month 12, **% chance of running out of money**, break-even month. A savings fan chart (P10–P90 band). Optimistic / Realistic / Pessimistic tabs. | Engine results from MongoDB                                         |
| 8   | **Tweak the future**  | Sliders for savings, expenses, rate, hours and months to first client. All charts update instantly.                                                                                   | Engine runs in a Web Worker with no AI cost                         |
| 9   | **What matters most** | Tornado chart: _"Your hourly rate and time-to-first-client drive 70% of the outcome."_                                                                                                | Engine sensitivity analysis                                         |
| 10  | **Time Machine**      | Month 1 / 3 / 6 / 9 / 12 timeline. Example: _"Month 3 (realistic): two retainer clients from your network, savings $11.7k. Risk: one client is 60% of revenue."_                      | Claude `writeNarrative`, grounded in the representative engine run  |
| 11  | **Action plan**       | _"Land 1 client before quitting: your risk of running out drops from 31% to 12%."_                                                                                                    | Engine computes the impact of each intervention; Claude explains it |
| 12  | Share                 | Public link plus a social card (_"My 3 futures"_), watermarked on the Free plan                                                                                                       | Share slug and `next/og` image                                      |
| 13  | Upgrade               | A paywall appears on the 4th simulation, a 24-month horizon, PDF export or more than 3 paths                                                                                          | Stripe Checkout                                                     |
| 14  | Retention (v1.x)      | Monthly email: _"Did you quit? Log your real income."_ She sees Reality vs. Forecast and a re-forecast.                                                                               | Inngest cron and Resend                                             |

---

## Architecture

```
Browser ── Next.js (Vercel) ───────────────┐
  ├─ Intake wizard / Dashboard / Share     │ HTTPS + Clerk JWT
  └─ Web Worker: @futuria/engine           ▼
                               NestJS API (Railway / Fly.io, Docker)
                                ├─ @futuria/engine (same code as browser)
                                ├─ AiService ──► Claude API (claude-opus-5-5)
                                ├─ Inngest functions (durable pipeline, cron)
                                ├─ MongoDB Atlas (Mongoose)
                                └─ Stripe webhooks, Resend email
```

### Repository layout

```
futuria/
├─ apps/
│  ├─ web/                 Next.js App Router, Tailwind, shadcn/ui, Recharts, TanStack Query, Clerk
│  └─ api/                 NestJS: auth, users, simulations, ai, pipeline (inngest), billing, share
├─ packages/
│  ├─ engine/              Pure-TS Monte Carlo engine (no deps besides shared), Vitest
│  ├─ shared/              Zod schemas + TS types + plan limits (used by web, api, engine, and as Claude output formats)
│  └─ config/              tsconfig / eslint / prettier presets
├─ docs/ROADMAP.md         this guide, committed
├─ CLAUDE.md               conventions for Claude Code sessions
├─ docker-compose.yml      local MongoDB
├─ turbo.json, pnpm-workspace.yaml, .github/workflows/ci.yml
```

### Extra services added to the original stack (and why)

| Service            | Why                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Clerk**          | Auth for Next.js and NestJS in about an hour; Organizations later serve the Business tier                                            |
| **Stripe Billing** | Checkout, Customer Portal and webhooks. Use Lemon Squeezy or Paddle as merchant of record if Stripe isn't available in your country. |
| **Sentry**         | Error tracking                                                                                                                       |
| **PostHog**        | Funnels and feature flags                                                                                                            |
| **Resend**         | Email                                                                                                                                |

---

## Core Designs

### 1. Simulation engine: `packages/engine`

- `rng.ts`: seeded PRNG (mulberry32). The seed is stored with each simulation, so share links and the server reproduce identical charts.
- `distributions.ts`: variables are `{kind:'fixed', value}` or `{kind:'range', low, likely, high}` (triangular, sampled with one draw so random streams stay aligned for smooth sliders and low-noise sensitivity). That form is easy for Claude to produce and for users to read: _"1–4 months, most likely 2"_.
- `paths/`: monthly step functions per path type:
  - `stay`: salary, raise %, small layoff probability
  - `freelance`: monthsToFirstClient, hourlyRate, billableHours ramp, monthly client-loss probability, business costs, effective tax rate, one-off setup cost
  - `startup`: monthsToFirstRevenue, starting MRR, growth %, monthly failure probability, optional funding event with founder salary
  - `newJob`: search months and a new salary
  - `hybrid`: part-time salary for N months plus side freelance, then switch
- Common inputs: savings, living expenses, emergency floor, other income, horizon (12 / 24 / 60 months).
- `simulate.ts`: runs N=1,000 per path. It returns monthly **P10, P25, P50, P75 and P90** for cash balance and income.
- `metrics.ts`:
  - `probRunOut`: share of runs where cash falls below the floor at any month
  - `breakEvenMonth`: _sustained_ break-even, the first month from which income covers expenses (3-month average) for the rest of the horizon
  - cash and income percentiles at the horizon
  - lowest-cash month
- `scenarios.ts`: picks the **actual run closest to P10, P50 and P90 final cash**. Claude narrates a coherent life path rather than a stitched-together set of percentiles.
- `sensitivity.ts`: one-at-a-time low/high perturbation of each variable, giving the tornado data.
- `interventions.ts`: predefined levers with quantified impact:
  - save 2 more months first
  - land 1 client before quitting
  - go hybrid for 6 months
  - cut expenses 15%
  - raise rate 10%
- **Performance target:** 3 paths × 1,000 runs × 24 months in under 50 ms in a worker.

### 2. AI pipeline: `apps/api/src/ai` and `apps/api/src/pipeline`

| Call             | When                                            | Input                                                                                | Output (Zod schema in `packages/shared`)                                                                                                   |
| ---------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `analyzeIntake`  | Sync, user waiting                              | decision text, saved profile                                                         | `{inScope, category, safetyFlag, title, questions[≤7], proposedPaths[2–3]}`                                                                |
| `buildModel`     | Sync, after answers                             | decision, answers, paths                                                             | `DecisionModel`: per-path variables as distributions + `assumptions[]` with `rationale`, `source` (user / ai_estimate), `confidence`       |
| `writeNarrative` | Async (Inngest), one call per path, in parallel | representative runs' numbers at months 1/3/6/9/12, assumptions, intervention impacts | `{scenarios: {optimistic, realistic, pessimistic}: milestones[{month, headline, events, opportunities, challenges, risks}], actionPlan[]}` |

**Conventions for every Claude call** (TypeScript `@anthropic-ai/sdk`):

- Call `client.messages.parse({ model: "claude-opus-5-5", max_tokens: 16000, output_config: { effort: "medium", format: zodOutputFormat(Schema) }, ... })`.
  - Thinking is always on with this model, so control depth with `effort` only.
  - Don't send `temperature`.
- **Refusal handling:**
  - Check `stop_reason` (`refusal`, `max_tokens`) before using `parsed_output`.
  - Server-side refusal fallback is **on by default**: beta `server-side-fallback-2026-07-01` with `fallbacks: "default"`. You can drop it if you prefer.
- **Prompt caching:**
  - Put a large, stable system prompt (Career Leap domain knowledge + output rules) first, with `cache_control`.
  - Put user data last.
- **Narrative grounding rule:** state only dollar figures that appear in the provided data. The UI renders the engine numbers beside each milestone anyway.
- **Input safety:**
  - The user's text is treated as data, not instructions.
  - It is limited to 1,000 characters.
  - No names or emails are sent to Claude.
- **Out-of-scope and crisis handling:**
  - Decisions outside Career Leap go to a "coming soon, join waitlist" screen. This collects demand data for picking niche #2.
  - A `safetyFlag` of crisis shows support resources and stops the pipeline.
- **Every call records** `{step, model, promptVersion, usage, costUsd}` on the simulation. Prompts are versioned in `ai/prompts/*.ts`.
- **`AiProvider` interface with two implementations:**
  - `AnthropicAiProvider` (real)
  - `FixtureAiProvider` (recorded JSON, selected with `AI_MODE=fixture`) for tests, CI and offline UI work

**Inngest function `simulation-run`:**

1. `step.run('load')`
2. `step.run('engine')`
3. `Promise.all(paths.map(p => step.run('narrate-'+p.id)))`
4. `step.run('finalize')`

Settings: 3 retries, concurrency of 2 per user, global throttle. Inngest is mounted in NestJS through its Express serve handler. Functions are built in an `InngestModule` factory so they can use Nest services.

**Cost:**

- Budget assumption: roughly $0.30–0.70 per full simulation on `claude-opus-5-5` at medium effort.
- **We measure the real figure in Phase 3** from the logged usage.
- Slider tweaks are free.
- If margins are tight, the levers are lower narrative effort, caching, or a cheaper model for the narrative. That choice is yours after we measure.

### 3. Data model (MongoDB via `@nestjs/mongoose`)

- **`users`**
  - `clerkId`, `email`, `plan`, `stripeCustomerId`
  - `usage {periodStart, simulationsUsed}`
  - `baseline {currency, netIncome, expenses, savings, dependents, country, riskTolerance}`, reused on the next simulation
- **`simulations`**
  - `userId`, `title`, `decisionText`
  - `status`: draft → intake_ready → model_ready → queued → simulating → narrating → ready | failed
  - `intake {questions, answers}`, `model: DecisionModel`, `seed`, `horizon`
  - `results` per path: percentiles, metrics, representative runs, sensitivity, interventions
  - `narrative` per path
  - `share {slug, isPublic}`, `aiUsage[]`, `promptVersion`, timestamps
- **(v1.x) `checkins`**: `simulationId`, `month`, `actualIncome`, `actualCash`, `notes`
- **(v2) `orgs`, `apiKeys`**

### 4. API surface (NestJS)

| Area        | Endpoints                                                                                                                                                                                                                                                                                                                              |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Simulations | `POST /simulations/intake` · `PATCH /simulations/:id/answers` · `POST /simulations/:id/model` · `PATCH /simulations/:id/model` (edit assumptions) · `POST /simulations/:id/run` (202, queues Inngest) · `GET /simulations/:id` (status, results, narrative; polled by the UI) · `GET /simulations` · `POST /simulations/:id/renarrate` |
| Sharing     | `POST /simulations/:id/share` · `GET /share/:slug` (public)                                                                                                                                                                                                                                                                            |
| Profile     | `GET/PUT /me/profile`                                                                                                                                                                                                                                                                                                                  |
| Billing     | `POST /billing/checkout` · `POST /billing/portal` · `POST /billing/webhook`                                                                                                                                                                                                                                                            |
| Inngest     | `POST /api/inngest`                                                                                                                                                                                                                                                                                                                    |

Cross-cutting concerns:

- `ClerkAuthGuard` verifies the bearer token with `@clerk/backend`.
- `PlanGuard` / `UsageService` does an atomic conditional `$inc` against plan limits.
- `@nestjs/throttler`, Zod validation pipe using the shared schemas, helmet, CORS.

### 5. Plans and limits (`packages/shared/src/plans.ts`)

| Plan     | Price  | Simulations                         | Horizon | Paths | Extras                                                                        |
| -------- | ------ | ----------------------------------- | ------- | ----- | ----------------------------------------------------------------------------- |
| Free     | $0     | 3 total                             | 12 mo   | 3     | Watermarked share                                                             |
| Pro      | $12/mo | 20/mo (tune after cost measurement) | 24 mo   | 5     | PDF export, story refresh, Reality Check, Ask the Future                      |
| Premium  | $29/mo | 60/mo                               | 60 mo   | 5     | Taxes / inflation / advanced variables, multiple profiles, all Decision Packs |
| Business | $99/mo | 200/mo pooled                       | 60 mo   | 8     | Team workspace, business packs, branded reports, API                          |

---

## Step-by-Step Build Phases

### Part A: MVP to public launch (about 8 weeks solo with Claude Code)

**Phase 0: Foundations (days 1–2)**

1. `git init`; pnpm + Turborepo workspace; Node 24 LTS; TypeScript strict.
2. Scaffold `apps/web` (create-next-app, Tailwind, shadcn/ui) and `apps/api` (Nest CLI).
3. Create the empty `packages/shared`, `packages/engine` and `packages/config`.
4. `docker-compose.yml` for MongoDB; `.env.example` for both apps; `GET /health` on the API.
5. Write `CLAUDE.md` (conventions, commands) and copy this guide to `docs/ROADMAP.md`.
6. GitHub Actions CI: lint, typecheck, test, build.
7. Deploy the skeletons early: web to Vercel, API to Railway or Fly, and a MongoDB Atlas cluster.

✅ Done when `pnpm dev` runs both apps, the web page calls `/health` successfully, CI is green, and both deploys are live.

**Phase 1: Simulation engine (week 1), the heart of the product**

1. Zod schemas in `shared`: `Distribution`, `PathConfig` (one per path type), `DecisionModel`, `SimulationResult`.
2. Engine modules as described in Core Design 1, built in this order: rng, distributions, `stay` and `freelance` paths, simulate, metrics, scenarios, then `hybrid`, `startup` and `newJob`, then sensitivity and interventions.
3. Unit and property tests (Vitest + fast-check):
   - the same seed gives the same output
   - P10 ≤ P50 ≤ P90
   - zero income means cash falls by exactly the expenses each month
   - a `stay` path with fixed variables equals the closed-form result
4. `pnpm --filter engine demo`: runs Sara's 3 paths and prints the metrics table and timing.

✅ Done when tests are green and the demo prints sensible numbers for Sara in under 50 ms.

**Phase 2: API core and data (week 2)**

1. Mongoose schemas for `users` and `simulations`; `ClerkAuthGuard`; user upsert on first request.
2. Simulations module: CRUD, plus `run` executing the engine synchronously from a hand-written `DecisionModel` fixture (no AI yet).
3. Zod validation pipe from the shared schemas; status state machine; error filter.

✅ Done when e2e tests (supertest + mongodb-memory-server) can create a simulation, run it and fetch the results.

**Phase 3: AI layer and pipeline (weeks 2–3)**

1. `AiProvider` interface; `AnthropicAiProvider` with the conventions above; `FixtureAiProvider`.
2. Prompts: intake, model build and narrative (versioned), with the Career Leap domain knowledge in the cached system prompt.
3. Server-side sanity clamps on Claude's numbers, for example rate between $5 and $500/h and ramp of 0–24 months.
4. Inngest client, the `simulation-run` function and the Nest mount; local Inngest Dev Server.
5. Usage and cost logging per call.
6. **Eval harness** (`apps/api/evals`): about 30 personas and decisions, checked for:
   - schema validity
   - plausible ranges
   - no guarantee language
   - narrative figures matching the engine numbers
   - out-of-scope and crisis routing

   Run it with `pnpm eval`. It uses the real API and costs money, so run it manually before any prompt change.

7. Record fixtures from real runs for `AI_MODE=fixture`.

✅ Done when the full pipeline works end to end in the Inngest dev UI, the evals pass, and **we know the real cost per simulation**. Revisit the Pro quota with that number.

**Phase 4: Web app MVP (weeks 3–5)**

1. Landing page: hero input, example decisions, how it works, pricing.
2. `/new` wizard:
   - decision → questions → paths → assumptions review
   - AI estimates highlighted
   - all fields editable
3. `/s/[id]`:
   - progress state, polling `GET /simulations/:id`
   - **Compare** tab: path cards and the Recharts fan chart (Area P10–P90 band with a P50 line, one colour per path)
   - Optimistic / Realistic / Pessimistic switch
4. **Tweak panel:** sliders, with the engine running in a Web Worker (Comlink) for instant recompute and an "Update story" button that calls renarrate.
5. **What matters most** (tornado chart), **Time Machine** (vertical milestone timeline with engine numbers per step) and **Action plan** (intervention cards showing before/after risk).
6. `/dashboard` (my simulations) and `/settings/profile` (baseline reuse).
7. Responsive layout for mobile and desktop; dark mode; "not financial or career advice" disclaimers.

✅ Done when the Playwright e2e test of Sara's full journey passes in `AI_MODE=fixture`, and a manual run with real Claude feels good on phone and desktop.

**Phase 5: Accounts, limits and billing (weeks 5–6)**

1. Clerk UI in web, with the signup gate at step 5 of the journey.
2. Anonymous draft → claimed simulation.
3. `PlanGuard` limits and an upgrade modal at each gate.
4. Stripe products for Pro and Premium (monthly and yearly), Checkout, Customer Portal, and a webhook that syncs the plan to the user.

✅ Done when you can upgrade with a test card and the plan updates via the webhook (Stripe CLI `stripe listen`), and limits block and unblock correctly.

**Phase 6: Share and growth loop (week 6)**

1. Public `/share/[slug]` (read-only, no personal numbers unless the user opts in); `opengraph-image.tsx` "My 3 futures" card; watermark on Free.
2. PDF export for Pro: a print-optimized route, server-rendered to PDF.
3. PostHog funnel events: landing → intake started → model reviewed → signup → results viewed → shared → upgraded.
4. SEO landing pages, for example _"Should I quit my job to freelance? Free simulator"_, _"Freelance runway calculator"_, _"Quit job to start a startup: simulator"_.

✅ Done when a shared link renders a correct OG preview in a link debugger and the funnel shows in PostHog.

**Phase 7: Hardening and launch (weeks 7–8)**

1. Sentry in both apps; alerts on failed pipelines; a daily AI spend alert.
2. Security pass:
   - rate limits and input size limits
   - helmet and CORS
   - secrets only in environment variables
   - authorization on every simulation route (owner only)
3. Privacy: ToS and privacy policy, data export, account and data deletion.
4. Small load test of the API and pipeline concurrency.
5. Private beta with 20–50 people in the freelance or career-change community; interview 10 of them; fix the top issues.
6. **Launch:** Product Hunt, Indie Hackers, r/freelance, r/careerguidance, LinkedIn, and a build-in-public thread.

✅ **v1.0 live.** Launch targets:

- 25% or more of visitors who start the intake see results
- 10% or more of results are shared
- 3–5% of free users convert to paid
- AI cost below 30% of revenue

### Part B: v1.0 to final version (months 3–6+)

**Phase 8: Retention and depth (v1.1–1.3)**

1. **Reality Check:** a monthly Inngest cron sends a Resend email. The user logs their actual income and cash and sees Reality vs. Forecast plus a re-forecast. This is the retention engine, and over time it becomes a data moat.
2. **Versions:** save tweak snapshots and see "what changed".
3. **Ask the Future** chat (Pro): Claude with a `run_simulation` tool that calls the engine through the SDK tool runner. For example: _"What if I also cut rent by $400?"_ answered with real recomputed numbers.

**Phase 9: Decision Packs (v1.5), expanding beyond Career Leap**

1. Refactor the engine into a **pack plugin system**: each pack is a variable schema, model step functions, prompt pack and UI templates.
2. Pick packs by waitlist demand data from out-of-scope intakes. Likely order: **Education / Upskilling** ("a year learning AI"), **Personal Finance** ("invest $500/mo"), **Relocation**.
3. Premium tier: 60-month horizon, taxes and inflation, multiple profiles.

**Phase 10: Business tier (v2.0)**

1. Clerk Organizations for team workspaces with a shared simulation library.
2. Business packs: price +20%, hiring, opening a new market. Import real metrics from CSV.
3. Branded PDF reports; public REST API with API keys and usage metering. This tier is $99/mo.

**Phase 11: Scale and polish (ongoing)**

1. i18n and multi-currency.
2. A PWA install, then an Expo mobile app if usage justifies it.
3. Paywall and onboarding A/B tests with PostHog flags.
4. Cost optimization pass on prompts and effort.
5. **Data-informed priors:** aggregated, anonymized Reality Check data replaces generic AI estimates for default ranges. This is the long-term moat.

---

## Verification (how we prove each part works)

| Layer      | How                                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------ |
| Engine     | `pnpm --filter engine test` (Vitest + fast-check invariants) and `pnpm --filter engine demo` (Sara's numbers and timing) |
| API        | `pnpm --filter @futuria/api test:e2e` (supertest + throwaway MongoDB databases, `AI_MODE=fixture`, inline pipeline)      |
| AI quality | `pnpm eval --yes`: 30 personas checked for schema, ranges, routing and grounding. Real API, run manually.                |
| Pipeline   | Inngest Dev Server (`npx inngest-cli@latest dev`): watch `simulation-run` steps, retries and failures                    |
| Web        | `pnpm --filter web test:e2e`: Playwright test of Sara's full journey in fixture mode, on desktop and mobile viewports    |
| Billing    | Stripe test mode, `stripe listen --forward-to localhost:<api>/billing/webhook`, test cards                               |
| Production | Staging deploy, then a full manual journey with real Claude, a Sentry error check, and a PostHog funnel check            |

CI runs everything except the real-API evals on every push.

## Key Risks and Mitigations

| Risk                             | Mitigation                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| "AI fortune-telling" credibility | Every number traceable to visible, editable assumptions; ranges, not predictions; disclaimers                |
| AI cost per simulation           | Sliders are free (local engine); usage logged per call; quota tuned after Phase 3; caching and effort levers |
| Hallucinated numbers             | Claude never produces final numbers; the engine does. Narrative grounding rule plus an eval check.           |
| Sensitive inputs                 | Crisis routing, no personal identifiers sent to Claude, data deletion, owner-only access                     |
| Scope creep                      | One niche until v1.0 metrics are hit; new packs chosen by waitlist data                                      |

## How we execute together

Once this plan is approved, I start with **Phase 0 and Phase 1** (scaffold plus engine), because the engine is the product's core and needs no API keys. Each later phase starts with _"Implement Phase N from docs/ROADMAP.md"_ and ends with its ✅ checks passing before we move on.

Things you'll need to set up yourself when we reach them:

- Anthropic API key (Phase 3)
- Clerk account (Phase 2)
- MongoDB Atlas, Vercel, and Railway or Fly (Phase 0 deploy, which can be deferred)
- Inngest account (Phase 3)
- Stripe or another merchant of record (Phase 5)
- Sentry and PostHog (Phase 7)
