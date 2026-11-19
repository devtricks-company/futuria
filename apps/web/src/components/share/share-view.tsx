import { ArrowRight, CalendarRange, EyeOff, GitBranch } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { PublicShareDto, SharedPathDto } from '@futuria/shared';
import { LogoMark } from '@/components/brand';
import { FuturesChart } from '@/components/landing/futures-chart';
import { Notice } from '@/components/notice';
import { PathSwatch } from '@/components/results/path-color';
import { RiskBadge, RiskMeter } from '@/components/results/risk';
import { ShareDetails } from '@/components/share/share-details';
import { Button } from '@/components/ui/button';
import { formatMonth, formatPercent } from '@/lib/format';
import { helpfulLevers, meaningfulDrivers, riskiestPath } from '@/lib/share-view';

/** Where visitors of a share link start their own simulation (attributed to sharing). */
const START_HREF = '/?ref=share';

/**
 * A shared simulation, read-only, for anyone with the link. Without the owner's opt-in it shows
 * chances, months and the shape of the futures, never amounts.
 */
export function ShareView({ share }: { share: PublicShareDto }) {
  const colorIndex = Object.fromEntries(share.paths.map((p) => [p.pathId, p.index]));
  const focus = riskiestPath(share.paths);
  const levers = focus ? helpfulLevers(focus) : [];

  return (
    <article className="flex flex-col gap-8">
      {share.watermark ? <Watermark /> : null}

      <header className="flex flex-col gap-3">
        <p className="text-sm font-medium text-accent">A shared FUTURIA simulation</p>
        <h1 className="font-display text-3xl leading-[1.1] sm:text-4xl">{share.title}</h1>
        <ul className="flex flex-wrap gap-2 text-xs text-muted" aria-label="About this simulation">
          <Chip icon={<GitBranch className="size-3.5" aria-hidden />}>
            {share.paths.length} paths
          </Chip>
          <Chip icon={<CalendarRange className="size-3.5" aria-hidden />}>
            {share.horizonMonths} months
          </Chip>
          {share.showNumbers ? null : (
            <Chip icon={<EyeOff className="size-3.5" aria-hidden />}>Amounts hidden</Chip>
          )}
        </ul>
      </header>

      <figure className="border-gradient flex flex-col gap-4 rounded-3xl p-4 sm:p-6">
        <FuturesChart data={share.chart} currency={share.currency} />
        {/* mt-6: clears the chart's month labels, which hang below it. */}
        <figcaption className="mt-6 text-sm text-muted sm:mt-4">
          Each line is one simulated future, starting from today&apos;s savings.
          {share.showNumbers ? null : ' The person who shared this kept the amounts private.'}
        </figcaption>
      </figure>

      {share.details ? (
        <ShareDetails
          details={share.details}
          colorIndex={colorIndex}
          currency={share.currency}
          horizonMonths={share.horizonMonths}
        />
      ) : (
        <>
          <section aria-labelledby="paths-heading" className="flex flex-col gap-4">
            <h2 id="paths-heading" className="font-display text-2xl">
              The paths
            </h2>
            <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {share.paths.map((path) => (
                <SharedPathCard key={path.pathId} path={path} horizonMonths={share.horizonMonths} />
              ))}
            </ul>
          </section>

          {focus && levers.length ? (
            <section aria-labelledby="levers-heading" className="flex flex-col gap-4">
              <h2 id="levers-heading" className="font-display text-2xl">
                What would make &ldquo;{focus.name}&rdquo; safer
              </h2>
              <ul className="grid gap-3 md:grid-cols-3">
                {levers.map((lever) => (
                  <li
                    key={lever.label}
                    className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4 shadow-card"
                    data-testid="shared-lever"
                  >
                    <p className="font-medium">{lever.label}</p>
                    <p className="text-sm text-muted">
                      {/* The "after" only: levers are compared on their own (smaller) set of
                          runs, so their "before" can differ slightly from the card above. */}
                      {lever.probRunOutBefore - lever.probRunOutAfter >= 0.005 ? (
                        <>
                          Chance of running out drops to{' '}
                          <span className="font-medium text-foreground tabular-nums">
                            {formatPercent(lever.probRunOutAfter)}
                          </span>
                        </>
                      ) : (
                        <>
                          Covers its costs from{' '}
                          <span className="font-medium text-foreground">
                            {formatMonth(lever.breakEvenMonthAfter).toLowerCase()}
                          </span>
                        </>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}

      <section className="border-gradient flex flex-col items-start gap-4 rounded-3xl p-6 sm:p-8">
        <h2 className="font-display text-2xl sm:text-3xl">What would your futures look like?</h2>
        <p className="max-w-2xl text-muted">
          Describe a career move in one sentence. FUTURIA simulates a thousand futures for each
          option and shows your chance of running out of money. Free to start.
        </p>
        <Button asChild size="lg">
          <Link href={START_HREF}>
            Simulate my own decision
            <ArrowRight />
          </Link>
        </Button>
      </section>
    </article>
  );
}

function Chip({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/70 px-2.5 py-1">
      {icon}
      {children}
    </li>
  );
}

/** Free plan: a visible "made with FUTURIA" band, which doubles as a way in. */
function Watermark() {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface-muted/60 px-4 py-3 text-sm"
      data-testid="share-watermark"
    >
      <span className="inline-flex items-center gap-2">
        <LogoMark />
        <span>
          Made with <strong className="font-semibold">FUTURIA</strong>, free plan
        </span>
      </span>
      <Link href={START_HREF} className="font-medium text-accent hover:underline">
        Try it free
      </Link>
    </div>
  );
}

function SharedPathCard({ path, horizonMonths }: { path: SharedPathDto; horizonMonths: number }) {
  const drivers = meaningfulDrivers(path);
  return (
    <li
      className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 shadow-card"
      data-testid="shared-path"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="flex items-start gap-2 font-semibold">
          <PathSwatch index={path.index} className="mt-[0.45em]" />
          {path.name}
        </h3>
        <RiskBadge probRunOut={path.probRunOut} />
      </div>
      <div>
        <p className="font-display text-3xl tabular-nums">{formatPercent(path.probRunOut)}</p>
        <p className="text-sm text-muted">
          chance of running out of money
          {path.probRunOut > 0 && path.medianRunOutMonth !== null
            ? `, usually around month ${path.medianRunOutMonth}`
            : ''}
        </p>
        <RiskMeter probRunOut={path.probRunOut} className="mt-3" />
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-muted">Covers its costs from</dt>
          <dd className="font-medium">
            {formatMonth(path.medianBreakEvenMonth, `Not within ${horizonMonths} months`)}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Futures that get there</dt>
          <dd className="font-medium tabular-nums">{formatPercent(path.probBreakEven)}</dd>
        </div>
      </dl>
      {drivers.length ? (
        <div className="flex flex-col gap-1.5 border-t border-border pt-3 text-sm">
          <p className="text-xs font-medium text-muted">What matters most</p>
          <ul className="flex flex-col gap-1">
            {drivers.map((d) => (
              <li key={d.label} className="flex justify-between gap-3">
                <span>{d.label}</span>
                <span className="text-muted tabular-nums">{formatPercent(d.share)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  );
}

/** A link that was never shared, was turned off, or was replaced by a new one. */
export function ShareMissing() {
  return (
    <Notice
      variant="info"
      title="This link isn't shared anymore"
      action={
        <Button asChild size="sm">
          <Link href={START_HREF}>Simulate your own decision</Link>
        </Button>
      }
    >
      The person who shared it may have turned sharing off or made a new link.
    </Notice>
  );
}

/** The owner is changing the simulation; its new results aren't ready yet. */
export function ShareUpdating({ title }: { title: string }) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-3xl leading-[1.1] sm:text-4xl">{title}</h1>
      <Notice variant="info" title="This simulation is being updated">
        Its new futures are being simulated. Check back in a minute.
      </Notice>
    </div>
  );
}

export function ShareUnavailable() {
  return (
    <Notice variant="error" title="We couldn't load this shared simulation">
      Please try again in a moment.
    </Notice>
  );
}
