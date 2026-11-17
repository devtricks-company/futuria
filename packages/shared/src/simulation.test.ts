import { describe, expect, it } from 'vitest';
import { intakeRouting } from './ai';
import { SARA_MODEL } from './fixtures/sara';
import {
  BUSY_STATUSES,
  SIMULATION_STATUSES,
  STATUS_TRANSITIONS,
  canTransition,
  createSimulationRequestSchema,
  intakeAnswersRequestSchema,
  objectIdSchema,
  statusesThatCanReach,
} from './simulation';

describe('simulation status machine', () => {
  it('only references known statuses', () => {
    for (const targets of Object.values(STATUS_TRANSITIONS)) {
      for (const t of targets) expect(SIMULATION_STATUSES).toContain(t);
    }
  });

  it('routes runs through the queue and the pipeline', () => {
    expect(statusesThatCanReach('queued').sort()).toEqual(['failed', 'model_ready', 'ready']);
    expect(statusesThatCanReach('simulating')).toEqual(['queued']);
    expect(statusesThatCanReach('narrating').sort()).toEqual(['queued', 'simulating']);
    expect(statusesThatCanReach('ready')).toEqual(['narrating']);
    expect(canTransition('model_ready', 'simulating')).toBe(false);
    expect(canTransition('draft', 'queued')).toBe(false);
  });

  it('lets people go back to edit answers or the model, but not mid-run', () => {
    for (const from of ['model_ready', 'ready', 'failed'] as const) {
      expect(canTransition(from, 'intake_ready')).toBe(true);
      expect(canTransition(from, 'model_ready')).toBe(true);
    }
    for (const busy of BUSY_STATUSES) {
      expect(canTransition(busy, 'model_ready')).toBe(false);
      expect(canTransition(busy, 'queued')).toBe(false);
    }
  });
});

describe('intake', () => {
  it('routes crisis first, then out-of-scope decisions', () => {
    expect(intakeRouting({ inScope: true, safetyFlag: 'none' })).toBe('ok');
    expect(intakeRouting({ inScope: false, safetyFlag: 'none' })).toBe('out_of_scope');
    expect(intakeRouting({ inScope: true, safetyFlag: 'crisis' })).toBe('crisis');
  });

  it('validates answers and edited paths', () => {
    const ok = intakeAnswersRequestSchema.parse({
      answers: { savings: 18000, has_leads: true, field: 'UX' },
      paths: [{ id: 'stay', name: 'Stay employed', type: 'stay' }],
    });
    expect(ok.paths?.[0]?.summary).toBe('');
    const bad = (body: unknown) => intakeAnswersRequestSchema.safeParse(body).success;
    expect(bad({ answers: {}, paths: [] })).toBe(false);
    expect(bad({ answers: {}, paths: [{ id: 'Bad Id', name: 'x', type: 'stay' }] })).toBe(false);
    expect(
      bad({
        answers: {},
        paths: [
          { id: 'a', name: 'A', type: 'stay' },
          { id: 'a', name: 'B', type: 'freelance' },
        ],
      }),
    ).toBe(false);
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
