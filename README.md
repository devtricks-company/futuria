# FUTURIA

_Explore the Future Before You Live It._

FUTURIA simulates a career decision before you make it. For example: "What if I quit my job to
become a freelance UX designer?" It runs thousands of possible futures per path and shows:

- the chance of running out of money
- savings and income ranges
- when you break even
- which assumptions matter most
- concrete actions that reduce the risk

A deterministic Monte Carlo engine computes every number. Claude turns the decision into a model
and narrates the results.

## Status

- **Phase 0 (foundations)**: done, except the hosted deploys (they need your Vercel, Railway or
  Fly, and MongoDB Atlas accounts).
- **Phase 1 (simulation engine)**: done.

Next is Phase 2 (API core and data). See [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Quick start

Requirements: Node 24 and pnpm 11 (`corepack enable`).

```sh
pnpm install
pnpm build                            # build shared packages and apps
pnpm --filter @futuria/engine demo    # see the engine on the "Sara" example
pnpm dev                              # web on http://localhost:3000, API on http://localhost:4000
```

Copy `apps/api/.env.example` to `apps/api/.env` and `apps/web/.env.example` to
`apps/web/.env.local` before you need non-default settings.

## Repository

```
apps/web          Next.js 16 front end
apps/api          NestJS 12 API
packages/engine   Monte Carlo simulation engine (browser + server)
packages/shared   Zod schemas, types, plan limits, fixtures
packages/config   tsconfig / ESLint presets
docs/ROADMAP.md   step-by-step build guide, MVP to final version
```

`pnpm check` runs lint, typecheck, tests and build, the same as CI.
