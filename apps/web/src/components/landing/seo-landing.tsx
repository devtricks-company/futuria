import { ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { type PathResult, decisionModelSchema } from '@futuria/shared';
import { formatMoney, futuresChart, simulate } from '@futuria/engine';
import { TrackView } from '@/components/analytics/track-view';
import { FuturesChart } from '@/components/landing/futures-chart';
import {
  Faq,
  FaqJsonLd,
  HeroDecisionForm,
  HowItWorksSteps,
  Section,
  rise,
} from '@/components/landing/landing-blocks';
import { Reveal } from '@/components/motion/reveal';
import { PathSwatch } from '@/components/results/path-color';
import { RiskBadge, RiskMeter } from '@/components/results/risk';
import { DEMO_SEED } from '@/lib/demo';
import { formatPercent } from '@/lib/format';
import { SEO_PAGE_LIST, type SeoPage } from '@/lib/seo-pages';
import { cn } from '@/lib/utils';

/*
 * A search landing page (lib/seo-pages.ts): the question as the headline, the form pre-filled
 * with the visitor's likely decision, and a real simulation of a sample person, computed when
 * the site is built (the same engine and seed as the landing page). Fully static.
 */

export function seoMetadata(page: SeoPage): Metadata {
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: `/${page.slug}` },
    openGraph: {
      type: 'website',
      url: `/${page.slug}`,
      title: page.title,
      description: page.description,
    },
    twitter: { card: 'summary_large_image', title: page.title, description: page.description },
  };
}

function demoFutures(page: SeoPage) {
  const model = decisionModelSchema.parse(page.demo.model);
  const result = simulate(model, { seed: DEMO_SEED });
  return { model, result, chart: futuresChart(model, result, { seed: DEMO_SEED }) };
}

function PathOutcome({
  path,
  index,
  currency,
  horizonMonths,
  focus,
}: {
  path: PathResult;
  index: number;
  currency: string;
  horizonMonths: number;
  focus: boolean;
}) {
  const { probRunOut, lowestMedianCash, medianBreakEvenMonth } = path.metrics;
  return (
    <li
      className={cn(
        'flex flex-col gap-4 rounded-3xl border border-border bg-surface/60 p-6',
        focus && 'border-gradient border-transparent',
      )}
      data-testid="seo-path"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="flex items-start gap-2 font-semibold">
          <PathSwatch index={index} className="mt-[0.45em]" />
          {path.name}
        </h3>
        <RiskBadge probRunOut={probRunOut} />
      </div>
      <div>
        <p className="font-display text-4xl tabular-nums">{formatPercent(probRunOut)}</p>
        <p className="text-sm text-muted">of 1,000 futures run out of money</p>
        <RiskMeter probRunOut={probRunOut} className="mt-3" />
      </div>
      <dl className="grid gap-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Lowest typical savings</dt>
          <dd className="text-right font-medium tabular-nums">
            {formatMoney(lowestMedianCash.value, currency)}
            {lowestMedianCash.month === 0 ? ' (today)' : ` in month ${lowestMedianCash.month}`}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Income covers costs from</dt>
          <dd className="text-right font-medium">
            {medianBreakEvenMonth === null
              ? `Not within ${horizonMonths} months`
              : `Month ${medianBreakEvenMonth}`}
          </dd>
        </div>
      </dl>
    </li>
  );
}

export function SeoLanding({ page }: { page: SeoPage }) {
  const { model, result, chart } = demoFutures(page);
  const currency = model.baseline.currency;
  const name = page.demo.persona.split(',')[0];
  const others = SEO_PAGE_LIST.filter((p) => p.slug !== page.slug);

  return (
    <main className="flex w-full flex-col">
      <TrackView event="landing_viewed" properties={{ page: page.slug }} />
      <FaqJsonLd items={page.faqs} />

      <section className="mx-auto w-full max-w-6xl px-4 pt-14 sm:px-6 sm:pt-20">
        <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
          <p className="rise text-sm font-semibold text-accent" style={rise(0)}>
            {page.eyebrow}
          </p>
          <h1
            className="rise mt-4 font-display text-[2.4rem] leading-[1.05] sm:text-6xl"
            style={rise(80)}
          >
            {page.h1}
          </h1>
          <p className="rise mt-6 max-w-2xl text-lg text-muted sm:text-xl" style={rise(200)}>
            {page.intro}
          </p>
          <div className="rise mt-9 w-full max-w-2xl" style={rise(320)}>
            <HeroDecisionForm id={`${page.slug}-decision`} defaultValue={page.decision} />
          </div>
          <p className="rise mt-4 text-sm text-muted" style={rise(440)}>
            Free to start · about two minutes · you check every assumption before anything runs
          </p>
        </div>

        <figure
          className="rise border-gradient mt-16 rounded-[2rem] p-5 pb-6 shadow-[0_40px_120px_-40px_rgb(11_207_119/0.35)] sm:mt-20 sm:p-8 sm:pb-8"
          style={rise(560)}
        >
          <FuturesChart data={chart} currency={currency} />
          <figcaption className="mt-12 max-w-2xl text-muted sm:mt-14">
            <span className="font-semibold text-foreground">{page.demo.persona}</span> Each line
            above is one simulated year, out of {result.runs.toLocaleString('en-US')} for each
            option.
          </figcaption>
        </figure>
      </section>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-28 px-4 pt-20 sm:gap-36 sm:px-6 sm:pt-28">
        <Section
          id="results"
          title="What the simulation shows"
          intro={`${name}'s results, computed by the same engine you get. Yours depend on your own numbers.`}
        >
          <ul className="grid gap-5 md:grid-cols-3">
            {result.paths.map((path) => (
              <PathOutcome
                key={path.pathId}
                path={path}
                index={Math.max(
                  0,
                  model.paths.findIndex((p) => p.id === path.pathId),
                )}
                currency={currency}
                horizonMonths={result.horizonMonths}
                focus={path.pathId === page.demo.focusPathId}
              />
            ))}
          </ul>
          <ul className="mt-12 grid gap-5 md:grid-cols-3">
            {page.points.map((point, i) => (
              <Reveal
                as="li"
                key={point.title}
                delay={i * 120}
                className="rounded-3xl border border-border bg-surface/60 p-7"
              >
                <h3 className="text-xl font-bold tracking-tight">{point.title}</h3>
                <p className="mt-2 text-muted">{point.body}</p>
              </Reveal>
            ))}
          </ul>
        </Section>

        <Section
          id="how-it-works"
          title="How it works"
          intro="Three steps, about two minutes. Nothing runs until you've seen every assumption."
        >
          <HowItWorksSteps />
        </Section>

        <Section id="faq" title="Questions, answered">
          <Faq items={page.faqs} />
        </Section>

        <Reveal
          as="section"
          aria-labelledby="start-title"
          className="border-gradient relative overflow-hidden rounded-[2rem] px-5 py-14 text-center sm:px-10 sm:py-20"
        >
          <div aria-hidden className="bg-glow pointer-events-none absolute inset-0 opacity-90" />
          <div className="relative mx-auto max-w-2xl">
            <h2 id="start-title" className="font-display text-4xl leading-[1.08] sm:text-5xl">
              Try it with your numbers
            </h2>
            <p className="mt-4 text-muted sm:text-lg">
              Change the sentence to fit your situation. You can check every assumption before
              anything runs.
            </p>
            <HeroDecisionForm
              id={`${page.slug}-closing`}
              defaultValue={page.decision}
              className="mt-9"
            />
          </div>
        </Reveal>

        <nav aria-label="More simulators" className="flex flex-col items-center gap-4">
          <p className="text-sm font-semibold text-muted">More decisions to simulate</p>
          <ul className="flex flex-wrap justify-center gap-3">
            {others.map((other) => (
              <li key={other.slug}>
                <Link
                  href={`/${other.slug}`}
                  className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-surface/60 px-4 text-sm font-medium transition-colors hover:border-accent/60 hover:bg-accent-soft"
                >
                  {other.linkLabel}
                  <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/"
                className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-surface/60 px-4 text-sm font-medium transition-colors hover:border-accent/60 hover:bg-accent-soft"
              >
                Any career decision
                <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </main>
  );
}
