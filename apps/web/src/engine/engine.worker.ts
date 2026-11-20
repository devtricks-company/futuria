/// <reference lib="webworker" />
import * as Comlink from 'comlink';
import type { DecisionModel, FullAnalysis, SimulationResult } from '@futuria/shared';
import { analyze, simulate } from '@futuria/engine';

/*
 * The simulation engine in a Web Worker, so sliders never block the page. Same code and the same
 * defaults as the API's engine step (`analyze(model, { seed })`), so with the same model and seed
 * the browser reproduces the stored results.
 */
const engine = {
  /** The 1,000-run result: path cards and the fan chart (~30–40 ms). */
  simulate(model: DecisionModel, seed: number): SimulationResult {
    return simulate(model, { seed });
  },
  /** Plus sensitivity and interventions per path (~150–250 ms). */
  analyze(model: DecisionModel, seed: number): FullAnalysis {
    return analyze(model, { seed });
  },
};

export type EngineApi = typeof engine;

Comlink.expose(engine);
