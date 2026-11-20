import type { PathNarrative } from '@futuria/shared';
import type { NarrativeFacts } from './narrative-facts.js';

/*
 * Narrative grounding rule: the story may only state money figures that appear in the facts it
 * was given, rounded naturally. This check finds money mentions ("$11.7k", "about $600",
 * "€2,400", "USD 18,000", "$1.2 million") in the narrative and reports any that don't match a
 * fact. Used by the evals and logged at runtime.
 */

/** A number with an optional scale word: "11.7k", "1,200", "1.2 million". */
const NUMBER = String.raw`(\d[\d,]*(?:\.\d+)?)(?:\s?(k|thousand|m|mn|million)\b)?`;

/** Money mentions: a currency symbol or the model's ISO code, then a number. */
function moneyPattern(currency: string): RegExp {
  const code = /^[A-Z]{3}$/.test(currency) ? `|\\b${currency}\\s?` : '';
  return new RegExp(`(?:[$€£]${code})\\s?-?${NUMBER}`, 'gi');
}

interface ParsedNumber {
  value: number;
  /** Half of the rounding unit the text shows ("$600" -> 50, "$11.7k" -> 50). */
  tolerance: number;
}

function parseNumber(digits: string, scale: string | undefined): ParsedNumber {
  const clean = digits.replace(/,+$/, '').replace(/,/g, '');
  const multiplier = !scale
    ? 1
    : scale.toLowerCase().startsWith('k') || scale.toLowerCase() === 'thousand'
      ? 1e3
      : 1e6;
  const value = Number(clean) * multiplier;
  const [int = '', frac] = clean.split('.');
  // The rounding unit the text implies: decimals ("11.7k" -> 100), else trailing zeros of the
  // integer part ("4,300" -> 100, "600" -> 100, "31" -> 1), keeping at least one significant
  // digit. A last significant digit of 5 means rounding to fives ("5,750" -> 50).
  const zeros = frac ? 0 : Math.min(/0*$/.exec(int)![0].length, Math.max(0, int.length - 1));
  const significant = frac ?? int.slice(0, int.length - zeros);
  const step = significant.endsWith('5') ? 5 : 1;
  const unit = (frac ? step * 10 ** -frac.length : step * 10 ** zeros) * multiplier;
  // Rounded either way ("about $600" for 636) or down ("savings pass $27.7k" for 27,763): within
  // one unit, but never looser than 10% of the value (or tighter than a dollar).
  return { value, tolerance: Math.max(1, Math.min(unit, value * 0.1)) };
}

function collectNumbers(value: unknown, out: number[]): void {
  if (typeof value === 'number' && Number.isFinite(value)) {
    out.push(Math.abs(value));
  } else if (typeof value === 'string') {
    // Numbers inside fact strings (e.g. an intervention described as "save $4,200 first").
    for (const match of value.matchAll(new RegExp(NUMBER, 'gi'))) {
      const parsed = parseNumber(match[1]!, match[2]);
      out.push(parsed.value, Number(match[1]!.replace(/,/g, '')));
    }
  } else if (Array.isArray(value)) {
    for (const item of value) collectNumbers(item, out);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectNumbers(item, out);
  }
}

function narrativeTexts(narrative: PathNarrative): string[] {
  const texts: string[] = [];
  for (const milestones of Object.values(narrative.scenarios)) {
    for (const m of milestones) {
      texts.push(m.headline, ...m.events, ...m.opportunities, ...m.challenges, ...m.risks);
    }
  }
  for (const action of narrative.actionPlan) texts.push(action.title, action.why, ...action.steps);
  return texts;
}

/** Money figures in the narrative that don't match any number in the facts (after rounding). */
export function ungroundedFigures(narrative: PathNarrative, facts: NarrativeFacts): string[] {
  const allowed: number[] = [];
  collectNumbers(facts, allowed);

  const problems: string[] = [];
  const pattern = moneyPattern(facts.currency);
  for (const text of narrativeTexts(narrative)) {
    for (const match of text.matchAll(pattern)) {
      const { value, tolerance } = parseNumber(match[1]!, match[2]);
      if (!allowed.some((a) => Math.abs(a - value) <= tolerance)) {
        problems.push(match[0].trim().replace(/,+$/, ''));
      }
    }
  }
  return problems;
}
