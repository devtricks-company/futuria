/*
 * Pure helpers for generated images (social cards, PDF charts).
 */

/** Maps a box onto another: x' = x * sx + dx, y' = y * sy + dy. */
export interface Fit {
  sx: number;
  sy: number;
  dx: number;
  dy: number;
}

/** Fits a `width` x `height` viewBox into a box, leaving `pad` units on every side. */
export function fitBox(
  from: { width: number; height: number },
  to: { width: number; height: number },
  pad = 0,
): Fit {
  return {
    sx: (to.width - 2 * pad) / from.width,
    sy: (to.height - 2 * pad) / from.height,
    dx: pad,
    dy: pad,
  };
}

/**
 * Rescales SVG path data made of absolute M/L commands ("M0 216L100 200…", as built by
 * `futuresChart`). Scaling the data instead of the drawing keeps strokes even, so a chart can
 * fill any box.
 */
export function scalePath(d: string, { sx, sy, dx, dy }: Fit): string {
  return d.replace(
    /([ML])(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g,
    (_, cmd: string, x: string, y: string) =>
      `${cmd}${round(Number(x) * sx + dx)} ${round(Number(y) * sy + dy)}`,
  );
}

const round = (v: number) => Math.round(v * 10) / 10;

/** Shortens text to `max` characters at a word boundary, with an ellipsis. */
export function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, '')}…`;
}
