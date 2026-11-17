import {
  type Assumption,
  type DecisionModel,
  type Distribution,
  type ProposedPath,
  decisionModelSchema,
  isDistribution,
} from '@futuria/shared';
import { AiError } from './ai.errors.js';
import { type DistOutput, type ModelOutput, pathKey } from './model-output.schema.js';

/*
 * Server-side sanity clamps on Claude's numbers. Claude proposes the model; these bounds keep a
 * misunderstanding ("27" meaning 27%, a $5,000 hourly rate) from reaching the engine. Every
 * change is reported as an adjustment so it can be logged and reviewed in evals.
 */

interface Rule {
  min: number;
  max: number;
  /** A fraction field: values between 1 and 100 are read as percentages (27 -> 0.27). */
  fraction?: boolean;
}

/** Bounds by field name. Distribution fields clamp low, likely and high. */
const RULES: Record<string, Rule> = {
  // baseline
  startingCash: { min: -10_000_000, max: 100_000_000 },
  monthlyExpenses: { min: 0, max: 1_000_000 },
  annualExpenseGrowth: { min: -0.5, max: 1, fraction: true },
  currentMonthlyNetSalary: { min: 0, max: 1_000_000 },
  otherMonthlyIncome: { min: 0, max: 1_000_000 },
  emergencyFloor: { min: -10_000_000, max: 10_000_000 },
  // stay / newJob
  annualRaisePct: { min: -0.1, max: 0.3, fraction: true },
  annualLayoffProb: { min: 0, max: 0.5, fraction: true },
  monthsToReemploy: { min: 0, max: 24 },
  monthsToFindJob: { min: 0, max: 24 },
  newMonthlyNetSalary: { min: 0, max: 1_000_000 },
  signOnBonus: { min: -1_000_000, max: 1_000_000 }, // negative: relocation or other one-off cost
  // freelance (also hybrid.freelance)
  monthsToFirstClient: { min: 0, max: 24 },
  hourlyRate: { min: 5, max: 500 },
  billableHoursPerWeek: { min: 0, max: 60 },
  rampMonths: { min: 0, max: 24 },
  initialBookedHoursPerWeek: { min: 0, max: 60 },
  monthlyClientLossProb: { min: 0, max: 0.5, fraction: true },
  businessCostsMonthly: { min: 0, max: 100_000 },
  taxRate: { min: 0, max: 0.6, fraction: true },
  setupCost: { min: 0, max: 1_000_000 },
  revenueVolatility: { min: 0, max: 1, fraction: true },
  // startup
  monthsToFirstRevenue: { min: 0, max: 36 },
  startingMrr: { min: 0, max: 1_000_000 },
  monthlyGrowthRate: { min: -0.3, max: 0.5, fraction: true },
  monthlyFailureProb: { min: 0, max: 0.3, fraction: true },
  monthlyBurn: { min: 0, max: 1_000_000 },
  fallbackMonthlySalary: { min: 0, max: 1_000_000 },
  probability: { min: 0, max: 1, fraction: true },
  month: { min: 1, max: 120 },
  founderMonthlySalary: { min: 0, max: 1_000_000 },
  // hybrid
  transitionMonths: { min: 0, max: 24 },
  transitionSalaryFraction: { min: 0, max: 1, fraction: true },
  sideHoursPerWeek: { min: 0, max: 40 },
};

const MAX_ASSUMPTIONS = 40;

export interface AssembleContext {
  /** The paths the person kept, in order. Their ids, names and types win over Claude's. */
  paths: ProposedPath[];
  horizonMonths: number;
}

export interface AssembledModel {
  model: DecisionModel;
  adjustments: string[];
}

function clampNumber(value: number, rule: Rule, label: string, adjustments: string[]): number {
  let v = value;
  if (rule.fraction && Math.abs(v) > 1 && Math.abs(v) <= 100) v = v / 100;
  const clamped = Math.min(rule.max, Math.max(rule.min, v));
  if (clamped !== v) adjustments.push(`${label}: ${value} -> ${clamped}`);
  return clamped;
}

function clampDistribution(
  d: Distribution,
  rule: Rule,
  label: string,
  adjustments: string[],
): Distribution {
  if (d.kind === 'fixed') {
    return { kind: 'fixed', value: clampNumber(d.value, rule, label, adjustments) };
  }
  const [low, likely, high] = [d.low, d.likely, d.high]
    .map((v, i) => clampNumber(v, rule, `${label}.${['low', 'likely', 'high'][i]}`, adjustments))
    .sort((a, b) => a - b) as [number, number, number];
  return { kind: 'range', low, likely, high };
}

/** {low, likely, high} from Claude: equal values mean a known (fixed) value. */
function isDistOutput(value: unknown): value is DistOutput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    Object.keys(v).length === 3 &&
    typeof v.low === 'number' &&
    typeof v.likely === 'number' &&
    typeof v.high === 'number'
  );
}

function toDistribution(d: DistOutput): Distribution {
  return d.low === d.likely && d.likely === d.high
    ? { kind: 'fixed', value: d.likely }
    : { kind: 'range', low: d.low, likely: d.likely, high: d.high };
}

/**
 * Convert Claude's distributions and clamp every known numeric field of an object (recursing
 * into nested parameter groups such as hybrid.freelance and startup.funding).
 */
function clampObject(
  obj: Record<string, unknown>,
  prefix: string,
  adjustments: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(obj)) {
    const label = `${prefix}.${key}`;
    const rule = RULES[key];
    if (raw === null) continue; // nullable optional fields: let the schema default them
    const value = isDistOutput(raw) ? toDistribution(raw) : raw;
    if (rule && typeof value === 'number') {
      out[key] = clampNumber(value, rule, label, adjustments);
    } else if (rule && isDistribution(value)) {
      out[key] = clampDistribution(value, rule, label, adjustments);
    } else if (typeof value === 'object' && !Array.isArray(value) && !isDistribution(value)) {
      out[key] = clampObject(value as Record<string, unknown>, label, adjustments);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** Pair the positional output (path_1, path_2, ...) with the person's paths, in order. */
function matchPaths(output: ModelOutput['paths'], wanted: ProposedPath[]) {
  return wanted.map((want, i) => {
    const params = output[pathKey(i)];
    if (!params) {
      throw new AiError(
        'invalid_output',
        `Model output has no ${pathKey(i)} for "${want.id}"`,
        true,
      );
    }
    return { want, params: params as Record<string, unknown> };
  });
}

function cleanAssumptions(assumptions: Assumption[], pathIds: Set<string>): Assumption[] {
  const seen = new Set<string>();
  const text = (value: string, max: number) => value.trim().slice(0, max);
  return assumptions.slice(0, MAX_ASSUMPTIONS).map((a, i) => {
    let id = text(a.id, 64) || `a${i + 1}`;
    while (seen.has(id)) id = `${id}_${i + 1}`;
    seen.add(id);
    return {
      id,
      pathId: a.pathId && pathIds.has(a.pathId) ? a.pathId : null,
      field: text(a.field, 120),
      label: text(a.label, 120),
      rationale: text(a.rationale, 600),
      source: a.source,
      confidence: a.confidence,
    };
  });
}

/**
 * Turn Claude's buildModel output into a validated DecisionModel: keep the person's paths,
 * clamp numbers, tidy assumptions, set the horizon, and validate with the shared schema.
 */
export function assembleModel(output: ModelOutput, context: AssembleContext): AssembledModel {
  const adjustments: string[] = [];
  // The person's ids, names and types win: Claude only supplies the parameters.
  const paths = matchPaths(output.paths, context.paths).map(({ want, params }) => ({
    ...clampObject(params, want.id, adjustments),
    id: want.id,
    name: want.name,
    type: want.type,
  }));
  const baseline = clampObject(output.baseline, 'baseline', adjustments);
  const currency = String(baseline.currency ?? '')
    .trim()
    .toUpperCase();
  baseline.currency = /^[A-Z]{3}$/.test(currency) ? currency : 'USD';

  const parsed = decisionModelSchema.safeParse({
    version: 1,
    horizonMonths: context.horizonMonths,
    baseline,
    paths,
    assumptions: cleanAssumptions(output.assumptions, new Set(context.paths.map((p) => p.id))),
  });
  if (!parsed.success) {
    throw new AiError(
      'invalid_output',
      'The model Claude proposed is not valid',
      true,
      parsed.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; '),
    );
  }
  return { model: parsed.data, adjustments };
}
