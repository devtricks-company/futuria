import { Calculator, Sparkles } from 'lucide-react';
import type { Metadata } from 'next';
import { PLANS, SARA_MODEL, SCENARIOS, decisionModelSchema, likelyValue } from '@futuria/shared';
import { analyze, formatMoney, futuresChart } from '@futuria/engine';
import { TrackView } from '@/components/analytics/track-view';
import { FeatureTiles, PrivacyNotes, rangeRows } from '@/components/landing/feature-tiles';
import {
  Examples,
  Faq,
  type FaqItem,
  HeroDecisionForm,
  HowItWorksSteps,
  Section,
  rise,
} from '@/components/landing/landing-blocks';
import { FuturesChart } from '@/components/landing/futures-chart';
import { LiveDemo } from '@/components/landing/live-demo';
import { Pricing } from '@/components/landing/pricing';
import { CountOnView } from '@/components/motion/count-up';
import { Marquee } from '@/components/motion/marquee';
import { Reveal } from '@/components/motion/reveal';
import { DISCLAIMER } from '@/components/site-footer';
import { DEMO_PATH_ID, DEMO_SEED } from '@/lib/demo';

/** Decisions people bring, for the scrolling strip under the hero. */
const DECISIONS_STRIP = [
  'Quit to freelance',
  'Start a business',
  'Go part-time',
  'Move for a raise',
  'Go back to school',
  'Take a sabbatical',
] as const;

/** Sara's sample decision, simulated and analyzed when the page is built. */
function sara() {
  const model = decisionModelSchema.parse(SARA_MODEL);
  const analysis = analyze(model, { seed: DEMO_SEED });
  const pathIndex = Math.max(
    0,
    model.paths.findIndex((p) => p.id === DEMO_PATH_ID),
  );
  const path = analysis.result.paths[pathIndex]!;
  const byPath = analysis.byPath[path.pathId]!;
  const runOut = (id: string) =>
    Math.round(
      (analysis.result.paths.find((p) => p.pathId === id)?.metrics.probRunOut ?? 0) *
        analysis.result.runs,
    );
  return {
    model,
    analysis,
    path,
    pathIndex,
    chart: futuresChart(model, analysis.result, { seed: DEMO_SEED }),
    runOut: { freelance: runOut('freelance'), hybrid: runOut('hybrid') },
    drivers: byPath.sensitivity.slice(0, 4),
    actions: byPath.interventions.slice(0, 3),
    ranges: rangeRows(model, path.pathId, [
      { field: 'hourlyRate', label: 'Hourly rate' },
      { field: 'monthsToFirstClient', label: 'Months to first client' },
      { field: 'baseline.monthlyExpenses', label: 'Living expenses' },
    ]),
  };
}

const LANDING_VIEW = { page: 'home' } as const;

export const metadata: Metadata = { alternates: { canonical: '/' } };

/** The numbers behind the product, counting up as they come into view. */
function Stats({ runs }: { runs: number }) {
  const stats = [
    { value: runs, label: 'futures simulated for every option' },
    { value: SCENARIOS.length, label: 'scenarios, from optimistic to pessimistic' },
    { value: PLANS.free.maxHorizonMonths, label: 'months ahead on the free plan' },
    { value: 0, label: 'figures made up by the AI' },
  ];
  return (
    <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-border bg-border lg:grid-cols-4">
      {stats.map((stat, i) => (
        <Reveal as="li" key={stat.label} delay={i * 100} className="bg-background p-6 sm:p-8">
          <CountOnView
            value={stat.value}
            className="text-gradient font-display text-5xl leading-none sm:text-6xl"
          />
          <p className="mt-3 max-w-[16rem] text-sm text-muted sm:text-base">{stat.label}</p>
        </Reveal>
      ))}
    </ul>
  );
}

const FAQ: FaqItem[] = [
  {
    q: 'Is this financial advice?',
    a: DISCLAIMER,
  },
  {
    q: 'Where do the numbers come from?',
    a: 'From a simulation engine, not from the AI. It plays out your plan 1,000 times per option with the ranges you confirmed, so the same inputs always give the same results. Claude only asks the questions, suggests starting estimates for you to check, and tells the story of each future using the engine’s numbers.',
  },
  {
    q: 'How long does it take?',
    a: 'About two minutes of your time: one sentence, a few short questions, a quick look at the assumptions. The simulation itself usually finishes in under a minute.',
  },
  {
    q: 'Can I change the assumptions afterwards?',
    a: 'Yes. On the results page, sliders re-run every future on your device as you drag, at no cost. You can also edit any assumption and run the whole simulation again.',
  },
  {
    q: 'What happens to what I type?',
    a: 'Your simulations are saved to your account, and only you can open them, unless you share a link. A shared page hides your amounts unless you choose to show them, and never shows what you typed. You never need to include names or anything that identifies you; describe the situation, not the people.',
  },
  {
    q: 'What does it cost?',
    a: `Nothing to start: the free plan includes ${PLANS.free.simulations} simulations with up to ${PLANS.free.maxPaths} options each, ${PLANS.free.maxHorizonMonths} months ahead. Moving sliders is always free.`,
  },
];

export default function Home() {
  const demo = sara();
  const { baseline } = demo.model;
  const currency = baseline.currency;
  const runs = demo.analysis.result.runs;
  const expenses = likelyValue(baseline.monthlyExpenses);
  const hybridRunOut =
    demo.runOut.hybrid === 0
      ? 'none do'
      : `${demo.runOut.hybrid} of ${runs.toLocaleString('en-US')} do`;

  return (
    <main className="flex w-full flex-col">
      <TrackView event="landing_viewed" properties={LANDING_VIEW} />
      {/* Hero: the promise, the input, then Sara's real futures as the picture. */}
      <section className="mx-auto w-full max-w-6xl px-4 pt-14 sm:px-6 sm:pt-20">
        <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
          <h1
            className="rise font-display text-[2.6rem] leading-[1.04] sm:text-6xl lg:text-[4.75rem]"
            style={rise(0)}
          >
            Play out a career move <span className="text-gradient">before you make it.</span>
          </h1>
          <p className="rise mt-6 max-w-2xl text-lg text-muted sm:text-xl" style={rise(150)}>
            Describe the decision in one sentence. FUTURIA simulates 1,000 versions of the next year
            for each option, then shows how often the money runs out and what lowers the risk.
          </p>
          <div className="rise mt-9 w-full max-w-2xl" style={rise(300)}>
            <HeroDecisionForm id="hero-decision" />
          </div>
          <Examples className="rise mt-5" style={rise(450)} />
        </div>

        <figure
          className="rise border-gradient mt-16 rounded-[2rem] p-5 pb-6 shadow-[0_40px_120px_-40px_rgb(11_207_119/0.35)] sm:mt-20 sm:p-8 sm:pb-8"
          style={rise(600)}
        >
          <FuturesChart data={demo.chart} currency={currency} />
          <figcaption className="mt-12 max-w-2xl text-muted sm:mt-14">
            <span className="font-semibold text-foreground">
              Sara, 29, is a UX designer with {formatMoney(baseline.startingCash, currency)} saved
              and costs of about {formatMoney(expenses, currency)} a month.
            </span>{' '}
            Each line above is one simulated year. If she quits to freelance now,{' '}
            {demo.runOut.freelance} of {runs.toLocaleString('en-US')} futures run out of money. If
            she freelances on the side first, {hybridRunOut}.
          </figcaption>
        </figure>
      </section>

      <Marquee items={DECISIONS_STRIP} className="mt-20 sm:mt-28" />

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-28 px-4 pt-20 sm:gap-36 sm:px-6 sm:pt-28">
        <Stats runs={runs} />

        <Section
          id="how-it-works"
          title="How it works"
          intro="Three steps, about two minutes. Nothing runs until you've seen every assumption."
        >
          <HowItWorksSteps />

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            {[
              {
                icon: Calculator,
                title: 'Numbers come from math.',
                body: 'A simulation engine computes every figure from assumptions you can see. The same inputs always give the same results, and moving a slider re-runs it on your device.',
              },
              {
                icon: Sparkles,
                title: 'The story comes from AI.',
                body: 'Claude asks the questions, suggests starting estimates for you to check, and describes what each future would be like using only the engine’s numbers. It never makes up a figure.',
              },
            ].map(({ icon: Icon, title, body }, i) => (
              <Reveal
                key={title}
                delay={i * 120}
                className="border-gradient rounded-3xl p-7 sm:p-8"
              >
                <Icon className="size-6 text-accent" aria-hidden />
                <h3 className="mt-5 font-display text-2xl sm:text-3xl">{title}</h3>
                <p className="mt-3 max-w-md text-muted">{body}</p>
              </Reveal>
            ))}
          </div>
        </Section>

        <Section
          id="demo"
          title="Change Sara's numbers"
          intro="This is the results screen you get, running live in your browser. Try a lower hourly rate, or fewer billable hours, and watch the risk move."
        >
          <div className="border-gradient overflow-hidden rounded-[2rem] shadow-[0_40px_120px_-40px_rgb(11_207_119/0.3)]">
            <LiveDemo
              model={demo.model}
              initial={demo.analysis.result}
              topDriver={demo.drivers[0]?.label}
            />
          </div>
        </Section>

        <Section
          id="features"
          title="What you see for every option"
          intro={
            <>
              Each preview is Sara&apos;s real result for &ldquo;{demo.path.name}&rdquo;, computed
              by the same engine you get.
            </>
          }
        >
          <FeatureTiles
            model={demo.model}
            path={demo.path}
            pathIndex={demo.pathIndex}
            drivers={demo.drivers}
            actions={demo.actions}
            timelineMonths={[3, 6, demo.model.horizonMonths]}
            ranges={demo.ranges}
          />
          <div className="mt-14 rounded-3xl border border-border bg-surface/60 p-6 sm:p-7">
            <h3 className="text-lg font-bold tracking-tight">Private by design</h3>
            <div className="mt-4">
              <PrivacyNotes />
            </div>
          </div>
        </Section>

        <Section
          id="pricing"
          title="Simple pricing"
          intro="Start free. Moving sliders never costs anything, because it runs on your device."
        >
          <Pricing />
          <p className="mt-8 text-center text-sm text-muted">
            A {PLANS.business.name} plan for teams (${PLANS.business.priceUsdMonthly} a month) with
            shared workspaces is planned.
          </p>
        </Section>

        <Section id="faq" title="Questions, answered">
          <Faq items={FAQ} />
        </Section>

        <Reveal
          as="section"
          aria-labelledby="start-title"
          className="border-gradient relative overflow-hidden rounded-[2rem] px-5 py-14 text-center sm:px-10 sm:py-20"
        >
          <div aria-hidden className="bg-glow pointer-events-none absolute inset-0 opacity-90" />
          <div className="relative mx-auto max-w-2xl">
            <h2 id="start-title" className="font-display text-4xl leading-[1.08] sm:text-5xl">
              What are you deciding?
            </h2>
            <p className="mt-4 text-muted sm:text-lg">
              Write it the way you would say it to a friend. You can check every assumption before
              anything runs.
            </p>
            <HeroDecisionForm id="closing-decision" className="mt-9" />
          </div>
        </Reveal>
      </div>
    </main>
  );
}
