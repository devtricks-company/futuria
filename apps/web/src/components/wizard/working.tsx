'use client';

import { LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
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
    <Card className="flex flex-col items-center gap-4 py-12 text-center" aria-live="polite">
      <LoaderCircle className="size-8 animate-spin text-accent" aria-hidden />
      <p className="text-lg font-medium">{messages[step]}</p>
      <p className="text-sm text-muted tabular-nums">
        {elapsed < expectedSeconds
          ? `Usually about ${expectedSeconds} seconds · ${elapsed}s`
          : `Taking a little longer than usual · ${elapsed}s`}
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
