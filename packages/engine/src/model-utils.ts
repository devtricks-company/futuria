import {
  type DecisionModel,
  type Distribution,
  type PathConfig,
  isDistribution,
} from '@futuria/shared';

const PATH_META_KEYS = new Set(['id', 'name', 'type']);
export const BASELINE_PREFIX = 'baseline.';

export function cloneModel(model: DecisionModel): DecisionModel {
  return structuredClone(model);
}

export function findPath(model: DecisionModel, pathId: string): PathConfig {
  const path = model.paths.find((p) => p.id === pathId);
  if (!path) throw new Error(`Unknown path id "${pathId}"`);
  return path;
}

function resolve(
  model: DecisionModel,
  pathId: string,
  field: string,
): [Record<string, unknown>, string] {
  let target: Record<string, unknown>;
  let rest: string;
  if (field.startsWith(BASELINE_PREFIX)) {
    target = model.baseline as unknown as Record<string, unknown>;
    rest = field.slice(BASELINE_PREFIX.length);
  } else {
    target = findPath(model, pathId) as unknown as Record<string, unknown>;
    rest = field;
  }
  const parts = rest.split('.');
  for (const part of parts.slice(0, -1)) {
    const next = target[part];
    if (typeof next !== 'object' || next === null) {
      throw new Error(`Field "${field}" does not exist on path "${pathId}"`);
    }
    target = next as Record<string, unknown>;
  }
  return [target, parts[parts.length - 1]!];
}

/** Read a field by dot path. Baseline fields use the "baseline." prefix. */
export function getField(model: DecisionModel, pathId: string, field: string): unknown {
  const [target, key] = resolve(model, pathId, field);
  return target[key];
}

/** Return a copy of the model with one field replaced. */
export function withField(
  model: DecisionModel,
  pathId: string,
  field: string,
  value: unknown,
): DecisionModel {
  const copy = cloneModel(model);
  const [target, key] = resolve(copy, pathId, field);
  if (!(key in target)) throw new Error(`Field "${field}" does not exist on path "${pathId}"`);
  target[key] = value;
  return copy;
}

function isUncertain(value: unknown): value is Distribution & { kind: 'range' } {
  return isDistribution(value) && value.kind === 'range' && value.low !== value.high;
}

/** Every range-valued input that affects a path, as field paths (for sensitivity analysis). */
export function uncertainFields(model: DecisionModel, pathId: string): string[] {
  const fields: string[] = [];
  for (const [key, value] of Object.entries(model.baseline)) {
    if (isUncertain(value)) fields.push(`${BASELINE_PREFIX}${key}`);
  }
  const walk = (obj: Record<string, unknown>, prefix: string) => {
    for (const [key, value] of Object.entries(obj)) {
      if (!prefix && PATH_META_KEYS.has(key)) continue;
      if (isUncertain(value)) fields.push(`${prefix}${key}`);
      else if (typeof value === 'object' && value !== null && !isDistribution(value)) {
        walk(value as Record<string, unknown>, `${prefix}${key}.`);
      }
    }
  };
  walk(findPath(model, pathId) as unknown as Record<string, unknown>, '');
  return fields;
}

export function formatMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${Math.round(value).toLocaleString('en-US')} ${currency}`;
  }
}
