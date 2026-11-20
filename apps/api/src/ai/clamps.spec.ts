import { type ProposedPath, fixed, range } from '@futuria/shared';
import { AiError } from './ai.errors.js';
import { assembleModel } from './clamps.js';
import { type ModelOutput, type PathOutputs, modelOutputSchemaFor } from './model-output.schema.js';
import { syntheticModel } from './synthetic.js';

const PATHS: ProposedPath[] = [
  { id: 'stay', name: 'Stay employed', type: 'stay', summary: '' },
  { id: 'freelance', name: 'Go solo', type: 'freelance', summary: '' },
  { id: 'hybrid', name: 'Side first', type: 'hybrid', summary: '' },
];

function output(): ModelOutput {
  return syntheticModel({
    decisionText: 'freelance?',
    intake: {
      inScope: true,
      category: 'freelance',
      safetyFlag: 'none',
      title: 't',
      questions: [],
      proposedPaths: PATHS,
    },
    answers: {},
    paths: PATHS,
    horizonMonths: 12,
  });
}

describe('model output schema', () => {
  it('has one positional entry per path type, and no unions over path types', () => {
    const schema = modelOutputSchemaFor(['stay', 'freelance', 'hybrid']);
    expect(schema.safeParse(output()).success).toBe(true);
    const json = JSON.stringify(schema.toJSONSchema());
    expect(json).not.toContain('anyOf":[{"type":"object","properties":{"kind"');
    expect(Object.keys(schema.shape.paths.shape)).toEqual(['path_1', 'path_2', 'path_3']);
  });
});

describe('assembleModel', () => {
  it('produces a valid model with the person’s path ids, names, types and horizon', () => {
    const { model, adjustments } = assembleModel(output(), { paths: PATHS, horizonMonths: 12 });
    expect(model.horizonMonths).toBe(12);
    expect(model.paths.map((p) => [p.id, p.name, p.type])).toEqual([
      ['stay', 'Stay employed', 'stay'],
      ['freelance', 'Go solo', 'freelance'],
      ['hybrid', 'Side first', 'hybrid'],
    ]);
    expect(adjustments).toEqual([]);
  });

  it('turns repeated numbers into fixed values and the rest into ranges', () => {
    const { model } = assembleModel(output(), { paths: PATHS, horizonMonths: 12 });
    const hybrid = model.paths[2]!;
    if (hybrid.type !== 'hybrid') throw new Error('expected hybrid');
    expect(hybrid.transitionMonths).toEqual(fixed(6));
    expect(hybrid.sideHoursPerWeek).toEqual(range(4, 8, 12));
    expect(model.baseline.monthlyExpenses.kind).toBe('range');
  });

  it('clamps implausible numbers and reads percentages as fractions', () => {
    const raw = output();
    const freelance = raw.paths.path_2 as PathOutputs['freelance'];
    freelance.hourlyRate = { low: 40, likely: 900, high: 2000 };
    freelance.taxRate = { low: 27, likely: 27, high: 27 };
    freelance.monthlyClientLossProb = 8;
    freelance.rampMonths = { low: 30, likely: 2, high: -1 }; // out of range and out of order
    const { model, adjustments } = assembleModel(raw, { paths: PATHS, horizonMonths: 12 });
    const path = model.paths[1]!;
    if (path.type !== 'freelance') throw new Error('expected freelance');
    expect(path.hourlyRate).toEqual(range(40, 500, 500));
    expect(path.taxRate).toEqual(fixed(0.27));
    expect(path.monthlyClientLossProb).toBeCloseTo(0.08);
    expect(path.rampMonths).toEqual(range(0, 2, 24));
    expect(adjustments).toEqual(
      expect.arrayContaining([
        'freelance.hourlyRate.likely: 900 -> 500',
        'freelance.rampMonths.low: 30 -> 24',
      ]),
    );
  });

  it('drops assumptions that point at unknown paths, and fixes the currency', () => {
    const raw = output();
    raw.baseline.currency = 'dollars';
    raw.assumptions.push({
      id: 'x',
      pathId: 'path_2', // a key, not an id
      field: 'hourlyRate',
      label: 'Rate',
      rationale: 'r',
      source: 'ai_estimate',
      confidence: 'low',
    });
    const { model } = assembleModel(raw, { paths: PATHS, horizonMonths: 12 });
    expect(model.assumptions.at(-1)!.pathId).toBeNull();
    expect(model.baseline.currency).toBe('USD');
  });

  it('rejects output that is missing a path', () => {
    const raw = output();
    delete raw.paths.path_3;
    expect(() => assembleModel(raw, { paths: PATHS, horizonMonths: 12 })).toThrow(AiError);
  });
});
