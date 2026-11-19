/*
 * FUTURIA API smoke test: walks Sara's journey through every simulation endpoint against a
 * running API: intake -> answers -> model -> edit -> run (queued) -> poll -> results + story.
 *
 *   pnpm --filter @futuria/api smoke               # keeps the new simulation
 *   pnpm --filter @futuria/api smoke --cleanup     # deletes it afterwards
 *   pnpm --filter @futuria/api smoke --renarrate   # also checks the story refresh gate
 *   pnpm --filter @futuria/api smoke --user alice  # act as a given dev user
 *
 * Each run acts as a new dev user ("smoke-<time>") on the Free plan, which allows 3 simulations
 * in total, so repeated runs never hit the quota. Story refresh is a paid feature: on Free,
 * --renarrate expects the 403 plan_feature gate; for a user on Pro it refreshes the story.
 *
 * Needs the API running (`pnpm dev`) in dev auth mode. With AI_MODE=anthropic this makes real
 * Claude calls (one full simulation, about $0.35-0.45). Set API_URL to target another address.
 * Exits with code 1 on any unexpected response.
 */
const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};

const API = (process.env.API_URL ?? 'http://localhost:4000').replace(/\/+$/, '');
const USER = option('user', `smoke-${Date.now().toString(36)}`);
const OTHER_USER = USER === 'bob' ? 'carol' : 'bob';
const CLEANUP = hasFlag('cleanup');
const DECISION = 'What if I quit my job to become a freelance UX designer?';
const RUN_TIMEOUT_MS = 6 * 60_000;

let step = 0;
const log = (message) => console.log(`${String(++step).padStart(2)}. ${message}`);
const fail = (message) => {
  console.error(`\nFAILED: ${message}`);
  process.exit(1);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function call(method, path, { body, user = USER, expect = 200, timeout = 30_000 } = {}) {
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers: {
        'x-dev-user': user,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeout),
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

const seconds = (since) => `${((performance.now() - since) / 1000).toFixed(1)} s`;
// Claude calls can take a minute; give AI endpoints room.
const AI_TIMEOUT = 4 * 60_000;

console.log(`FUTURIA API smoke test: ${API} as "${USER}"\n`);

const health = await call('GET', '/health');
if (health.database !== 'up')
  fail(`Database is ${health.database}. Is the MongoDB service running?`);
log(
  `GET /health -> ok (engine v${health.engineVersion}, database ${health.database}, ` +
    `AI ${health.ai}, pipeline ${health.pipeline})`,
);
if (health.ai === 'anthropic') console.log('    Real Claude calls: this run costs money.');

const me = await call('GET', '/me');
log(
  `GET /me -> ${me.limits.name} plan: up to ${me.limits.maxHorizonMonths} months, ${me.limits.maxPaths} paths`,
);

// A simulation without a model can't run.
const bare = await call('POST', '/simulations', { body: { decisionText: DECISION }, expect: 201 });
const early = await call('POST', `/simulations/${bare.id}/run`, { expect: 409 });
await call('DELETE', `/simulations/${bare.id}`, { expect: 204 });
log(`POST /simulations + /run without a model -> 409 ${early.code} (expected), removed`);

// 1. Intake
let t = performance.now();
const draft = await call('POST', '/simulations/intake', {
  body: { decisionText: DECISION },
  expect: 201,
  timeout: AI_TIMEOUT,
});
const intake = draft.intake;
if (intake.routing !== 'ok') fail(`Intake routed to ${intake.routing}`);
log(
  `POST /simulations/intake -> ${draft.status} in ${seconds(t)}: "${draft.title}", ` +
    `${intake.result.questions.length} questions, paths: ${intake.result.proposedPaths.map((p) => p.name).join(' | ')}`,
);
for (const q of intake.result.questions) {
  console.log(`      - ${q.prompt} [default: ${q.defaultValue ?? 'none'}]`);
}

// 2. Answers: accept the defaults, as someone clicking through would.
const answers = Object.fromEntries(
  intake.result.questions.filter((q) => q.defaultValue !== null).map((q) => [q.id, q.defaultValue]),
);
const answered = await call('PATCH', `/simulations/${draft.id}/answers`, { body: { answers } });
log(
  `PATCH /simulations/:id/answers -> ${answered.status} (${Object.keys(answers).length} answers)`,
);

// 3. Model
t = performance.now();
const modeled = await call('POST', `/simulations/${draft.id}/model`, { timeout: AI_TIMEOUT });
const estimates = modeled.model.assumptions.filter((a) => a.source === 'ai_estimate');
log(
  `POST /simulations/:id/model -> ${modeled.status} in ${seconds(t)}: ${modeled.model.paths.length} paths, ` +
    `${modeled.model.assumptions.length} assumptions (${estimates.length} AI estimates)`,
);
for (const a of estimates.slice(0, 4)) console.log(`      - ${a.label}: ${a.rationale}`);

// 4. Edit the model (assumptions review): a round trip through PATCH.
const edited = await call('PATCH', `/simulations/${draft.id}/model`, {
  body: { model: modeled.model },
});
log(`PATCH /simulations/:id/model -> ${edited.status}`);

// 5. Run: queued, then poll like the web app does.
t = performance.now();
const queued = await call('POST', `/simulations/${draft.id}/run`, { expect: 202 });
log(`POST /simulations/:id/run -> 202 ${queued.status}`);

async function waitForRun() {
  const started = performance.now();
  let last = '';
  for (;;) {
    const sim = await call('GET', `/simulations/${draft.id}`);
    if (sim.status !== last) {
      console.log(`      ${seconds(started).padStart(7)}  ${sim.status}`);
      last = sim.status;
    }
    if (sim.status === 'ready') return sim;
    if (sim.status === 'failed') fail(`Run failed: ${sim.error}`);
    if (performance.now() - started > RUN_TIMEOUT_MS) {
      fail(
        `Still "${sim.status}" after ${RUN_TIMEOUT_MS / 60000} min. With PIPELINE_MODE=inngest, is the Inngest Dev Server running?`,
      );
    }
    await sleep(sim.status === 'queued' ? 1000 : 500);
  }
}
const ready = await waitForRun();
log(
  `GET /simulations/:id -> ready in ${seconds(t)}${ready.error ? ` (note: ${ready.error})` : ''}`,
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
      path.name.slice(0, 36),
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
const topDriver = byPath[riskiest.pathId]?.sensitivity[0];
if (topDriver) {
  console.log(
    `\nBiggest driver for "${riskiest.name}": ${topDriver.label} (${pct(topDriver.share)} of the outcome)`,
  );
}
const story = ready.narrative?.[riskiest.pathId];
if (story) {
  console.log(`\nTime Machine, "${riskiest.name}", realistic future:`);
  for (const m of story.scenarios.realistic)
    console.log(`  Month ${String(m.month).padStart(2)}: ${m.headline}`);
  const action = story.actionPlan[0];
  if (action) console.log(`Top action: ${action.title}. ${action.why}\n`);
} else {
  fail(`No narrative for "${riskiest.name}"`);
}

if (hasFlag('renarrate')) {
  const me = await call('GET', '/me');
  if (me.limits.features.storyRefresh) {
    t = performance.now();
    await call('POST', `/simulations/${draft.id}/renarrate`, { expect: 202 });
    await waitForRun();
    log(`POST /simulations/:id/renarrate -> ready again in ${seconds(t)}`);
  } else {
    const gate = await call('POST', `/simulations/${draft.id}/renarrate`, { expect: 403 });
    if (gate.code !== 'plan_feature') fail(`renarrate on ${me.plan}: expected plan_feature`);
    log(
      `POST /simulations/:id/renarrate on ${me.plan} -> 403 plan_feature (paid feature, expected)`,
    );
  }
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
  console.log(`\nKept the simulation: ${API}/simulations/${draft.id}`);
}

console.log('\nAll checks passed.');
