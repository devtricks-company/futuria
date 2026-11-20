'use client';

import { useEffect, useRef, useState } from 'react';
import { formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';

export type CountFormat = 'percent' | 'integer';

const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

function formatAs(value: number, format: CountFormat): string {
  return format === 'percent' ? formatPercent(value) : integer.format(Math.round(value));
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Eases `from` -> `to` over `duration` ms, calling `onFrame` each frame. Returns a cancel function. */
function tween(
  from: number,
  to: number,
  duration: number,
  onFrame: (value: number) => void,
): () => void {
  const start = performance.now();
  let frame = 0;
  const tick = (now: number) => {
    const t = duration <= 0 ? 1 : Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    onFrame(from + (to - from) * eased);
    if (t < 1) frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}

/**
 * A number that counts to its new value when it changes, so a slider's effect is visible. The
 * first render shows the real value (no count from zero). Screen readers get only the final
 * value; the moving digits are hidden from them.
 */
export function CountUp({
  value,
  format,
  duration = 650,
  className,
  testId,
}: {
  value: number;
  format: CountFormat;
  duration?: number;
  className?: string;
  /** Put on the visible number (end-to-end tests read it). */
  testId?: string;
}) {
  const [display, setDisplay] = useState(value);
  const shown = useRef(value);

  useEffect(() => {
    if (shown.current === value) return;
    return tween(shown.current, value, prefersReducedMotion() ? 0 : duration, (v) => {
      shown.current = v;
      setDisplay(v);
    });
  }, [value, duration]);

  return (
    <>
      <span aria-hidden data-testid={testId} className={cn('tabular-nums', className)}>
        {formatAs(display, format)}
      </span>
      <span className="sr-only">{formatAs(value, format)}</span>
    </>
  );
}

/**
 * A statistic that counts up from zero the first time it scrolls into view (the reference's
 * counters). Rendered with its real value on the server; it only resets to zero if it starts
 * off screen, so nobody sees a number jump backwards.
 */
export function CountOnView({
  value,
  format = 'integer',
  duration = 1600,
  className,
}: {
  value: number;
  format?: CountFormat;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const element = ref.current;
    if (!element || prefersReducedMotion()) return;
    let cancel: (() => void) | undefined;
    let armed = false;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry) return;
      if (!armed) {
        // First report: already visible means it was seen with its real value; leave it.
        if (entry.isIntersecting) return io.disconnect();
        armed = true;
        setDisplay(0);
        return;
      }
      if (entry.isIntersecting) {
        io.disconnect();
        cancel = tween(0, value, duration, setDisplay);
      }
    });
    io.observe(element);
    return () => {
      io.disconnect();
      cancel?.();
    };
  }, [value, duration]);

  return (
    <span ref={ref} className={cn('tabular-nums', className)}>
      <span aria-hidden>{formatAs(display, format)}</span>
      <span className="sr-only">{formatAs(value, format)}</span>
    </span>
  );
}
