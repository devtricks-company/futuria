import { Suspense } from 'react';
import { SARA_MODEL } from '@futuria/shared';
import { formatMoney, simulate } from '@futuria/engine';
import { fetchHealth } from '@/lib/api';

async function ApiStatus() {
  const health = await fetchHealth();
  if (!health) {
    return (
      <p className="text-sm">
        <span className="mr-2 inline-block size-2 rounded-full bg-red-500" />
        API offline. Start it with <code className="font-mono">pnpm --filter @futuria/api dev</code>
        .
      </p>
    );
  }
  return (
    <p className="text-sm">
      <span className="mr-2 inline-block size-2 rounded-full bg-emerald-500" />
      API {health.status}, engine v{health.engineVersion}
    </p>
  );
}

/** Phase 0 smoke test: runs the shared engine during rendering, no AI involved. */
function EngineSmokeTest() {
  const result = simulate(SARA_MODEL, { seed: 20261116, runs: 500 });
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-muted">
          <tr>
            <th className="py-2 pr-4 font-medium">Path</th>
            <th className="py-2 pr-4 font-medium">Chance of running out</th>
            <th className="py-2 font-medium">Median savings at month 12</th>
          </tr>
        </thead>
        <tbody>
          {result.paths.map((path) => (
            <tr key={path.pathId} className="border-t border-border">
              <td className="py-2 pr-4">{path.name}</td>
              <td className="py-2 pr-4 tabular-nums">{pct(path.metrics.probRunOut)}</td>
              <td className="py-2 tabular-nums">
                {formatMoney(path.metrics.cashAtHorizon.p50, result.currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-4 py-16 sm:px-6">
      <header className="flex flex-col gap-3">
        <p className="font-mono text-xs tracking-widest text-muted uppercase">Futuria</p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Explore the future before you live it.
        </h1>
        <p className="max-w-xl text-lg text-muted">
          Simulate a career decision before you make it: thousands of possible futures, the chance
          of running out of money, and what you can do about it.
        </p>
      </header>

      <section className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="mb-1 text-base font-semibold">Engine check: Sara&apos;s three futures</h2>
        <p className="mb-4 text-sm text-muted">
          500 simulated futures per path, computed by{' '}
          <code className="font-mono">@futuria/engine</code>.
        </p>
        <EngineSmokeTest />
      </section>

      <section className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="mb-3 text-base font-semibold">System status</h2>
        <Suspense fallback={<p className="text-sm text-muted">Checking the API…</p>}>
          <ApiStatus />
        </Suspense>
      </section>
    </main>
  );
}
