import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export const WIZARD_STEPS = ['Decision', 'Questions', 'Paths', 'Assumptions'] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export function Stepper({ current }: { current: WizardStep }) {
  const index = WIZARD_STEPS.indexOf(current);
  return (
    <ol className="flex items-center gap-2 text-xs sm:text-sm" aria-label="Progress">
      {WIZARD_STEPS.map((step, i) => {
        const done = i < index;
        const active = i === index;
        return (
          <li key={step} className="flex items-center gap-2">
            <span
              aria-current={active ? 'step' : undefined}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium',
                active && 'bg-accent text-accent-foreground',
                done && 'text-foreground',
                !active && !done && 'text-muted',
              )}
            >
              {done ? (
                <Check className="size-3.5" aria-hidden />
              ) : (
                <span className="tabular-nums">{i + 1}</span>
              )}
              <span className={cn(!active && 'hidden sm:inline')}>{step}</span>
            </span>
            {i < WIZARD_STEPS.length - 1 ? (
              <span className="h-px w-3 bg-border sm:w-6" aria-hidden />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
