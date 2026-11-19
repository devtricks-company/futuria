# Run and test FUTURIA locally

What exists so far:

- **Phase 0:** the monorepo and a status page
- **Phase 1:** the simulation engine
- **Phase 2:** the NestJS API on the `futuria` database in your MongoDB Atlas cluster
- **Phase 3:** the AI layer (intake, model, narrative) and the run pipeline (Inngest, or inline)
- **Phase 4:** the web app: landing page, the `/new` wizard, results with sliders, dashboard and profile
- **Phase 5:** accounts (Clerk), the signup gate, plan limits with an upgrade dialog, and Stripe billing
- **Phase 6:** share links with social cards, the PDF report (Pro), PostHog funnel events, and search landing pages

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
- passing tests: shared 27, engine 43, web 63, API unit 57, API e2e 52

The API e2e tests use the server in `MONGODB_TEST_URI` (set it in `apps/api/.env` to run them on Atlas), or your local MongoDB if it's unset. Each test file creates a temporary `futuria_test_*` database and deletes it afterwards. Your `futuria` database is never touched. Local MongoDB is faster; on Atlas, expect the e2e step to take a few seconds longer.

The e2e tests always use fixture AI and the inline pipeline, even if your `.env` has Claude or Inngest settings. Two red lines in the output are expected, `ERROR ... Inline run ... failed` and `ERROR ... Could not queue run`: tests check that a failing run and a queue outage are reported (and refunded) correctly.

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

The browser counts as `dev-user` while the API runs in dev auth mode (no Clerk keys). With Clerk
set up, see section 12.

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
pnpm --filter @futuria/web build:e2e                           # only if apps/web/.env.local has Clerk keys
pnpm --filter @futuria/web exec playwright install chromium    # once
pnpm --filter @futuria/web test:e2e
```

The tests use the API's dev identity, so the web app must be built **without** Clerk. `build:e2e`
rebuilds it with `NEXT_PUBLIC_CLERK_DISABLED=1` even when `.env.local` has keys. Run
`pnpm --filter @futuria/web build` afterwards to get a Clerk build back.

They start their own API (port 4100, fixture AI, inline pipeline, dev auth) and web app (port
3100), so `pnpm dev` can keep running. The API uses a throwaway `futuria_test_web_e2e` database
on `MONGODB_TEST_URI` or local MongoDB, dropped afterwards, and never reads `apps/api/.env`.
Each test runs on a desktop and a phone viewport (28 in all). They cover:

- Sara's full journey and profile pre-fill
- the out-of-scope and crisis screens
- the Free plan's upgrade dialogs: paths, horizon, "Update the story" and the billing page
- sharing a simulation and opening the link signed out, with its social card
- the PDF: an upgrade dialog on Free, then a real download on Pro
- analytics staying off without a key
- the search landing pages, the sitemap and `robots.txt`

CI runs them in the `web-e2e` job.

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
- `--renarrate` checks the story refresh: a paid feature, so on Free it expects `403 plan_feature`.
- `--user alice` acts as a given dev user. By default every run is a new user (`smoke-<time>`) on
  the Free plan, so repeated runs never hit its 3-simulation limit.

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

## 12. Accounts, plan limits and billing (Phase 5)

### Sign-up and the signup gate (Clerk dev keys)

1. `apps/web/.env.local`: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`,
   `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`.
2. `apps/api/.env`: the same `CLERK_SECRET_KEY`, and **remove `AUTH_MODE=dev`** (it overrides the
   key). `GET /health` doesn't show the auth mode; the API logs a warning at startup in dev mode.
3. `pnpm dev`, then in a private window: landing page → wizard → assumptions. The button reads
   **See my 3 futures**. Clicking it saves your edits and opens the signup gate.
4. Sign up. You come back to `/new/<id>?run=1`, the draft moves to your account (the anonymous
   cookie `futuria_anon` is dropped), and the run starts by itself.
5. `/dashboard` lists it. `/dashboard` and `/settings/*` now require sign-in.

A signed-out visitor can make up to 3 drafts; they expire after 14 days unless claimed.

### Plan limits (no Stripe needed)

On Free, check that each of these opens the upgrade dialog instead of failing:

- a 4th simulation (the `/new` page says so before Claude reads the decision)
- a 24-, 36- or 60-month horizon (locked options in the assumptions review)
- a 4th path (the paths step)
- "Update the story" or "Edit all assumptions" on a finished simulation (sliders stay free)

Without Stripe keys the dialog says payments aren't set up. `/settings/billing` shows the plan and
usage. To try a paid plan without Stripe, set `plan` on your user in the `users` collection.

### Stripe test mode

1. Create a Stripe account (test mode is enough) and install the Stripe CLI
   (`winget install --id Stripe.StripeCli -e`, then open a new terminal); run `stripe login`.
2. `apps/api/.env`: `STRIPE_SECRET_KEY=sk_test_...`.
3. `pnpm --filter @futuria/api stripe:setup`: creates Pro and Premium with monthly and yearly
   prices (lookup keys `futuria_<plan>_<month|year>`) and the Customer Portal settings. Safe to run
   again; a changed price gets a new Stripe price and the old one is archived.
4. `pnpm --filter @futuria/api stripe:listen` (it runs `stripe listen` with the events the API
   handles; Stripe CLI 1.55+ refuses to listen without an event list) and put the `whsec_...` it prints
   in `STRIPE_WEBHOOK_SECRET`. Restart the API: `GET /health` shows `"billing":"stripe"`.
5. Upgrade from the dialog or `/settings/billing` with card `4242 4242 4242 4242` (any future date,
   any CVC). Back on `/settings/billing` the plan is Pro (synced right away, and again by the
   webhook), the usage meter resets, and 24-month horizons and story updates unlock.
6. **Manage billing** opens the Customer Portal (switch plans, cancel at period end, invoices).
   To test a downgrade now, cancel the subscription immediately in the Stripe Dashboard: the
   webhook sets the plan back to Free and the limits block again.

## 13. Sharing, PDF, analytics and search pages (Phase 6)

### Share a simulation

1. On a finished simulation, click **Share** and turn on **Public link**. The dialog shows exactly
   what the page will show. **Copy** the link.
2. Open it in a private window, signed out. You should see:
   - the title, the futures chart and each path's chance of running out, with no amounts
   - on Free, a "Made with FUTURIA" band
3. Turn on **Show amounts and stories**, then reload: the amounts and the full results appear.
4. **New link** replaces the address, and the old one shows "This link isn't shared anymore".
   Turning **Public link** off does the same, immediately.
5. The link's social card: add `/opengraph-image` to the share URL. The site card is at
   http://localhost:3000/opengraph-image.

### Link preview in a link debugger (Phase 6 ✅)

A link debugger has to reach the page over the internet, so this uses a temporary tunnel. The
script below runs a separate, throwaway copy of the app for it:

- fixture AI, so it costs nothing
- a `futuria_test_share_preview` database, dropped when you stop it, never your data
- no Clerk: a Clerk development instance redirects visitors without cookies (link-preview bots
  too) to its handshake, so the bot would never see the card. Production keys don't do this.
- no analytics

1. Install cloudflared once, then open a new terminal:
   `winget install --id Cloudflare.cloudflared -e`
2. In terminal 1, start the tunnel and copy the `https://<name>.trycloudflare.com` URL it prints:
   `cloudflared tunnel --url http://localhost:3200`
3. In terminal 2, build once and start the preview:
   ```powershell
   pnpm build
   pnpm --filter @futuria/web share:preview https://<name>.trycloudflare.com
   ```
   The script rebuilds the web app for that URL and starts the API on :4200 and the web app on
   :3200. It then shares Sara's simulation as a Free user and as a Pro user, checks both links
   through the tunnel the way a bot sees them, and prints them.
4. Paste each link into the [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/)
   or the [LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/). Both need a login.
   Posting the link in a private chat works too.
   - **Free:** the card shows the title and the three futures with their chances, plus a "Made
     with FUTURIA · free plan" band.
   - **Pro:** the same card with no band. Cards never show amounts; this share's page does,
     because the owner turned them on.
5. Press Ctrl+C. The database is dropped and both servers stop. Then run
   `pnpm --filter @futuria/web build` to get your normal build back.

### PDF report (Pro)

On Free, **Download PDF** on a results page opens the upgrade dialog. Upgrade with a test card
(section 12), or set `plan: "pro"` on your user in the `users` collection. **Download PDF** then
saves `futuria-<title>.pdf` with these sections:

- the summary
- the futures chart
- what matters most
- the realistic Time Machine
- the action plan
- the assumptions

### PostHog funnel (Phase 6 ✅)

1. Create a free PostHog project and copy its project API key (`phc_...`). In
   `apps/web/.env.local` set `NEXT_PUBLIC_POSTHOG_KEY=phc_...` and `NEXT_PUBLIC_POSTHOG_REGION`
   (`us` or `eu`, matching the project). Restart `pnpm dev`.
2. Use Clerk keys (section 12), so `signed_up` fires, and Stripe test mode, so `upgraded` fires.
3. In a private window, walk the whole funnel:

   | Step                        | Event            |
   | --------------------------- | ---------------- |
   | Landing page                | `landing_viewed` |
   | **Simulate my futures**     | `intake_started` |
   | **See my 3 futures**        | `model_reviewed` |
   | Sign up                     | `signed_up`      |
   | The results page            | `results_viewed` |
   | **Share** → **Public link** | `shared`         |
   | Upgrade with card 4242      | `upgraded`       |

4. In PostHog, **Activity** shows the events within a few seconds. Then go to **Product
   analytics** → **New insight** → **Funnel** and add the seven events in that order. The funnel
   shows your pass through every step.
5. Check the privacy rules. No event URL contains `q=` (the decision text) or `session_id=`. No
   event carries amounts, names or emails; the person is the Clerk user id.

Events go through the app's own `/ingest` relay, so ad blockers don't drop them. Without a key,
nothing is loaded and `/ingest` answers 404.

### Search landing pages

| URL                                                     | What you should see                                  |
| ------------------------------------------------------- | ---------------------------------------------------- |
| http://localhost:3000/should-i-quit-my-job-to-freelance | Sara's futures, a prefilled form, the FAQ            |
| http://localhost:3000/freelance-runway-calculator       | The same, framed as how long savings last            |
| http://localhost:3000/quit-job-to-start-a-startup       | Leo's futures: stay, bootstrap, or raise a round     |
| http://localhost:3000/sitemap.xml                       | The landing page and the three pages above           |
| http://localhost:3000/robots.txt                        | The app's private areas are blocked, `/share/` isn't |

The prefilled form carries its decision into the wizard.

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
| Browser tests stuck on sign-in pages      | The web build has Clerk keys. Run `pnpm --filter @futuria/web build:e2e` before `test:e2e`.                     |
| Signed in, but the API acts as `dev-user` | `apps/api/.env` still has `AUTH_MODE=dev`. Remove it so the API verifies Clerk tokens.                          |
| Checkout: 503 `billing_disabled`          | No `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` in `apps/api/.env`. See section 12.                              |
| Checkout: 503 `billing_misconfigured`     | The Stripe prices don't exist yet. Run `pnpm --filter @futuria/api stripe:setup`.                               |
| Plan doesn't change after paying          | `stripe:listen` isn't running or its `whsec_` doesn't match `STRIPE_WEBHOOK_SECRET`.                            |
| `must specify events to forward`          | Plain `stripe listen` needs `--events`. Use `pnpm --filter @futuria/api stripe:listen`.                         |
| API won't start: `requires ANTHROPIC_...` | `AI_MODE=anthropic` without a key. Add `ANTHROPIC_API_KEY` or remove `AI_MODE`.                                 |
| Link debugger: no image, or a 307         | Clerk development keys redirect bots. Use `share:preview` (section 13).                                         |
| Card's og:image points at localhost       | `NEXT_PUBLIC_SITE_URL` is read at build time. Rebuild with the public URL (`share:preview` does).               |
| `share:preview`: "not reachable"          | The tunnel isn't running, or it doesn't point at `http://localhost:3200`.                                       |
| No events in PostHog                      | Key or region missing or wrong in `apps/web/.env.local`. They're read at startup and build: restart `pnpm dev`. |
| **Download PDF** opens the upgrade dialog | The PDF is a Pro feature. Upgrade (section 12) or set `plan` on your user.                                      |
