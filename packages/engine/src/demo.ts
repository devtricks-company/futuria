/* Run with: pnpm --filter @futuria/engine demo */
import { SARA_MODEL } from '@futuria/shared';
import { analyze } from './analyze';
import { formatMoney } from './model-utils';
import { parseModel, simulate } from './simulate';

const SEED = 20261116;
const pct = (v: number) => `${Math.round(v * 100)}%`;
const money = (v: number) => formatMoney(v, 'USD');
const pad = (s: string, n: number) => s.padEnd(n);

const model = parseModel(SARA_MODEL);

// Warm up the JIT, then time the core simulation (what sliders trigger in the browser).
simulate(model, { seed: SEED, runs: 200 });
let t0 = performance.now();
const quick = simulate(model, { seed: SEED, runs: 1000 });
const simulateMs = performance.now() - t0;

// The same model at a 24-month horizon (Pro plan) for the performance budget.
const model24 = parseModel({ ...SARA_MODEL, horizonMonths: 24 });
t0 = performance.now();
simulate(model24, { seed: SEED, runs: 1000 });
const simulate24Ms = performance.now() - t0;

t0 = performance.now();
const full = analyze(model, { seed: SEED });
const analyzeMs = performance.now() - t0;

console.log('\nFUTURIA engine demo: Sara, "What if I quit my job to freelance?"');
console.log(
  `Savings ${money(18000)} | take-home ${money(5200)}/mo | expenses ~${money(3100)}/mo | horizon 12 months\n`,
);

console.log(
  pad('Path', 38) +
    pad('Run out', 9) +
    pad('Cash @12 (P10 / P50 / P90)', 34) +
    pad('Break-even', 11) +
    'Income @12 (P50)',
);
console.log('-'.repeat(110));
for (const p of quick.paths) {
  const m = p.metrics;
  console.log(
    pad(p.name, 38) +
      pad(pct(m.probRunOut), 9) +
      pad(
        `${money(m.cashAtHorizon.p10)} / ${money(m.cashAtHorizon.p50)} / ${money(m.cashAtHorizon.p90)}`,
        34,
      ) +
      pad(m.medianBreakEvenMonth === null ? 'never' : `month ${m.medianBreakEvenMonth}`, 11) +
      money(m.incomeAtHorizon.p50),
  );
}

const freelance = full.result.paths.find((p) => p.pathId === 'freelance')!;
const analysis = full.byPath.freelance!;

console.log('\nFreelance path, realistic scenario (representative future):');
const realistic = freelance.scenarios.realistic;
let previous = 0;
for (const month of [1, 3, 6, 9, 12]) {
  const events = realistic.events.filter((e) => e.month > previous && e.month <= month);
  previous = month;
  console.log(
    `  Month ${String(month).padStart(2)}: cash ${pad(money(realistic.cash[month]!), 10)} income ${pad(money(realistic.income[month]!), 9)}` +
      (events.length ? ` events: ${events.map((e) => `${e.type}@${e.month}`).join(', ')}` : ''),
  );
}

console.log('\nWhat matters most (freelance):');
for (const item of analysis.sensitivity.slice(0, 4)) {
  console.log(
    `  ${pad(item.label, 30)} ${pad(pct(item.share), 5)} median cash ${money(item.low.medianCashAtHorizon)} -> ${money(item.high.medianCashAtHorizon)}  (input ${item.low.input} -> ${item.high.input})`,
  );
}

console.log('\nAction plan (freelance):');
for (const action of analysis.interventions) {
  console.log(
    `  ${pad(action.label, 44)} risk ${pct(action.before.probRunOut)} -> ${pct(action.after.probRunOut)}, median cash ${money(action.before.medianCashAtHorizon)} -> ${money(action.after.medianCashAtHorizon)}`,
  );
}

console.log('\nTiming');
console.log(`  simulate, 3 paths x 1,000 runs x 12 months: ${simulateMs.toFixed(1)} ms`);
console.log(
  `  simulate, 3 paths x 1,000 runs x 24 months: ${simulate24Ms.toFixed(1)} ms (budget: 50 ms)`,
);
console.log(
  `  full analysis (simulation + sensitivity + interventions): ${analyzeMs.toFixed(1)} ms\n`,
);
