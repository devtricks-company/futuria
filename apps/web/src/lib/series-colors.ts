/**
 * The categorical chart palette of `globals.css` (`--series-1..8`), as hex for renderers that
 * can't read CSS variables: social cards (Satori) and PDF reports. A path's colour follows its
 * position in the model. `series-colors.test.ts` keeps this in sync with the stylesheet.
 */
export const SERIES_HEX = {
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#0ca30c', '#9085e9', '#e66767'],
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
} as const;

export function seriesHex(index: number, theme: keyof typeof SERIES_HEX = 'dark'): string {
  const palette = SERIES_HEX[theme];
  return palette[((index % palette.length) + palette.length) % palette.length]!;
}
