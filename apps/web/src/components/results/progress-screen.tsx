import { Check, LoaderCircle } from 'lucide-react';
import type { SimulationStatus } from '@futuria/shared';
import { FuturesLoader } from '@/components/brand';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const STEPS: { status: SimulationStatus; label: string }[] = [
  { status: 'queued', label: 'Getting ready' },
  { status: 'simulating', label: 'Simulating 1,000 possible futures per path' },
  { status: 'narrating', label: 'Writing the story of each future' },
];

/** While the run pipeline works: queued -> simulating -> narrating. */
export function ProgressScreen({ status }: { status: SimulationStatus }) {
  const current = Math.max(
    0,
    STEPS.findIndex((s) => s.status === status),
  );
  return (
    <Card
      className="border-gradient border-transparent mx-auto mt-6 flex w-full max-w-xl flex-col gap-8 rounded-[2rem] py-12 shadow-pop motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-500"
      aria-live="polite"
    >
      <div className="flex flex-col items-center text-center">
        <FuturesLoader />
        <h1 className="mt-6 font-display text-2xl sm:text-3xl">
          Simulating 1,000 possible futures…
        </h1>
        <p className="mt-2 text-sm text-muted">This usually takes under a minute.</p>
      </div>
      <ol className="mx-auto flex w-full max-w-sm flex-col gap-2 text-sm">
        {STEPS.map((step, i) => (
          <li
            key={step.status}
            className={cn(
              'flex items-center gap-3 rounded-2xl border px-3.5 py-3 font-medium transition-colors duration-500',
              i === current ? 'border-accent/30 bg-accent-soft' : 'border-transparent',
              i > current && 'text-muted',
            )}
          >
            <span
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-full border',
                i < current && 'border-accent bg-accent text-accent-foreground',
                i === current && 'border-accent text-accent',
                i > current && 'border-border',
              )}
            >
              {i < current ? (
                <Check className="size-3.5" aria-hidden />
              ) : i === current ? (
                <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
              ) : null}
            </span>
            {step.label}
          </li>
        ))}
      </ol>
    </Card>
  );
}
