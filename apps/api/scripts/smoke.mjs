/*
 * FUTURIA API smoke test: walks through every Phase 2 endpoint against a running API.
 *
 *   pnpm --filter @futuria/api smoke               # keeps the new simulation
 *   pnpm --filter @futuria/api smoke --cleanup     # deletes it afterwards
 *   pnpm --filter @futuria/api smoke --user alice  # act as another dev user
 *
 * Needs the API running (`pnpm dev`) in dev auth mode. Set API_URL to target another address.
 * Exits with code 1 on any unexpected response.
 */
import { SARA_MODEL } from '@futuria/shared';

const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};

const API = (process.env.API_URL ?? 'http://localhost:4000').replace(/\/+$/, '');
const USER = option('user', 'dev-user');
const OTHER_USER = USER === 'bob' ? 'carol' : 'bob';
const CLEANUP = hasFlag('cleanup');

let step = 0;
const log = (message) => console.log(`${String(++step).padStart(2)}. ${message}`);
const fail = (message) => {
  console.error(`\nFAILED: ${message}`);
  process.exit(1);
};

async function call(method, path, { body, user = USER, expect = 200 } = {}) {
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers: {
        'x-dev-user': user,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    fail(
      `Cannot reach the API at ${API} (${error.cause?.code ?? error.message}). Start it first: pnpm dev`,
    );
  }
  const text = await res.text();
  if (res.status !== expect) {
    fail(`${method} ${path}: expected HTTP ${expect}, got ${res.status}\n${text.slice(0, 600)}`);
  }
  return text ? JSON.parse(text) : null;
}

console.log(`FUTURIA API smoke test: ${API} as "${USER}"\n`);

const health = await call('GET', '/health');
if (health.database !== 'up')
  fail(`Database is ${health.database}. Is the MongoDB service running?`);
log(`GET /health -> ok (engine v${health.engineVersion}, database ${health.database})`);

const me = await call('GET', '/me');
log(
  `GET /me -> ${me.limits.name} plan: up to ${me.limits.maxHorizonMonths} months, ${me.limits.maxPaths} paths`,
);

const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
const draft = await call('POST', '/simulations', {
  body: {
    decisionText: 'What if I quit my job to become a freelance UX designer?',
    title: `Smoke test ${stamp}`,
  },
  expect: 201,
});
log(`POST /simulations -> created ${draft.id} (status: ${draft.status})`);

const early = await call('POST', `/simulations/${draft.id}/run`, { expect: 409 });
log(`POST /simulations/:id/run before a model -> 409 ${early.code} (expected)`);

const modeled = await call('PATCH', `/simulations/${draft.id}/model`, {
  body: { model: SARA_MODEL },
});
log(`PATCH /simulations/:id/model -> ${modeled.status}, ${modeled.model.paths.length} paths`);

const started = performance.now();
const ready = await call('POST', `/simulations/${draft.id}/run`);
if (ready.status !== 'ready' || !ready.analysis) fail(`Run finished with status ${ready.status}`);
log(
  `POST /simulations/:id/run -> ${ready.status} in ${Math.round(performance.now() - started)} ms (seed ${ready.seed})`,
);

const { result, byPath } = ready.analysis;
const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: result.currency,
  maximumFractionDigits: 0,
});
const pct = (value) => `${Math.round(value * 100)}%`;
const H = result.horizonMonths;
const columns = [
  ['Path', 38],
  ['Run out', 9],
  [`Savings @${H} (median)`, 22],
  [`Range (P10-P90)`, 24],
  ['Break-even', 10],
];
const row = (cells) => cells.map((cell, i) => String(cell).padEnd(columns[i][1])).join('');

console.log(`\n${result.runs.toLocaleString('en-US')} simulated futures per path, ${H} months:\n`);
console.log(row(columns.map(([title]) => title)));
console.log('-'.repeat(columns.reduce((sum, [, width]) => sum + width, 0)));
for (const path of result.paths) {
  const m = path.metrics;
  console.log(
    row([
      path.name,
      pct(m.probRunOut),
      money.format(m.cashAtHorizon.p50),
      `${money.format(m.cashAtHorizon.p10)} to ${money.format(m.cashAtHorizon.p90)}`,
      m.medianBreakEvenMonth === null ? 'never' : `month ${m.medianBreakEvenMonth}`,
    ]),
  );
}

const riskiest = result.paths.reduce((a, b) =>
  b.metrics.probRunOut > a.metrics.probRunOut ? b : a,
);
const bestAction = byPath[riskiest.pathId]?.interventions[0];
const topDriver = byPath[riskiest.pathId]?.sensitivity[0];
if (topDriver) {
  console.log(
    `\nBiggest driver for "${riskiest.name}": ${topDriver.label} (${pct(topDriver.share)} of the outcome)`,
  );
}
if (bestAction) {
  console.log(
    `Best action: ${bestAction.label} (risk ${pct(bestAction.before.probRunOut)} -> ${pct(bestAction.after.probRunOut)})\n`,
  );
}

await call('GET', `/simulations/${draft.id}`, { user: OTHER_USER, expect: 404 });
log(`GET /simulations/:id as "${OTHER_USER}" -> 404 (private to its owner, expected)`);

const list = await call('GET', '/simulations');
if (!list.some((s) => s.id === draft.id)) fail('New simulation missing from GET /simulations');
log(`GET /simulations -> ${list.length} simulation(s) for "${USER}"`);

if (CLEANUP) {
  await call('DELETE', `/simulations/${draft.id}`, { expect: 204 });
  log('DELETE /simulations/:id -> 204 (removed)');
} else {
  console.log(`\nKept the simulation. Open it in a browser: ${API}/simulations/${draft.id}`);
}

console.log('\nAll checks passed.');
