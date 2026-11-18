import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export const WIZARD_STEPS = ['Decision', 'Questions', 'Paths', 'Assumptions'] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

/**
 * Four segments that fill as you go. The current one fills in the brand gradient when the step
 * opens; step names show from `sm` up, and phones get "Step 2 of 4: Questions".
 */
export function Stepper({ current }: { current: WizardStep }) {
  const index = WIZARD_STEPS.indexOf(current);
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-sm font-semibold sm:hidden">
        <span className="text-accent">
          Step {index + 1} of {WIZARD_STEPS.length}:
        </span>{' '}
        {current}
      </p>
      <ol className="grid grid-cols-4 gap-2 text-sm" aria-label="Progress">
        {WIZARD_STEPS.map((step, i) => {
          const done = i < index;
          const active = i === index;
          return (
            <li key={step} className="flex flex-col gap-2.5">
              <span aria-hidden className="relative h-1.5 overflow-hidden rounded-full bg-border">
                <span
                  className={cn(
                    'absolute inset-0 origin-left rounded-full bg-[linear-gradient(90deg,var(--grad-1),var(--grad-2))]',
                    done && 'opacity-60',
                    active &&
                      'motion-safe:animate-in motion-safe:slide-in-from-left-full motion-safe:duration-700',
                    !done && !active && 'hidden',
                  )}
                />
              </span>
              <span
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'flex items-center gap-2 font-semibold',
                  active && 'text-foreground',
                  done && 'text-foreground/75',
                  !active && !done && 'text-muted',
                )}
              >
                <span
                  className={cn(
                    'hidden size-5 shrink-0 items-center justify-center rounded-full text-[0.7rem] tabular-nums sm:flex',
                    done && 'bg-accent-soft text-accent',
                    active && 'bg-brand text-on-brand',
                    !active && !done && 'border border-border-strong',
                  )}
                >
                  {done ? <Check className="size-3" strokeWidth={3} aria-hidden /> : i + 1}
                </span>
                <span className="sr-only sm:not-sr-only">{step}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
