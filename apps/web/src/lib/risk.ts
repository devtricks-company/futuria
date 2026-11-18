/**
 * One threshold table for "chance of running out of money": the label, the badge colour and the
 * meter all come from here, so a risk is never shown by colour alone.
 */
export type RiskLevel = 'low' | 'some' | 'high';

/** At or above: "some risk" from 5%, "high risk" from 20%. */
export const RISK_THRESHOLDS = { some: 0.05, high: 0.2 } as const;

export const RISK_LABEL: Record<RiskLevel, string> = {
  low: 'Low risk',
  some: 'Some risk',
  high: 'High risk',
};

export function riskLevel(probRunOut: number): RiskLevel {
  if (probRunOut >= RISK_THRESHOLDS.high) return 'high';
  if (probRunOut >= RISK_THRESHOLDS.some) return 'some';
  return 'low';
}
