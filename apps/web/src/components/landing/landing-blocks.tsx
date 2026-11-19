import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { Reveal } from '@/components/motion/reveal';
import { Button } from '@/components/ui/button';
import { EXAMPLE_DECISIONS } from '@/lib/examples';
import { cn } from '@/lib/utils';

/*
 * Building blocks shared by the landing page and the search landing pages (lib/seo-pages.ts).
 */

/** Delays the hero's parts so they rise in one after another. */
export const rise = (ms: number) => ({ '--rise-delay': `${ms}ms` }) as CSSProperties;

/**
 * The one input that starts everything: a decision in the visitor's own words. A plain GET form
 * to /new, so it works before (or without) JavaScript. `defaultValue` pre-fills it.
 */
export function HeroDecisionForm({
  id,
  className,
  defaultValue,
}: {
  id: string;
  className?: string;
  defaultValue?: string;
}) {
  return (
    <form action="/new" className={cn('w-full', className)}>
      <div className="flex flex-col gap-2 rounded-[1.75rem] border border-border-strong bg-surface/80 p-2 shadow-pop backdrop-blur-md transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-4 focus-within:ring-ring/20 sm:flex-row sm:items-center sm:rounded-full">
        <label htmlFor={id} className="sr-only">
          Your decision
        </label>
        <input
          id={id}
          name="q"
          required
          minLength={5}
          maxLength={1000}
          defaultValue={defaultValue}
          placeholder="What if I quit my job to…"
          className="h-12 w-full min-w-0 bg-transparent px-4 text-base outline-none placeholder:text-muted"
        />
        <Button type="submit" size="lg" className="w-full sm:w-auto">
          Simulate my futures
        </Button>
      </div>
    </form>
  );
}

/** Example decisions as chips: one tap fills the wizard with a full sentence. */
export function Examples({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <div
      className={cn('flex flex-wrap items-center justify-center gap-2', className)}
      style={style}
    >
      <span className="text-sm text-muted">Or try:</span>
      {EXAMPLE_DECISIONS.map((example) => (
        <Link
          key={example.text}
          href={{ pathname: '/new', query: { q: example.text } }}
          className="inline-flex h-9 items-center rounded-full border border-border bg-surface/60 px-3.5 text-sm font-medium transition-[border-color,background-color,transform] duration-300 outline-none hover:-translate-y-0.5 hover:border-accent/60 hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-ring"
        >
          {example.label}
        </Link>
      ))}
    </div>
  );
}

/** A landing section: a centred title and intro that reveal on scroll, then the content. */
export function Section({
  id,
  title,
  intro,
  children,
}: {
  id: string;
  title: ReactNode;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24" aria-labelledby={`${id}-title`}>
      <Reveal className="mx-auto max-w-2xl text-center">
        <h2 id={`${id}-title`} className="font-display text-4xl leading-[1.08] sm:text-5xl">
          {title}
        </h2>
        {intro ? <p className="mt-4 text-muted sm:text-lg">{intro}</p> : null}
      </Reveal>
      <Reveal delay={120} className="mt-12 sm:mt-14">
        {children}
      </Reveal>
    </section>
  );
}

export const HOW_IT_WORKS = [
  {
    title: 'Describe your decision',
    body: 'In your own words. FUTURIA then asks 5 to 7 short questions about your money and plans, each with a sensible default.',
  },
  {
    title: 'Check the assumptions',
    body: 'See everything the simulation assumes, from your hourly rate to the months until your first client. AI estimates are marked, and every number is yours to change.',
  },
  {
    title: 'Compare your futures',
    body: 'Each option runs 1,000 times. You see the chance of running out of money, when you would break even, and the moves that lower your risk.',
  },
] as const;

/** The three steps, as numbered cards. */
export function HowItWorksSteps() {
  return (
    <ol className="grid gap-5 md:grid-cols-3">
      {HOW_IT_WORKS.map((step, i) => (
        <Reveal
          as="li"
          key={step.title}
          delay={i * 120}
          className="group relative rounded-3xl border border-border bg-surface/60 p-7 transition-[border-color,transform] duration-500 hover:-translate-y-1 hover:border-accent/50"
        >
          <span className="flex size-12 items-center justify-center rounded-2xl bg-brand font-display text-xl text-on-brand shadow-glow tabular-nums transition-transform duration-500 group-hover:-rotate-6">
            {i + 1}
          </span>
          <h3 className="mt-6 text-xl font-bold tracking-tight">{step.title}</h3>
          <p className="mt-2 text-muted">{step.body}</p>
        </Reveal>
      ))}
    </ol>
  );
}

export interface FaqItem {
  q: string;
  a: ReactNode;
}

/** Questions as an accordion (one open at a time); the first starts open. */
export function Faq({ items }: { items: readonly FaqItem[] }) {
  return (
    <div className="faq mx-auto flex max-w-3xl flex-col gap-3">
      {items.map((item, i) => (
        <details
          key={item.q}
          name="faq"
          open={i === 0}
          className="group rounded-2xl border border-border bg-surface/60 transition-colors open:border-accent/40 open:bg-surface"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-5 py-4.5 text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-6 sm:text-lg [&::-webkit-details-marker]:hidden">
            {item.q}
            <span
              aria-hidden
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-muted text-muted transition-[transform,background-color,color] duration-300 group-open:rotate-180 group-open:bg-brand group-open:text-on-brand"
            >
              <ChevronDown className="size-4" />
            </span>
          </summary>
          <p className="px-5 pb-5 text-muted sm:px-6 sm:pb-6">{item.a}</p>
        </details>
      ))}
    </div>
  );
}

/** Structured data for search results: the page's questions and answers (plain text). */
export function FaqJsonLd({ items }: { items: readonly { q: string; a: string }[] }) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };
  return (
    <script
      type="application/ld+json"
      // `<` escaped so the content can never close the script tag.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}
