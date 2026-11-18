import { AlertTriangle, CircleAlert, CircleCheck } from 'lucide-react';
import { RISK_LABEL, type RiskLevel, riskLevel } from '@/lib/risk';
import { cn } from '@/lib/utils';

const STYLE: Record<
  RiskLevel,
  { badge: string; fill: string; track: string; icon: typeof CircleCheck }
> = {
  low: {
    badge: 'bg-success-surface text-success',
    fill: 'bg-success',
    track: 'bg-success/15',
    icon: CircleCheck,
  },
  some: {
    badge: 'bg-estimate-surface text-estimate',
    fill: 'bg-estimate-border',
    track: 'bg-estimate-border/20',
    icon: CircleAlert,
  },
  high: {
    badge: 'bg-danger-surface text-danger',
    fill: 'bg-danger',
    track: 'bg-danger/15',
    icon: AlertTriangle,
  },
};

/** "Low risk" / "Some risk" / "High risk": icon + label, never colour alone. */
export function RiskBadge({ probRunOut, className }: { probRunOut: number; className?: string }) {
  const level = riskLevel(probRunOut);
  const { badge, icon: Icon } = STYLE[level];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        badge,
        className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      {RISK_LABEL[level]}
    </span>
  );
}

/** A thin meter of the chance of running out (0–100%); the fill colour follows the risk level. */
export function RiskMeter({ probRunOut, className }: { probRunOut: number; className?: string }) {
  const { fill, track } = STYLE[riskLevel(probRunOut)];
  const pct = Math.min(100, Math.max(0, probRunOut * 100));
  return (
    <span aria-hidden className={cn('block h-1.5 overflow-hidden rounded-full', track, className)}>
      {pct > 0 ? (
        <span
          className={cn('block h-full rounded-full transition-[width] duration-500', fill)}
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      ) : null}
    </span>
  );
}
