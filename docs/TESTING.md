# Run and test FUTURIA locally

What exists so far:

- **Phase 0:** the monorepo and a status page
- **Phase 1:** the simulation engine
- **Phase 2:** the NestJS API on your local MongoDB `futuria` database

There's no simulation UI yet (that's Phase 4), so you test in four layers: automated tests, the engine demo, the running apps in a browser, and the API endpoints.

Run everything from `F:\futuria` in PowerShell or the VS Code terminal.

> **PowerShell 5.1 note:** `curl` is an alias for `Invoke-WebRequest` there. Use the browser, `curl.exe`, `Invoke-RestMethod`, or the smoke script below.

## 1. Run every automated test (about 20 s)

```powershell
pnpm check
```

Expected result:

- `Tasks: 15 successful, 15 total`
- 59 passing tests: shared 10, engine 31, API unit 10, API e2e 8

The API e2e tests use your local MongoDB. Each test file creates a temporary `futuria_test_*` database and deletes it afterwards. Your `futuria` database is never touched.

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

| URL                                      | What you should see                                                    |
| ---------------------------------------- | ---------------------------------------------------------------------- |
| http://localhost:3000                    | FUTURIA page with the "Engine check" table and "API ok, engine v1.0.0" |
| http://localhost:4000/health             | `"database":"up"`                                                      |
| http://localhost:4000/me                 | `dev-user` on the Free plan, with its limits                           |
| http://localhost:4000/simulations        | "Sample: Sara quits to freelance"                                      |
| http://localhost:4000/simulations/`<id>` | The full stored results (copy the id from the list)                    |

The browser counts as `dev-user` because the API runs in dev auth mode until Clerk keys are added.

## 5. Create and run a new simulation (one command)

```powershell
pnpm --filter @futuria/api smoke
```

The script runs through every endpoint, in order:

1. Health check
2. Your user (`/me`)
3. Create a draft simulation
4. Try to run it without a model (expects a 409)
5. Add Sara's model
6. Run the simulation
7. Print a results table, the biggest driver, and the best action
8. Check that another user can't see it (expects a 404)
9. List your simulations

Options:

- `--cleanup` deletes the new simulation at the end.
- `--user alice` acts as a different dev user.

It exits with an error if any response is unexpected. The privacy check creates a dev user called `bob` (or `carol`) in the database the first time it runs.

## 6. Optional: try the endpoints by hand

```powershell
$api = 'http://localhost:4000'
$sim = Invoke-RestMethod -Method Post "$api/simulations" -ContentType 'application/json' `
  -Body '{"decisionText":"What if I quit my job to freelance?"}'
$sim.status                                                        # draft
Invoke-RestMethod -Method Post "$api/simulations/$($sim.id)/run"   # error 409: no model yet (expected)
Invoke-RestMethod "$api/simulations" -Headers @{ 'x-dev-user' = 'bob' }   # bob sees nothing
Invoke-RestMethod -Method Delete "$api/simulations/$($sim.id)"     # remove it again
```

## 7. Look inside the database

1. Open **MongoDB Compass**.
2. Connect to `mongodb://127.0.0.1:27017`.
3. Open the `futuria` database:
   - `users`: one document per dev user, e.g. `dev:dev-user` on the `free` plan.
   - `simulations`: the sample, plus anything you created. Each stores `model`, `seed` and the full `analysis`.

## Troubleshooting

| Problem                                | Fix                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------ |
| "API offline" on the web page          | The API isn't running, or it can't reach MongoDB. Check the `pnpm dev` output. |
| MongoDB stopped                        | Run `Start-Service MongoDB` in a PowerShell window opened as Administrator.    |
| Port 3000 or 4000 already in use       | Stop the other process, or change `PORT` in `apps/api/.env`.                   |
| Sample simulation missing              | Run `pnpm --filter @futuria/api db:setup --seed`. It's safe to run again.      |
| `curl` errors in PowerShell            | Use `curl.exe`, `Invoke-RestMethod` or the browser.                            |
| Engine or shared changes not picked up | Under `pnpm dev` the watchers rebuild them. Otherwise run `pnpm build`.        |
