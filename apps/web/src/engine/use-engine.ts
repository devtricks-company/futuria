'use client';

import * as Comlink from 'comlink';
import { useEffect, useRef, useState } from 'react';
import {
  type DecisionModel,
  type FullAnalysis,
  type SimulationResult,
  decisionModelSchema,
} from '@futuria/shared';
import type { EngineApi } from './engine.worker';

/** Wait this long after the last change before the slower full analysis. */
const ANALYZE_DELAY_MS = 300;

export interface EngineState {
  /** 1,000-run result for the latest model computed so far (cards and fan chart). */
  result: SimulationResult | null;
  /** Full analysis (sensitivity, interventions) once the sliders settle. */
  analysis: FullAnalysis | null;
  /** A newer model is still being computed. */
  computing: boolean;
  error: string | null;
}

const IDLE: EngineState = { result: null, analysis: null, computing: false, error: null };

interface Job {
  model: DecisionModel;
  version: number;
}

/**
 * Recompute a tweaked model in a Web Worker. Pass `null` to stay idle (use the stored results).
 *
 * Every model gets a version number and the screen only moves forward: an older result never
 * replaces a newer one. While the worker is busy, newer models replace each other and only the
 * newest runs next, so dragging a slider never builds a queue.
 */
export function useEngine(model: DecisionModel | null, seed: number): EngineState {
  const [state, setState] = useState<EngineState>(IDLE);
  const workerRef = useRef<{ worker: Worker; api: Comlink.Remote<EngineApi> } | null>(null);
  const versionRef = useRef(0);
  const shownRef = useRef(0);
  const fastRef = useRef<{ busy: boolean; next: Job | null }>({ busy: false, next: null });

  useEffect(() => {
    return () => {
      workerRef.current?.api[Comlink.releaseProxy]();
      workerRef.current?.worker.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const version = ++versionRef.current;
    if (!model) {
      shownRef.current = version;
      setState(IDLE);
      return;
    }
    const parsed = decisionModelSchema.safeParse(model);
    if (!parsed.success) {
      setState((s) => ({
        ...s,
        computing: false,
        error: parsed.error.issues[0]?.message ?? 'Invalid model',
      }));
      return;
    }
    // Start the worker on the first tweak.
    if (!workerRef.current) {
      const worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
      workerRef.current = { worker, api: Comlink.wrap<EngineApi>(worker) };
    }
    const api = workerRef.current.api;
    setState((s) => ({ ...s, computing: true, error: null }));

    // Fast path: the 1,000-run result, as often as the worker keeps up.
    const fast = fastRef.current;
    const runFast = async (job: Job): Promise<void> => {
      fast.busy = true;
      try {
        const result = await api.simulate(job.model, seed);
        if (job.version > shownRef.current) {
          shownRef.current = job.version;
          setState((s) => ({ ...s, result }));
        }
      } catch (error) {
        setState((s) => ({ ...s, error: String(error) }));
      } finally {
        fast.busy = false;
        const next = fast.next;
        fast.next = null;
        if (next) void runFast(next);
      }
    };
    const job = { model: parsed.data, version };
    if (fast.busy) fast.next = job;
    else void runFast(job);

    // Slow path: sensitivity and interventions, once the sliders settle.
    const timer = setTimeout(async () => {
      try {
        const analysis = await api.analyze(parsed.data, seed);
        if (version >= shownRef.current) {
          shownRef.current = version;
          setState({
            result: analysis.result,
            analysis,
            computing: version !== versionRef.current,
            error: null,
          });
        }
      } catch (error) {
        if (version === versionRef.current) {
          setState((s) => ({ ...s, computing: false, error: String(error) }));
        }
      }
    }, ANALYZE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [model, seed]);

  return state;
}
