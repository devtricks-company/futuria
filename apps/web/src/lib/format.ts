import { type FieldUnit, isFractionUnit } from '@futuria/shared';
import { formatMoney } from '@futuria/engine';

export { formatMoney };

/** 0.193 -> "19%"; tiny non-zero values show as "<1%" so a real risk never reads as zero. */
export function formatPercent(fraction: number): string {
  if (fraction > 0 && fraction < 0.005) return '<1%';
  if (fraction < 1 && fraction > 0.995) return '>99%';
  return `${Math.round(fraction * 100)}%`;
}

/** Compact money for chart axes: 18400 -> "$18k". */
export function formatMoneyCompact(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  } catch {
    return formatMoney(value, currency);
  }
}

export function formatMonths(months: number): string {
  const rounded = Math.round(months * 10) / 10;
  return `${rounded} ${rounded === 1 ? 'month' : 'months'}`;
}

/** "Month 7", or a fallback when there is no such month (e.g. never breaks even). */
export function formatMonth(month: number | null, never = 'Not within horizon'): string {
  return month === null ? never : `Month ${month}`;
}

/** A model value in its field's unit: "$4,500/mo", "22 h/week", "25%", "3 months". */
export function formatValue(value: number, unit: FieldUnit | undefined, currency: string): string {
  if (!unit) return String(Math.round(value * 100) / 100);
  const pct = isFractionUnit(unit) ? `${Math.round(value * 1000) / 10}%` : '';
  switch (unit) {
    case 'fraction':
      return pct;
    case 'fractionPerYear':
      return `${pct}/yr`;
    case 'fractionPerMonth':
      return `${pct}/mo`;
    case 'money':
      return formatMoney(value, currency);
    case 'moneyPerMonth':
      return `${formatMoney(value, currency)}/mo`;
    case 'moneyPerHour':
      return `${formatMoney(value, currency)}/h`;
    case 'hoursPerWeek':
      return `${Math.round(value * 10) / 10} h/week`;
    case 'months':
      return formatMonths(value);
    case 'month':
      return `month ${Math.round(value)}`;
  }
}
