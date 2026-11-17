import { describe, expect, it } from 'vitest';
import { SARA_MODEL } from './fixtures/sara';
import {
  SIMULATION_STATUSES,
  STATUS_TRANSITIONS,
  canTransition,
  createSimulationRequestSchema,
  objectIdSchema,
  statusesThatCanReach,
} from './simulation';

describe('simulation status machine', () => {
  it('only references known statuses', () => {
    for (const targets of Object.values(STATUS_TRANSITIONS)) {
      for (const t of targets) expect(SIMULATION_STATUSES).toContain(t);
    }
  });

  it('allows the Phase 2 synchronous run and re-runs', () => {
    expect(canTransition('model_ready', 'simulating')).toBe(true);
    expect(canTransition('simulating', 'ready')).toBe(true);
    expect(canTransition('ready', 'simulating')).toBe(true);
    expect(canTransition('draft', 'simulating')).toBe(false);
    expect(statusesThatCanReach('simulating').sort()).toEqual(
      ['failed', 'model_ready', 'queued', 'ready'].sort(),
    );
  });
});

describe('request schemas', () => {
  it('validates create requests and trims text', () => {
    const parsed = createSimulationRequestSchema.parse({
      decisionText: '  What if I quit my job to freelance?  ',
      model: SARA_MODEL,
    });
    expect(parsed.decisionText).toBe('What if I quit my job to freelance?');
    expect(parsed.model?.horizonMonths).toBe(12);
    expect(createSimulationRequestSchema.safeParse({ decisionText: 'hi' }).success).toBe(false);
  });

  it('validates object ids', () => {
    expect(objectIdSchema.safeParse('507f1f77bcf86cd799439011').success).toBe(true);
    expect(objectIdSchema.safeParse('nope').success).toBe(false);
  });
});
