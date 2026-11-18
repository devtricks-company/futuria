'use client';

import { useEffect, useState } from 'react';
import { FuturesLoader } from '@/components/brand';
import { Card } from '@/components/ui/card';

/**
 * Shown while Claude works (intake ~10 s, model ~30 s). Rotates through what is happening and
 * shows the elapsed time, so a long wait never looks stuck.
 */
export function Working({
  messages,
  expectedSeconds,
}: {
  messages: readonly string[];
  expectedSeconds: number;
}) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 500);
    return () => clearInterval(timer);
  }, []);
  const step = Math.min(
    messages.length - 1,
    Math.floor((elapsed / Math.max(expectedSeconds, 1)) * messages.length),
  );
  return (
    <Card
      className="border-gradient border-transparent flex flex-col items-center gap-4 rounded-[2rem] py-14 text-center shadow-pop motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-500"
      aria-live="polite"
    >
      <FuturesLoader />
      <p
        key={step}
        className="mt-2 font-display text-2xl motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-500 sm:text-3xl"
      >
        {messages[step]}
      </p>
      <p className="text-sm text-muted tabular-nums">
        {elapsed < expectedSeconds
          ? `Usually about ${expectedSeconds} seconds. ${elapsed}s so far`
          : `Taking a little longer than usual. ${elapsed}s so far`}
      </p>
    </Card>
  );
}

export const INTAKE_MESSAGES = [
  'Reading your decision…',
  'Working out what matters for this choice…',
  'Writing a few short questions…',
] as const;

export const MODEL_MESSAGES = [
  'Turning your answers into a model…',
  'Estimating what we can’t know yet…',
  'Checking every number is in a sensible range…',
] as const;
