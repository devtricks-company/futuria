import {
  type Assumption,
  type DecisionModel,
  type Distribution,
  type FieldMeta,
  type PathType,
  isDistribution,
  isFractionUnit,
  labelForField,
  metaForField,
} from '@futuria/shared';
import { withField } from '@futuria/engine';

/*
 * The assumptions review lists every editable model value, grouped by baseline and path, with
 * the assumption Claude (or the person) attached to it. Assumptions carry a free-text `field`
 * that Claude writes, so matching is lenient: exact path first, then a unique last segment.
 */

/** Numbers, distributions, flags, and the baseline currency code. */
export type FieldValue = number | Distribution | boolean | string;

export interface ModelField {
  /** Unique within the model: "baseline.startingCash" or "<pathId>:freelance.hourlyRate". */
  key: string;
  /** Null for baseline fields. */
  pathId: string | null;
  /** Engine field path: "baseline.startingCash", "hourlyRate", "freelance.hourlyRate". */
  field: string;
  label: string;
  value: FieldValue;
  meta: FieldMeta | undefined;
  assumption: Assumption | undefined;
}

export interface FieldGroup {
  pathId: string | null;
  title: string;
  type: PathType | null;
  fields: ModelField[];
  /** Assumptions that don't match any field: shown as notes. */
  notes: Assumption[];
}

const PATH_META_KEYS = new Set(['id', 'name', 'type']);
const BASELINE = 'baseline.';

function isFieldValue(value: unknown): value is FieldValue {
  return (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'string' ||
    isDistribution(value)
  );
}

function collect(obj: Record<string, unknown>, prefix: string, out: [string, FieldValue][]) {
  for (const [key, value] of Object.entries(obj)) {
    if (!prefix && PATH_META_KEYS.has(key)) continue;
    if (isFieldValue(value)) out.push([`${prefix}${key}`, value]);
    else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      collect(value as Record<string, unknown>, `${prefix}${key}.`, out);
    }
  }
}

const lastSegment = (field: string) => field.split('.').pop() ?? field;

/** Attach each assumption to at most one field; the rest become notes. */
function attach(
  fields: ModelField[],
  assumptions: Assumption[],
  isBaseline: boolean,
): Assumption[] {
  const notes: Assumption[] = [];
  for (const a of assumptions) {
    let wanted = a.field.trim();
    if (isBaseline && !wanted.startsWith(BASELINE)) wanted = `${BASELINE}${wanted}`;
    if (!isBaseline && wanted.startsWith(BASELINE)) wanted = wanted.slice(BASELINE.length);
    let match = fields.find((f) => f.field === wanted);
    if (!match) {
      const byLast = fields.filter((f) => lastSegment(f.field) === lastSegment(wanted));
      if (byLast.length === 1) match = byLast[0];
    }
    if (match && !match.assumption) match.assumption = a;
    else notes.push(a);
  }
  return notes;
}

function makeField(pathId: string | null, field: string, value: FieldValue): ModelField {
  return {
    key: pathId === null ? field : `${pathId}:${field}`,
    pathId,
    field,
    label: field === 'baseline.currency' ? 'Currency' : labelForField(field),
    value,
    meta: metaForField(field),
    assumption: undefined,
  };
}

export function groupFields(model: DecisionModel): FieldGroup[] {
  const groups: FieldGroup[] = [];

  const baselineValues: [string, FieldValue][] = [];
  collect(model.baseline as unknown as Record<string, unknown>, BASELINE, baselineValues);
  const baselineFields = baselineValues.map(([field, value]) => makeField(null, field, value));
  // A baseline assumption may also carry a pathId Claude couldn't resolve (the API nulls it).
  const baselineNotes = attach(
    baselineFields,
    model.assumptions.filter((a) => a.pathId === null),
    true,
  );
  groups.push({
    pathId: null,
    title: 'Your starting point',
    type: null,
    fields: baselineFields,
    notes: baselineNotes,
  });

  for (const path of model.paths) {
    const values: [string, FieldValue][] = [];
    collect(path as unknown as Record<string, unknown>, '', values);
    const fields = values.map(([field, value]) => makeField(path.id, field, value));
    const notes = attach(
      fields,
      model.assumptions.filter((a) => a.pathId === path.id),
      false,
    );
    groups.push({ pathId: path.id, title: path.name, type: path.type, fields, notes });
  }
  return groups;
}

/**
 * Set one value and mark its assumption as the person's own. Returns a new model.
 */
export function setFieldValue(
  model: DecisionModel,
  target: Pick<ModelField, 'pathId' | 'field' | 'assumption'>,
  value: FieldValue,
): DecisionModel {
  const next = withField(model, target.pathId ?? '', target.field, value);
  if (target.assumption) {
    const id = target.assumption.id;
    next.assumptions = next.assumptions.map((a) =>
      a.id === id ? { ...a, source: 'user' as const } : a,
    );
  }
  return next;
}

/** A problem with a value, or null if it is usable. */
export function validateValue(value: FieldValue, meta: FieldMeta | undefined): string | null {
  if (typeof value === 'boolean') return null;
  if (typeof value === 'string') {
    return /^[A-Z]{3}$/.test(value) ? null : 'Use a 3-letter currency code such as USD';
  }
  const points = typeof value === 'number' ? [value] : distributionPoints(value);
  if (points.some((p) => !Number.isFinite(p))) return 'Enter a number';
  if (isDistribution(value) && value.kind === 'range') {
    if (!(value.low <= value.likely && value.likely <= value.high)) {
      return 'Keep low ≤ most likely ≤ high';
    }
  }
  if (meta) {
    const scale = isFractionUnit(meta.unit) ? 100 : 1;
    const fmt = (n: number) => `${Math.round(n * scale * 100) / 100}${scale === 100 ? '%' : ''}`;
    if (points.some((p) => p < meta.min || p > meta.max)) {
      return `Use a value between ${fmt(meta.min)} and ${fmt(meta.max)}`;
    }
  }
  return null;
}

function distributionPoints(d: Distribution): number[] {
  return d.kind === 'fixed' ? [d.value] : [d.low, d.likely, d.high];
}

/** How many values in the model are AI estimates the person hasn't confirmed or changed. */
export function countEstimates(groups: FieldGroup[]): number {
  return groups.reduce(
    (sum, g) => sum + g.fields.filter((f) => f.assumption?.source === 'ai_estimate').length,
    0,
  );
}
