import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/*
 * Server-only: Plus Jakarta Sans for generated images (Satori needs TTF/OTF/WOFF, not the
 * woff2 that next/font serves). Static weights live in `assets/fonts` (SIL OFL 1.1). The paths
 * are literal so output file tracing ships the files.
 */

export interface OgFont {
  name: string;
  data: Buffer;
  weight: 400 | 700;
  style: 'normal';
}

export const OG_FONT_FAMILY = 'Plus Jakarta Sans';

let loading: Promise<OgFont[]> | null = null;

/** The fonts, read once per server process. */
export function ogFonts(): Promise<OgFont[]> {
  loading ??= Promise.all([
    readFile(join(process.cwd(), 'assets/fonts/PlusJakartaSans-Regular.ttf')),
    readFile(join(process.cwd(), 'assets/fonts/PlusJakartaSans-Bold.ttf')),
  ])
    .then(([regular, bold]): OgFont[] => [
      { name: OG_FONT_FAMILY, data: regular, weight: 400, style: 'normal' },
      { name: OG_FONT_FAMILY, data: bold, weight: 700, style: 'normal' },
    ])
    .catch((error: unknown) => {
      loading = null; // try again on the next image instead of failing forever
      throw error;
    });
  return loading;
}
