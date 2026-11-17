import { ArrowRight, Check, ClipboardCheck, MessageSquareText, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { PLANS, type PlanLimits, SARA_MODEL } from '@futuria/shared';
import { formatMoney, simulate } from '@futuria/engine';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { EXAMPLE_DECISIONS } from '@/lib/examples';
import { formatPercent } from '@/lib/format';

const STEPS = [
  {
    icon: MessageSquareText,
    title: 'Describe your decision',
    body: 'Type it in your own words. FUTURIA asks 5–7 short questions about your money and plans, with sensible defaults.',
  },
  {
    icon: ClipboardCheck,
    title: 'Check every assumption',
    body: 'See exactly what the simulation assumes, from your hourly rate to months until your first client. AI estimates are marked, and every number is editable.',
  },
  {
    icon: Sparkles,
    title: 'Explore 1,000 possible futures',
    body: 'Compare your paths: chance of running out of money, break-even month, what matters most, and the actions that lower your risk. Move a slider and every chart updates instantly.',
  },
];

/** Sara's three futures, computed by the engine when the page is built. */
function SaraPreview() {
  const result = simulate(SARA_MODEL, { seed: 20261116 });
  return (
    <Card className="p-0 sm:p-0">
      <div className="border-b border-border px-5 py-4 sm:px-6">
        <p className="text-sm font-semibold">Example: Sara, 29, UX designer</p>
        <p className="text-sm text-muted">
          $18,000 saved, spends about $3,100 a month. Should she go freelance?
        </p>
      </div>
      <p className="hidden border-b border-border px-6 py-2 text-xs text-muted sm:grid sm:grid-cols-[1fr_9rem_9rem]">
        <span>Path</span>
        <span className="text-right">Chance of running out</span>
        <span className="text-right">Median savings, month 12</span>
      </p>
      <ul className="divide-y divide-border">
        {result.paths.map((path) => (
          <li
            key={path.pathId}
            className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-5 py-3 sm:grid-cols-[1fr_9rem_9rem] sm:px-6"
          >
            <span className="font-medium">{path.name}</span>
            <span className="text-right text-sm tabular-nums sm:text-base">
              <span className="text-muted sm:hidden">Runs out: </span>
              {formatPercent(path.metrics.probRunOut)}
            </span>
            <span className="col-span-2 text-sm text-muted tabular-nums sm:col-span-1 sm:text-right sm:text-base sm:text-foreground">
              <span className="sm:hidden">Savings at month 12: </span>
              {formatMoney(path.metrics.cashAtHorizon.p50, result.currency)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

const FEATURE_LABELS: [keyof PlanLimits['features'], string][] = [
  ['storyRefresh', 'Story refresh after tweaks'],
  ['pdfExport', 'PDF export (soon)'],
  ['realityCheck', 'Monthly Reality Check (soon)'],
  ['askTheFuture', 'Ask the Future chat (soon)'],
  ['advancedVariables', 'Taxes, inflation and more variables (soon)'],
];

function PlanCard({ plan, highlight }: { plan: PlanLimits; highlight?: boolean }) {
  const quota =
    plan.simulationsPeriod === 'lifetime'
      ? `${plan.simulations} simulations to start`
      : `${plan.simulations} simulations a month`;
  return (
    <Card className={highlight ? 'border-accent ring-1 ring-accent' : undefined}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold">{plan.name}</h3>
      </div>
      <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">
        ${plan.priceUsdMonthly}
        <span className="text-base font-normal text-muted">/mo</span>
      </p>
      <ul className="mt-4 flex flex-col gap-2 text-sm">
        {[
          quota,
          `Up to ${plan.maxHorizonMonths}-month horizon`,
          `Up to ${plan.maxPaths} paths per decision`,
        ].map((line) => (
          <li key={line} className="flex gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            {line}
          </li>
        ))}
        {FEATURE_LABELS.filter(([key]) => plan.features[key]).map(([key, label]) => (
          <li key={key} className="flex gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            {label}
          </li>
        ))}
      </ul>
      <div className="mt-6">
        {plan.priceUsdMonthly === 0 ? (
          <Button asChild variant={highlight ? 'primary' : 'secondary'} className="w-full">
            <Link href="/new">Start free</Link>
          </Button>
        ) : (
          <Button variant="secondary" className="w-full" disabled>
            Coming soon
          </Button>
        )}
      </div>
    </Card>
  );
}

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-24 px-4 pt-14 pb-8 sm:px-6 sm:pt-20">
      <section className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
        <div className="flex flex-col gap-6">
          <p className="font-mono text-xs tracking-widest text-muted uppercase">
            Career decision simulator
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Explore the future before you live it.
          </h1>
          <p className="max-w-xl text-lg text-muted">
            Simulate a career move before you make it: 1,000 possible futures, your chance of
            running out of money, and what you can do about it.
          </p>
          <form action="/new" className="flex flex-col gap-3 sm:flex-row">
            <label htmlFor="hero-decision" className="sr-only">
              Your decision
            </label>
            <Input
              id="hero-decision"
              name="q"
              required
              minLength={5}
              maxLength={1000}
              placeholder="What if I quit my job to…"
              className="h-12 rounded-full px-5 sm:flex-1"
            />
            <Button type="submit" size="lg">
              Simulate my futures
              <ArrowRight />
            </Button>
          </form>
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted">Or try one of these:</p>
            <ul className="flex flex-wrap gap-2">
              {EXAMPLE_DECISIONS.map((example) => (
                <li key={example.text}>
                  <Link
                    href={{ pathname: '/new', query: { q: example.text } }}
                    className="inline-flex rounded-full border border-border bg-surface px-3 py-1.5 text-sm transition-colors hover:border-accent hover:text-accent"
                  >
                    {example.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <SaraPreview />
      </section>

      <section id="how-it-works" className="scroll-mt-20">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">How it works</h2>
        <p className="mt-2 max-w-2xl text-muted">
          Numbers come from math, the story comes from AI. A simulation engine computes every number
          from assumptions you can see and change; Claude only asks the questions and explains the
          results.
        </p>
        <ol className="mt-8 grid gap-4 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <li key={title}>
              <Card className="h-full">
                <div className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-full bg-accent/15 text-accent">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="font-mono text-xs text-muted">Step {i + 1}</span>
                </div>
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-muted">{body}</p>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <section id="pricing" className="scroll-mt-20">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Pricing</h2>
        <p className="mt-2 max-w-2xl text-muted">
          Start free. Moving sliders never costs anything: it runs on your device.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <PlanCard plan={PLANS.free} />
          <PlanCard plan={PLANS.pro} highlight />
          <PlanCard plan={PLANS.premium} />
        </div>
        <p className="mt-4 text-sm text-muted">
          Teams: a {PLANS.business.name} plan (${PLANS.business.priceUsdMonthly}/mo) with shared
          workspaces is planned.
        </p>
      </section>
    </main>
  );
}
