# Deploying FUTURIA (staging)

The staging site behaves like the live one: `NODE_ENV=production`, real Claude, Inngest Cloud,
Clerk and Stripe. It uses test keys (Clerk development instance, Stripe test mode) and free hosting.

| Part        | Where                                                              | Cost                                                |
| ----------- | ------------------------------------------------------------------ | --------------------------------------------------- |
| Web app     | Vercel (Hobby), project `futuria-staging`                          | $0                                                  |
| API         | Azure Container Apps (Consumption), app `futuria-api-staging`      | $0 within the monthly free allowance                |
| API image   | GitHub container registry, `ghcr.io/devtricks-company/futuria-api` | $0 (public, like the repo)                          |
| Database    | MongoDB Atlas, database `futuria_staging` on the existing cluster  | $0 (existing cluster)                               |
| Run queue   | Inngest Cloud (free tier)                                          | $0                                                  |
| Auth, money | Clerk development instance, Stripe test mode                       | $0                                                  |
| Claude      | Anthropic API (or your gateway)                                    | about $0.40 per run, $0.13 per intake + model build |

Azure Container Apps gives each subscription a monthly free allowance: 180,000 vCPU-seconds,
360,000 GiB-seconds and 2 million requests. At 0.5 vCPU and 1 GiB that is about 100 active hours
a month. The API scales to zero when idle, so idle time costs nothing.

Why production mode needs all of this: the API refuses its development shortcuts when
`NODE_ENV=production` (`apps/api/src/config/env.ts`). It refuses dev auth, fixture AI, the inline
pipeline and disabled billing.

**Commands below are for PowerShell.** In Git Bash, prefix `az` commands that take a `/subscriptions/...`
path with `MSYS_NO_PATHCONV=1`.

## Names

| Thing              | Value                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Azure region       | closest to the Atlas cluster: `germanywestcentral` (Frankfurt), `westeurope` or `eastus`                                  |
| Resource group     | `futuria-staging`                                                                                                         |
| Container Apps env | `futuria-staging-env`                                                                                                     |
| Container App      | `futuria-api-staging`, at `https://futuria-api-staging.<random>.<region>.azurecontainerapps.io` (the "API address" below) |
| Web address        | `https://futuria-staging.vercel.app`                                                                                      |
| Database           | `futuria_staging` (local development uses `futuria`)                                                                      |

## One-time setup

### 1. Accounts

- An Azure subscription, signed in with `az login`. Pay-as-you-go is fine: the free allowance applies
  to every subscription.
- A Vercel account (sign in with GitHub) and an Inngest account.

### 2. Azure base resources

```powershell
az provider register -n Microsoft.App --wait
az provider register -n Microsoft.OperationalInsights --wait
az extension add --name containerapp --upgrade
az group create -n futuria-staging -l germanywestcentral
az containerapp env create -n futuria-staging-env -g futuria-staging -l germanywestcentral
```

The environment also creates a Log Analytics workspace for the logs.

### 3. Let GitHub Actions deploy to Azure (no stored password)

GitHub signs in to Azure with OIDC. Azure trusts tokens for this repo's `main` branch only.

```powershell
$sub = az account show --query id -o tsv
$tenant = az account show --query tenantId -o tsv
$appId = az ad app create --display-name futuria-github-deploy --query appId -o tsv
az ad sp create --id $appId
az ad app federated-credential create --id $appId --parameters federated-credential.json
az role assignment create --assignee $appId --role Contributor `
  --scope "/subscriptions/$sub/resourceGroups/futuria-staging"
```

`federated-credential.json` (anywhere outside the repo):

```json
{
  "name": "github-main",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:devtricks-company/futuria:ref:refs/heads/main",
  "audiences": ["api://AzureADTokenExchange"]
}
```

Then, in GitHub, go to repo **Settings → Secrets and variables → Actions → Variables**. None of
these are secrets. Add:

| Variable                | Value                 |
| ----------------------- | --------------------- |
| `AZURE_CLIENT_ID`       | `$appId`              |
| `AZURE_TENANT_ID`       | `$tenant`             |
| `AZURE_SUBSCRIPTION_ID` | `$sub`                |
| `AZURE_RESOURCE_GROUP`  | `futuria-staging`     |
| `AZURE_CONTAINER_APP`   | `futuria-api-staging` |

### 4. First image

Merge to `main`. The workflow `.github/workflows/deploy-api-staging.yml` builds `apps/api/Dockerfile`
and publishes `ghcr.io/devtricks-company/futuria-api` with two tags, `:<commit>` and `:staging`. The
Container App doesn't exist yet, so the workflow skips the rollout.

Then make the image public, once: go to **github.com/orgs/devtricks-company/packages →
futuria-api → Package settings → Change visibility → Public**. If that option is greyed out, allow
public packages under the organization settings, in **Packages**. The image holds only built code
from this public repo. `.dockerignore` keeps every `.env` file out of it.

### 5. Create the Container App

```powershell
az containerapp create -n futuria-api-staging -g futuria-staging --environment futuria-staging-env `
  --image ghcr.io/devtricks-company/futuria-api:staging `
  --ingress external --target-port 4000 `
  --cpu 0.5 --memory 1.0Gi --min-replicas 0 --max-replicas 1 `
  --env-vars NODE_ENV=production PORT=4000 NODE_OPTIONS=--max-old-space-size=768 `
    WEB_ORIGIN=https://futuria-staging.vercel.app
az containerapp show -n futuria-api-staging -g futuria-staging `
  --query properties.configuration.ingress.fqdn -o tsv
```

The second command prints the API address. This first revision **fails to start**, because the
production checks refuse it until the secrets in step 7 exist. That's expected.

`WEB_ORIGIN` must be exactly the web address. The API checks Clerk tokens against it, and Stripe
Checkout returns there.

### 6. Atlas, Inngest, Stripe

**MongoDB Atlas**

- **Database Access:** add a user `futuria-staging` with the `readWrite@futuria_staging` role.
  Use a letters-and-digits password, so it needs no URL encoding or shell escaping.
- **Network Access:** add `0.0.0.0/0`. Container Apps on Consumption has no fixed outbound IP. The
  dedicated user and password are the protection.
- **Connection string:**
  `mongodb+srv://futuria-staging:<password>@<cluster-host>/futuria_staging`. Leave out
  `?retryWrites=true&w=majority`: the driver uses those by default, and the `&` breaks `az` on
  Windows.
- **Indexes:** production doesn't build indexes on its own. Create them once from your own
  terminal. A process env var beats `apps/api/.env`, and `--seed` isn't needed:

  ```powershell
  $env:MONGODB_URI='<staging connection string>'; pnpm --filter @futuria/api db:setup; Remove-Item Env:MONGODB_URI
  ```

  It prints each collection in `futuria_staging` with its indexes. These include the TTL on
  anonymous users and the unique share slug. Run it again after schema changes.

**Inngest Cloud.** Use the Production environment. Copy an **Event Key** (Manage → Event Keys) and
the **Signing Key** (Manage → Signing Key).

**Stripe (test mode).** The products and prices already exist (`stripe:setup`).

- Go to **Developers → Webhooks → Add endpoint**, at `https://<API address>/billing/webhook`.
- Pick exactly the events in `apps/api/src/billing/webhook-events.ts`:
  - `checkout.session.completed`
  - `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
  - `customer.subscription.paused`, `customer.subscription.resumed`
  - `invoice.paid`
- Copy the endpoint's signing secret (`whsec_...`). It is not the `stripe:listen` one.

### 7. Secrets

In the Azure Portal, go to **Container App futuria-api-staging → Settings → Secrets → Add**.
Use these names:

| Secret                  | Value                                          |
| ----------------------- | ---------------------------------------------- |
| `mongodb-uri`           | the staging connection string                  |
| `clerk-secret-key`      | Clerk `sk_test_...` (same as `apps/api/.env`)  |
| `anthropic-api-key`     | Claude key (same as `apps/api/.env`)           |
| `inngest-event-key`     | Inngest Event Key                              |
| `inngest-signing-key`   | Inngest Signing Key                            |
| `stripe-secret-key`     | Stripe `sk_test_...` (same as `apps/api/.env`) |
| `stripe-webhook-secret` | the endpoint's `whsec_...`                     |

With a gateway, use `anthropic-auth-token` and `anthropic-base-url` instead of `anthropic-api-key`.

Then point the env vars at the secrets. This creates a new revision:

```powershell
az containerapp update -n futuria-api-staging -g futuria-staging --set-env-vars `
  MONGODB_URI=secretref:mongodb-uri CLERK_SECRET_KEY=secretref:clerk-secret-key `
  ANTHROPIC_API_KEY=secretref:anthropic-api-key `
  INNGEST_EVENT_KEY=secretref:inngest-event-key INNGEST_SIGNING_KEY=secretref:inngest-signing-key `
  STRIPE_SECRET_KEY=secretref:stripe-secret-key STRIPE_WEBHOOK_SECRET=secretref:stripe-webhook-secret `
  INNGEST_SERVE_ORIGIN=https://<API address>
```

With a gateway, replace `ANTHROPIC_API_KEY=...` with
`ANTHROPIC_AUTH_TOKEN=secretref:anthropic-auth-token ANTHROPIC_BASE_URL=secretref:anthropic-base-url`.
Add any `AI_REFUSAL_FALLBACK` or `AI_PROMPT_CACHE` switches you use locally as plain values.

Check `https://<API address>/health`. It should say `"database":"up"`, `"ai":"anthropic"`,
`"pipeline":"inngest"` and `"billing":"stripe"`. Logs:
`az containerapp logs show -n futuria-api-staging -g futuria-staging --follow`. A bad or missing
variable shows up there by name.

### 8. Sync Inngest

In the Inngest dashboard, go to **Apps → Sync new app** and enter `https://<API address>/api/inngest`.
The app `futuria-api` should list the `simulation-run` function.

### 9. Vercel (web app)

**Add New → Project → import `devtricks-company/futuria`:**

- **Project name:** `futuria-staging`
- **Root Directory:** `apps/web` (framework: Next.js)
- **Build Command (override):** `pnpm --filter "@futuria/web..." build`. This builds
  `@futuria/shared` and `@futuria/engine` first, and avoids Turborepo's strict env filtering.

**Settings:**

- **Node.js version:** 24.x.
- **Functions:** set the region near the API (`fra1` for Frankfurt or West Europe, `iad1` for
  East US). Keep **Fluid Compute** on, the default for new projects. A model build with real Claude
  takes about 35 s, and the proxy waits for it.

**Environment variables (Production):**

| Variable                            | Value                                   |
| ----------------------------------- | --------------------------------------- |
| `ENABLE_EXPERIMENTAL_COREPACK`      | `1` (use pnpm 11 from `packageManager`) |
| `API_URL`                           | `https://<API address>`                 |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk `pk_test_...`                     |
| `CLERK_SECRET_KEY`                  | Clerk `sk_test_...`                     |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL`     | `/sign-in`                              |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL`     | `/sign-up`                              |
| `NEXT_PUBLIC_SITE_URL`              | `https://futuria-staging.vercel.app`    |

`NEXT_PUBLIC_*` values are read at build time, so redeploy after changing one. Leave PostHog unset,
or use a separate staging project, so test traffic stays out of the real funnel.

Open the site only at `https://futuria-staging.vercel.app`. Per-deployment URLs
(`futuria-staging-<hash>.vercel.app`) fail the API's Clerk origin check.

### 10. Budget alert

In the Azure Portal, go to **Cost Management → Budgets → Add**. Set $5 a month, with email alerts at
50% and 100%.

## Redeploys

- **Code:** a push to `main` redeploys both parts. Vercel rebuilds the web app. GitHub Actions
  builds the image and rolls it out as a new Container App revision, but only for changes under
  `apps/api`, `packages` or the lockfile. Run it by hand under **Actions → Deploy API (staging) →
  Run workflow**.
- **A secret's value:** change it in the Portal, then restart the active revision under
  **Revisions and replicas → Restart**.
- **Inngest functions changed:** sync again (step 8).
- **Schema or indexes changed:** run `db:setup` again (step 6).

## Things to know

- **Cold start.** After about 5 minutes without requests, the API scales to zero. The next request
  waits while a container starts, from seconds to tens of seconds. Inngest and Stripe retry, so runs
  and webhooks still land. `--min-replicas 1` keeps it warm for a few dollars a month.
- **Link previews.** The Clerk development instance answers cookieless bots with a handshake
  redirect, so share cards don't render in link debuggers on staging. Production Clerk keys fix it.
  To check cards, use `pnpm --filter @futuria/web share:preview` (docs/TESTING.md).
- **AI spend before sign-up.** Anonymous visitors can run intake and model building with real
  Claude. Keep the staging URL private and set a spend limit in the Anthropic console. Rate limits
  come in Phase 7.
- **Shared test accounts.** Staging uses the same Clerk development instance and Stripe test
  account as local development. Its data stays separate because the database is `futuria_staging`.

## Troubleshooting

| Symptom                                            | Likely cause                                                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Revision keeps restarting                          | A missing or invalid env var. `az containerapp logs show ... --follow` names it.                                    |
| `/health` says `"database":"down"`                 | Wrong `mongodb-uri`, the user lacks `readWrite@futuria_staging`, or Atlas Network Access lacks `0.0.0.0/0`.         |
| Signed in on the web app, but API calls return 401 | `WEB_ORIGIN` isn't exactly `https://futuria-staging.vercel.app`, or the Clerk keys differ between Vercel and Azure. |
| Runs stay "queued"                                 | Inngest isn't synced, the keys belong to a different Inngest environment, or `INNGEST_SERVE_ORIGIN` is wrong.       |
| Stripe webhook deliveries fail with 400            | `stripe-webhook-secret` is the `stripe:listen` secret instead of the endpoint's.                                    |
| Image pull fails on create                         | The `futuria-api` package is still private (step 4).                                                                |
