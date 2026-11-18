import { cn } from '@/lib/utils';

/** Three futures fanning out from one starting point: the brand mark and the loader. */
const FAN = ['M4 12C10 12 12.5 5.5 20 5.5', 'M4 12H20', 'M4 12C10 12 12.5 18.5 20 18.5'] as const;

/** The app-icon tile: a dark fan on the brand gradient. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-[0.65rem] bg-[linear-gradient(135deg,var(--grad-1),var(--grad-2))] text-on-brand shadow-[0_1px_0_rgb(255_255_255/0.35)_inset,0_6px_16px_-6px_rgb(11_207_119/0.7)]',
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="size-[70%]" fill="none">
        {FAN.map((d) => (
          <path key={d} d={d} stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
        ))}
        <circle cx="4" cy="12" r="2.2" fill="currentColor" />
      </svg>
    </span>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark />
      <span className="text-lg font-extrabold tracking-[-0.04em]">Futuria</span>
    </span>
  );
}

/** The fan drawing itself, for "simulating…" moments. Static under reduced motion. */
export function FuturesLoader({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'relative inline-flex size-16 items-center justify-center rounded-2xl border border-border bg-surface shadow-card',
        className,
      )}
    >
      <span className="absolute inset-0 rounded-2xl bg-accent/10 motion-safe:animate-[futures-pulse_2.4s_ease-in-out_infinite]" />
      <svg viewBox="0 0 24 24" className="relative size-9 text-accent" fill="none">
        {FAN.map((d, i) => (
          <path
            key={d}
            d={d}
            pathLength={1}
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeDasharray="1"
            className="motion-safe:animate-[futures-draw_1.8s_ease-in-out_infinite]"
            style={{ animationDelay: `${i * 0.18}s` }}
          />
        ))}
        <circle cx="4" cy="12" r="2" fill="currentColor" />
      </svg>
    </span>
  );
}
