# Run and test FUTURIA locally

What exists so far:

- **Phase 0:** the monorepo and a status page
- **Phase 1:** the simulation engine
- **Phase 2:** the NestJS API on the `futuria` database in your MongoDB Atlas cluster
- **Phase 3:** the AI layer (intake, model, narrative) and the run pipeline (Inngest, or inline)
- **Phase 4:** the web app: landing page, the `/new` wizard, results with sliders, dashboard and profile

You can test in layers: automated tests, browser tests, the engine demo, the app in a browser, the API endpoints, and (with credentials) real Claude.

Without Claude credentials the API uses **fixture AI**: realistic stand-in answers, no API calls, no cost. `GET /health` shows which mode you're in (`"ai":"fixture"` or `"anthropic"`, `"pipeline":"inline"` or `"inngest"`).

Run everything from `F:\futuria` in PowerShell or the VS Code terminal.

> **PowerShell 5.1 note:** `curl` is an alias for `Invoke-WebRequest` there. Use the browser, `curl.exe`, `Invoke-RestMethod`, or the smoke script below.

## 1. Run every automated test (about 20 s)

```powershell
pnpm check
```

Expected result:

- every Turborepo task successful
- passing tests: shared 18, engine 31, web 23, API unit 46, API e2e 22

The API e2e tests use the server in `MONGODB_TEST_URI` (set it in `apps/api/.env` to run them on Atlas), or your local MongoDB if it's unset. Each test file creates a temporary `futuria_test_*` database and deletes it afterwards. Your `futuria` database is never touched. Local MongoDB is faster; on Atlas, expect the e2e step to take a few seconds longer.

The e2e tests always use fixture AI and the inline pipeline, even if your `.env` has Claude or Inngest settings. One red `ERROR ... Inline run ... failed` line in the output is expected: a test checks that a failing run is reported correctly.

## 2. See the engine work (no servers needed)

```powershell
pnpm --filter @futuria/engine demo
```

You should see:

- Sara's three paths: Stay ~0%, Quit & freelance ~19%, Hybrid ~0% chance of running out
- one realistic month-by-month future
- "what matters most" (sensitivity)
- the action plan
- timings

## 3. Start everything

```powershell
pnpm dev
```

This starts the web app on http://localhost:3000, the API on http://localhost:4000, and watchers that rebuild the shared packages when you change them. Leave it running and open a second terminal for the next steps. Press Ctrl+C to stop.

## 4. Check in the browser

| URL                                      | What you should see                                                  |
| ---------------------------------------- | -------------------------------------------------------------------- |
| http://localhost:3000                    | The landing page, with Sara's example numbers computed by the engine |
| http://localhost:4000/health             | `"database":"up"`                                                    |
| http://localhost:4000/me                 | `dev-user` on the Free plan, with its limits                         |
| http://localhost:4000/simulations        | "Sample: Sara quits to freelance"                                    |
| http://localhost:4000/simulations/`<id>` | The full stored results (copy the id from the list)                  |

The browser counts as `dev-user` because the API runs in dev auth mode until Clerk keys are added.

## 5. Walk Sara's journey in the browser

With `pnpm dev` running, open http://localhost:3000:

1. Type _"What if I quit my job to become a freelance UX designer?"_ (or click **Quit to freelance**)
   and press **Simulate my futures**, then **Continue**.
2. **Questions:** the defaults are filled in. Change any, then **Next: your paths**.
3. **Paths:** rename, remove or add one, then **Build my simulation** (about 30 s with real Claude).
4. **Assumptions:** AI estimates are highlighted in amber; **Edit** any value. **Run simulation**.
5. **Results:** path cards and the fan chart; switch Optimistic / Realistic / Pessimistic.
   - Move a slider in **Tweak the future** (the side panel, or the **Tweak** button on a phone):
     every number updates instantly, computed in your browser. **Update the story** saves the
     tweaks and runs again with a new story (a real Claude call when `"ai":"anthropic"`).
   - **What matters most**, **Time Machine** and **Action plan** tabs, per path.
6. **My simulations** lists it; **Profile** saves your numbers for the next simulation.

Try it at phone width (DevTools device mode) and with the theme toggle in the header.

With fixture AI and Sara's exact sentence, the questions and assumptions are Claude's recorded
real answers. Any other sentence gets deterministic stand-in answers, and the stories are always
stand-ins.

## 6. Browser tests (Playwright)

```powershell
pnpm build                                                     # the tests run the production builds
pnpm --filter @futuria/web exec playwright install chromium    # once
pnpm --filter @futuria/web test:e2e
```

They start their own API (port 4100, fixture AI, inline pipeline, dev auth) and web app (port
3100), so `pnpm dev` can keep running. The API uses a throwaway `futuria_test_web_e2e` database
on `MONGODB_TEST_URI` or local MongoDB, dropped afterwards, and never reads `apps/api/.env`.
Each test runs on a desktop and a phone viewport: Sara's full journey, profile pre-fill, and the
out-of-scope and crisis screens. CI runs them in the `web-e2e` job.

## 7. Create and run a new simulation through the API (one command)

```powershell
pnpm --filter @futuria/api smoke
```

The script walks Sara's journey through every endpoint, in order:

1. Health check (shows the AI and pipeline modes)
2. Your user (`/me`)
3. A simulation without a model can't run (expects a 409)
4. Intake: Sara's sentence becomes questions and proposed paths
5. Answers: accepts every default
6. Model: built from the answers, with the AI's estimates and their reasons
7. Model edit round trip (`PATCH /model`)
8. Run: `202 queued`, then it polls until `ready` and prints each status change
9. A results table, the biggest driver, the Time Machine for the riskiest path, and the top action
10. Check that another user can't see it (expects a 404)
11. List your simulations

Options:

- `--cleanup` deletes the new simulation at the end.
- `--renarrate` also refreshes the story (`POST /renarrate`).
- `--user alice` acts as a different dev user.

With `"ai":"anthropic"` the script makes real Claude calls: one full simulation, about $0.35–0.45. The intake and model steps take up to a minute each, and the run up to a couple of minutes.

It exits with an error if any response is unexpected. The privacy check creates a dev user called `bob` (or `carol`) in the database the first time it runs.

## 8. Optional: try the endpoints by hand

```powershell
$api = 'http://localhost:4000'
$sim = Invoke-RestMethod -Method Post "$api/simulations" -ContentType 'application/json' `
  -Body '{"decisionText":"What if I quit my job to freelance?"}'
$sim.status                                                        # draft
Invoke-RestMethod -Method Post "$api/simulations/$($sim.id)/run"   # error 409: no model yet (expected)
Invoke-RestMethod "$api/simulations" -Headers @{ 'x-dev-user' = 'bob' }   # bob sees nothing
Invoke-RestMethod -Method Delete "$api/simulations/$($sim.id)"     # remove it again
```

## 9. Watch the pipeline in the Inngest Dev Server

By default runs happen inside the API process (`pipeline: inline`). To use Inngest locally, as production will:

1. Add `INNGEST_DEV=1` to `apps/api/.env` and restart `pnpm dev`.
2. In another terminal: `npx inngest-cli@latest dev -u http://localhost:4000/api/inngest`
3. Open http://localhost:8288, then run the smoke test or a simulation in the browser. Under **Runs** you'll see `simulation-run` with its steps: `load`, `engine`, one `narrate-<path>` per path, and `finalize`.

If a run stays `queued`, the Dev Server isn't running or can't reach the API.

## 10. Real Claude (through your gateway)

1. In `apps/api/.env` set `ANTHROPIC_BASE_URL` (gateway root, no `/v1`) and `ANTHROPIC_API_KEY`. If your gateway expects `Authorization: Bearer`, use `ANTHROPIC_AUTH_TOKEN` instead.
2. `pnpm --filter @futuria/api ai:probe`: about 7 tiny requests (a few cents). It checks that the gateway speaks the Anthropic Messages API and passes through structured outputs, effort, the refusal fallback and prompt caching. Then it prints the `.env` switches to use.
3. `pnpm eval --fixture`: free dry run of the eval harness.
4. `pnpm eval --yes`: 30 personas against real Claude (about $10). It prints pass/fail per persona and the **cost per simulation**. Reports go to `apps/api/evals/results/` (gitignored).
5. After changing a check, `pnpm eval --replay evals/results/<file>.json` re-scores a saved run without calling Claude (the path is relative to `apps/api`).
6. `pnpm --filter @futuria/api fixtures:record --yes`: saves Sara's real intake and model outputs (about $0.10–0.20) so fixture mode replays them. Commit the files under `apps/api/fixtures/ai/`.

## 11. Look inside the database

1. Open **MongoDB Compass** (or **Browse Collections** on your cluster in the Atlas web UI).
2. Connect with the same `MONGODB_URI` string as in `apps/api/.env`.
3. Open the `futuria` database:
   - `users`: one document per dev user, e.g. `dev:dev-user` on the `free` plan.
   - `simulations`: the sample, plus anything you created. Each stores `model`, `seed` and the full `analysis`.

## Troubleshooting

| Problem                                   | Fix                                                                                                             |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| "API is not reachable" in the web app     | The API isn't running, or it can't reach MongoDB. Check the `pnpm dev` output.                                  |
| Playwright: "Executable doesn't exist"    | Run `pnpm --filter @futuria/web exec playwright install chromium` once.                                         |
| Browser tests see old code                | They run the production builds: `pnpm build` first.                                                             |
| Atlas: "IP that isn't whitelisted"        | Atlas > Network Access > Add IP Address > Add Current IP Address.                                               |
| Atlas: "bad auth : authentication failed" | Check the user and password in `MONGODB_URI`; percent-encode `@ : / ? #`.                                       |
| Atlas: `querySrv ECONNREFUSED`/`ETIMEOUT` | Your DNS can't resolve SRV records. Use another DNS (e.g. 1.1.1.1) or the standard (non-SRV) string from Atlas. |
| Atlas cluster paused                      | Free clusters pause after long inactivity. Resume it in the Atlas UI.                                           |
| Local MongoDB stopped (e2e tests)         | Run `Start-Service MongoDB` as Administrator, or set `MONGODB_TEST_URI`.                                        |
| Port 3000 or 4000 already in use          | Stop the other process, or change `PORT` in `apps/api/.env`.                                                    |
| Sample simulation missing                 | Run `pnpm --filter @futuria/api db:setup --seed`. It's safe to run again.                                       |
| `curl` errors in PowerShell               | Use `curl.exe`, `Invoke-RestMethod` or the browser.                                                             |
| Engine or shared changes not picked up    | Under `pnpm dev` the watchers rebuild them. Otherwise run `pnpm build`.                                         |
| Run stuck in `queued`                     | `PIPELINE_MODE=inngest` without the Dev Server running. Start it (section 7) or remove `INNGEST_DEV`.           |
| `ai_misconfigured` (502) on intake        | Claude rejected the key, URL, model or a feature. Run `ai:probe` and apply the switches it suggests.            |
| API won't start: `requires ANTHROPIC_...` | `AI_MODE=anthropic` without a key. Add `ANTHROPIC_API_KEY` or remove `AI_MODE`.                                 |
