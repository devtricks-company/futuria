import { describe, expect, it } from 'vitest';
import { clip, fitBox, scalePath } from './og';

describe('scalePath', () => {
  it('maps every point into the target box', () => {
    const fit = fitBox({ width: 1200, height: 400 }, { width: 600, height: 300 }, 10);
    expect(scalePath('M0 0L1200 400', fit)).toBe('M10 10L590 290');
  });

  it('handles several subpaths and negative values', () => {
    const fit = { sx: 0.5, sy: 2, dx: 0, dy: 0 };
    expect(scalePath('M0 -10L100 20M0 5L50 5', fit)).toBe('M0 -20L50 40M0 10L25 10');
  });
});

describe('clip', () => {
  it('keeps short text', () => {
    expect(clip('  Freelance   or stay? ', 40)).toBe('Freelance or stay?');
  });

  it('cuts long text at a word boundary', () => {
    expect(clip('Should I quit my job to become a freelance UX designer next year?', 30)).toBe(
      'Should I quit my job to…',
    );
  });
});
