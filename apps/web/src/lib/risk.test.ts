import { describe, expect, it } from 'vitest';
import { RISK_LABEL, riskLevel } from './risk';

describe('riskLevel', () => {
  it('is low below 5%', () => {
    expect(riskLevel(0)).toBe('low');
    expect(riskLevel(0.049)).toBe('low');
  });

  it('is "some" from 5% up to 20%', () => {
    expect(riskLevel(0.05)).toBe('some');
    expect(riskLevel(0.193)).toBe('some');
  });

  it('is high from 20%', () => {
    expect(riskLevel(0.2)).toBe('high');
    expect(riskLevel(1)).toBe('high');
  });

  it('has a label for every level', () => {
    expect(RISK_LABEL[riskLevel(0.36)]).toBe('High risk');
  });
});
