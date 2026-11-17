import { Check, LoaderCircle } from 'lucide-react';
import type { SimulationStatus } from '@futuria/shared';
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
    <Card className="mx-auto flex w-full max-w-xl flex-col gap-6 py-10" aria-live="polite">
      <div className="text-center">
        <LoaderCircle className="mx-auto size-8 animate-spin text-accent" aria-hidden />
        <h1 className="mt-4 text-xl font-semibold">Simulating 1,000 possible futures…</h1>
        <p className="mt-1 text-sm text-muted">This usually takes under a minute.</p>
      </div>
      <ol className="mx-auto flex flex-col gap-3 text-sm">
        {STEPS.map((step, i) => (
          <li
            key={step.status}
            className={cn('flex items-center gap-3', i > current && 'text-muted')}
          >
            <span
              className={cn(
                'flex size-6 items-center justify-center rounded-full border',
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
