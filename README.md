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
- **Phase 2 (API core and data)**: done, on MongoDB Atlas with dev auth until Clerk keys are added.

Next is Phase 3 (AI layer and pipeline). See [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Quick start

Requirements:

- Node 24
- pnpm 11 (`corepack enable`)
- A MongoDB Atlas cluster (the free tier is fine), with your IP on its Network Access list.
  A local MongoDB (`docker compose up -d`) also works.

```sh
pnpm install
cp apps/api/.env.example apps/api/.env              # then paste your Atlas string into MONGODB_URI
pnpm build                                          # build shared packages and apps
pnpm --filter @futuria/api db:setup --seed          # create the "futuria" database + Sara sample
pnpm --filter @futuria/engine demo                  # see the engine on the "Sara" example
pnpm dev                                            # web :3000, API :4000
```

Try the API (dev auth picks the user from the `x-dev-user` header, default `dev-user`):

```sh
curl http://localhost:4000/health
curl http://localhost:4000/me
curl http://localhost:4000/simulations
```

| Endpoint                       | Purpose                                                  |
| ------------------------------ | -------------------------------------------------------- |
| `GET /health`                  | Public. Engine version and database status               |
| `GET /me`                      | Current user, plan and limits (created on first request) |
| `POST /simulations`            | Create from `decisionText` (+ optional `model`)          |
| `GET /simulations`             | List your simulations                                    |
| `GET /simulations/:id`         | Full simulation, including results                       |
| `PATCH /simulations/:id/model` | Replace the decision model (clears old results)          |
| `POST /simulations/:id/run`    | Run the engine and store the results                     |
| `DELETE /simulations/:id`      | Delete                                                   |

## Repository

```
apps/web          Next.js 16 front end
apps/api          NestJS 12 API
packages/engine   Monte Carlo simulation engine (browser + server)
packages/shared   Zod schemas, types, plan limits, fixtures
packages/config   tsconfig / ESLint presets
docs/ROADMAP.md   step-by-step build guide, MVP to final version
```

`pnpm check` runs lint, typecheck, tests and build, the same as CI. For a step-by-step guide to
running and testing everything locally, see [`docs/TESTING.md`](docs/TESTING.md).
