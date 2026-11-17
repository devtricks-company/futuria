'use client';

import { useState } from 'react';
import { type Distribution, type FieldMeta, isDistribution, isFractionUnit } from '@futuria/shared';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { formatValue } from '@/lib/format';
import { type FieldValue, validateValue } from '@/lib/model-fields';

/** "low – high (most likely x)" or a single value, in the field's unit. */
export function describeValue(value: FieldValue, meta: FieldMeta | undefined, currency: string) {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string') return value;
  const fmt = (n: number) => formatValue(n, meta?.unit, currency);
  if (typeof value === 'number') return fmt(value);
  if (value.kind === 'fixed') return fmt(value.value);
  return `${fmt(value.low)} – ${fmt(value.high)} (most likely ${fmt(value.likely)})`;
}

type Points = { low: string; likely: string; high: string };

const toText = (n: number, scale: number) => String(Math.round(n * scale * 1e6) / 1e6);

/**
 * Edit one model value: a number, a known value or a range (low / most likely / high), a flag,
 * or the currency code. Fractions are edited as percentages.
 */
export function ValueEditor({
  idPrefix,
  value,
  meta,
  onSave,
  onCancel,
}: {
  idPrefix: string;
  value: FieldValue;
  meta: FieldMeta | undefined;
  onSave: (value: FieldValue) => void;
  onCancel: () => void;
}) {
  const scale = meta && isFractionUnit(meta.unit) ? 100 : 1;
  const unitSuffix = scale === 100 ? '%' : '';
  const dist = isDistribution(value) ? value : null;
  const [isRange, setIsRange] = useState(dist?.kind === 'range');
  const [points, setPoints] = useState<Points>(() => {
    if (!dist) {
      const n = typeof value === 'number' ? toText(value, scale) : '';
      return { low: n, likely: n, high: n };
    }
    if (dist.kind === 'fixed') {
      const n = toText(dist.value, scale);
      return { low: n, likely: n, high: n };
    }
    return {
      low: toText(dist.low, scale),
      likely: toText(dist.likely, scale),
      high: toText(dist.high, scale),
    };
  });
  const [flag, setFlag] = useState(value === true);
  const [code, setCode] = useState(typeof value === 'string' ? value : '');
  const [error, setError] = useState<string | null>(null);

  const parse = (text: string) => Number(text.replace(/[,\s]/g, '')) / scale;

  function build(): FieldValue {
    if (typeof value === 'boolean') return flag;
    if (typeof value === 'string') return code.trim().toUpperCase();
    if (!dist) return parse(points.likely);
    if (!isRange) return { kind: 'fixed', value: parse(points.likely) } satisfies Distribution;
    return {
      kind: 'range',
      low: parse(points.low),
      likely: parse(points.likely),
      high: parse(points.high),
    } satisfies Distribution;
  }

  function save() {
    const next = build();
    const problem = validateValue(next, meta);
    setError(problem);
    if (!problem) onSave(next);
  }

  const numberInput = (key: keyof Points, label: string) => (
    <div className="flex flex-1 flex-col gap-1">
      <Label htmlFor={`${idPrefix}-${key}`} className="text-xs text-muted">
        {label}
        {unitSuffix ? ` (${unitSuffix})` : ''}
      </Label>
      <Input
        id={`${idPrefix}-${key}`}
        inputMode="decimal"
        value={points[key]}
        onChange={(e) => setPoints((p) => ({ ...p, [key]: e.target.value }))}
        aria-invalid={error ? true : undefined}
      />
    </div>
  );

  return (
    <div
      className="flex flex-col gap-3 rounded-xl border border-border bg-surface-muted/60 p-3"
      onKeyDown={(event) => {
        if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
          event.preventDefault();
          save();
        }
        if (event.key === 'Escape') onCancel();
      }}
    >
      {typeof value === 'boolean' ? (
        <label className="flex items-center gap-3 text-sm">
          <Switch checked={flag} onCheckedChange={setFlag} />
          {flag ? 'Yes' : 'No'}
        </label>
      ) : typeof value === 'string' ? (
        <div className="flex max-w-40 flex-col gap-1">
          <Label htmlFor={`${idPrefix}-code`} className="text-xs text-muted">
            Currency code
          </Label>
          <Input
            id={`${idPrefix}-code`}
            value={code}
            maxLength={3}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            aria-invalid={error ? true : undefined}
          />
        </div>
      ) : (
        <>
          {dist ? (
            <label className="flex items-center gap-3 text-sm">
              <Switch checked={isRange} onCheckedChange={setIsRange} />
              {isRange ? 'Uncertain: a range' : 'Known: a single value'}
            </label>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            {isRange ? (
              <>
                {numberInput('low', 'Low')}
                {numberInput('likely', 'Most likely')}
                {numberInput('high', 'High')}
              </>
            ) : (
              numberInput('likely', 'Value')
            )}
          </div>
        </>
      )}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div className="flex gap-2">
        <Button size="sm" onClick={save}>
          Done
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
