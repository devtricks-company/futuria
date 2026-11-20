import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SERIES_HEX, seriesHex } from './series-colors';

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

/** `--series-1..8` in the order they appear: the dark theme (:root) first, then light. */
function stylesheetSeries(): string[][] {
  const values = [...css.matchAll(/--series-(\d): (#[0-9a-f]{6});/gi)].map((m) => m[2]!);
  return [values.slice(0, 8), values.slice(8, 16)];
}

describe('series colours', () => {
  it('match the stylesheet in both themes', () => {
    const [dark, light] = stylesheetSeries();
    expect(SERIES_HEX.dark).toEqual(dark);
    expect(SERIES_HEX.light).toEqual(light);
  });

  it('wrap around after eight paths', () => {
    expect(seriesHex(0)).toBe('#3987e5');
    expect(seriesHex(8)).toBe('#3987e5');
    expect(seriesHex(1, 'light')).toBe('#eb6834');
  });
});
