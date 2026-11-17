import { costUsd } from './pricing.js';
import { fixtureKey, stableStringify } from './fixture-store.js';

describe('costUsd', () => {
  const usage = {
    inputTokens: 1_000_000,
    outputTokens: 100_000,
    cacheReadInputTokens: 1_000_000,
    cacheCreationInputTokens: 0,
  };

  it('prices Opus 5.5 from list prices, including cache reads', () => {
    expect(costUsd('claude-opus-5-5', usage)).toBeCloseTo(4 + 2 + 0.2, 6);
  });

  it('recognizes gateway-prefixed ids and returns null for unknown models', () => {
    expect(costUsd('anthropic/claude-opus-5-5', usage)).toBeCloseTo(6.2, 6);
    expect(costUsd('anthropic/claude-opus-5', usage)).toBeCloseTo(5 + 2.5 + 0.5, 6);
    expect(costUsd('some-other-model', usage)).toBeNull();
  });
});

describe('fixture keys', () => {
  it('ignore key order and undefined values', () => {
    expect(stableStringify({ b: 1, a: [{ d: 2, c: undefined }] })).toBe('{"a":[{"d":2}],"b":1}');
    expect(fixtureKey('intake', { a: 1, b: 2 })).toBe(fixtureKey('intake', { b: 2, a: 1 }));
    expect(fixtureKey('intake', { a: 1 })).not.toBe(fixtureKey('model', { a: 1 }));
  });
});
