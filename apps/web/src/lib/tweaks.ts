import {
  type DecisionModel,
  type Distribution,
  type FieldUnit,
  type PathType,
  isDistribution,
  likelyValue,
  metaForField,
  scaleDistribution,
} from '@futuria/shared';
import { getField } from '@futuria/engine';
import { groupFields, setFieldValue } from './model-fields';

/*
 * "Tweak the future" sliders. Each slider moves one model value; the engine re-runs in a Web
 * Worker with the same seed, so only the change you made moves the numbers.
 *
 * - Plain numbers (savings) are set directly.
 * - Money and hours ranges are scaled: the whole range moves with the most likely value, keeping
 *   its shape ("$50–70, most likely $60" -> "$55–77, most likely $66").
 * - Month ranges are shifted by whole months ("1–5, most likely 2" -> "2–6, most likely 3").
 */

type Mode = 'set' | 'scale' | 'shift';

export interface SliderDef {
  /** "<pathId|baseline>:<field>". */
  id: string;
  pathId: string | null;
  field: string;
  label: string;
  unit: FieldUnit;
  mode: Mode;
  /** The model's current (most likely) value. */
  base: number;
  min: number;
  max: number;
  step: number;
}

export interface SliderGroup {
  pathId: string | null;
  title: string;
  sliders: SliderDef[];
}

export type TweakValues = Record<string, number>;

interface Candidate {
  field: string;
  label: string;
}

const PATH_SLIDERS: Record<PathType, Candidate[]> = {
  stay: [],
  freelance: [
    { field: 'hourlyRate', label: 'Hourly rate' },
    { field: 'billableHoursPerWeek', label: 'Billable hours per week' },
    { field: 'monthsToFirstClient', label: 'Months to first client' },
  ],
  hybrid: [
    { field: 'freelance.hourlyRate', label: 'Hourly rate' },
    { field: 'freelance.billableHoursPerWeek', label: 'Billable hours per week' },
    { field: 'freelance.monthsToFirstClient', label: 'Months to first client' },
    { field: 'transitionMonths', label: 'Months before going full-time' },
  ],
  startup: [
    { field: 'monthlyBurn', label: 'Monthly business costs' },
    { field: 'monthsToFirstRevenue', label: 'Months to first revenue' },
    { field: 'startingMrr', label: 'First monthly revenue' },
  ],
  newJob: [
    { field: 'monthsToFindJob', label: 'Months to find the job' },
    { field: 'newMonthlyNetSalary', label: 'New take-home pay' },
  ],
};

/** A step that keeps slider values readable: $25 steps for rent-sized amounts, etc. */
function niceStep(unit: FieldUnit, span: number): number {
  if (unit === 'months' || unit === 'month' || unit === 'hoursPerWeek') return 1;
  const raw = span / 100;
  for (const step of [1, 5, 10, 25, 50, 100, 250, 500, 1000, 5000]) if (raw <= step) return step;
  return 10_000;
}

function makeSlider(
  model: DecisionModel,
  pathId: string | null,
  field: string,
  label: string,
): SliderDef | null {
  const value = getField(model, pathId ?? '', field);
  const meta = metaForField(field);
  if (!meta || (typeof value !== 'number' && !isDistribution(value))) return null;
  const base = typeof value === 'number' ? value : likelyValue(value);
  const unit = meta.unit;
  let mode: Mode = typeof value === 'number' ? 'set' : unit === 'months' ? 'shift' : 'scale';
  // A range around zero can't be scaled; move it instead.
  if (mode === 'scale' && base <= 0) mode = 'shift';

  let min: number;
  let max: number;
  if (unit === 'months') {
    min = 0;
    max = Math.max(base * 2, base + 6, 6);
  } else if (unit === 'hoursPerWeek') {
    min = 0;
    max = Math.max(base * 1.5, base + 10);
  } else if (field === 'baseline.startingCash') {
    min = 0;
    max = Math.max(base * 2, 10_000);
  } else {
    min = base * 0.5;
    max = Math.max(base * 1.5, base + 100);
  }
  min = Math.max(min, meta.min);
  max = Math.min(max, meta.max);
  const step = niceStep(unit, max - min);
  return {
    id: `${pathId ?? 'baseline'}:${field}`,
    pathId,
    field,
    label,
    unit,
    mode,
    base,
    min: Math.floor(min / step) * step,
    max: Math.ceil(max / step) * step,
    step,
  };
}

export function slidersFor(model: DecisionModel): SliderGroup[] {
  const groups: SliderGroup[] = [];
  const baseline = [
    makeSlider(model, null, 'baseline.startingCash', 'Savings today'),
    makeSlider(model, null, 'baseline.monthlyExpenses', 'Monthly living expenses'),
  ].filter((s): s is SliderDef => s !== null);
  groups.push({ pathId: null, title: 'Every path', sliders: baseline });
  for (const path of model.paths) {
    const sliders = PATH_SLIDERS[path.type]
      .map((c) => makeSlider(model, path.id, c.field, c.label))
      .filter((s): s is SliderDef => s !== null);
    if (sliders.length) groups.push({ pathId: path.id, title: path.name, sliders });
  }
  return groups;
}

/** The model value a slider position stands for. */
export function tweakedValue(
  current: number | Distribution,
  slider: SliderDef,
  position: number,
): number | Distribution {
  if (typeof current === 'number' || slider.mode === 'set') return position;
  if (slider.mode === 'scale') return scaleDistribution(current, position / slider.base);
  const delta = position - slider.base;
  const floor = slider.unit === 'months' ? 0 : -Infinity;
  const shift = (n: number) => Math.max(floor, n + delta);
  return current.kind === 'fixed'
    ? { kind: 'fixed', value: shift(current.value) }
    : {
        kind: 'range',
        low: shift(current.low),
        likely: shift(current.likely),
        high: shift(current.high),
      };
}

/** Only the sliders that moved away from the model's value. */
export function activeTweaks(values: TweakValues, sliders: SliderDef[]): TweakValues {
  const out: TweakValues = {};
  for (const slider of sliders) {
    const v = values[slider.id];
    if (v !== undefined && Math.abs(v - slider.base) > 1e-9) out[slider.id] = v;
  }
  return out;
}

/**
 * Apply slider positions to a model. With `markAsUser`, the matching assumptions become the
 * person's own (used when the tweaks are saved for a new story).
 */
export function applyTweaks(
  model: DecisionModel,
  values: TweakValues,
  options: { markAsUser?: boolean } = {},
): DecisionModel {
  const sliders = slidersFor(model).flatMap((g) => g.sliders);
  const fields = options.markAsUser
    ? new Map(groupFields(model).flatMap((g) => g.fields.map((f) => [f.key, f] as const)))
    : null;
  let next = model;
  for (const slider of sliders) {
    const position = values[slider.id];
    if (position === undefined || Math.abs(position - slider.base) < 1e-9) continue;
    const current = getField(next, slider.pathId ?? '', slider.field) as number | Distribution;
    const value = tweakedValue(current, slider, position);
    const key = slider.pathId === null ? slider.field : `${slider.pathId}:${slider.field}`;
    const field = fields?.get(key);
    next = setFieldValue(
      next,
      { pathId: slider.pathId, field: slider.field, assumption: field?.assumption },
      value,
    );
  }
  return next;
}
