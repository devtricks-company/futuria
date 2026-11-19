import { ImageResponse } from 'next/og';
import { SARA_MODEL, decisionModelSchema } from '@futuria/shared';
import { futuresChart, simulate } from '@futuria/engine';
import { BrandCard, OG_SIZE } from '@/components/og/og-cards';
import { DEMO_SEED } from '@/lib/demo';
import { ogFonts } from '@/lib/og-fonts';
import { siteHost } from '@/lib/site';

/*
 * The site's link preview (landing page and every page without its own card): Sara's simulated
 * futures, the same ones as the landing hero. Built once, at build time.
 */
export const alt = 'FUTURIA: play out a career move before you make it';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image() {
  const model = decisionModelSchema.parse(SARA_MODEL);
  const result = simulate(model, { seed: DEMO_SEED });
  const chart = futuresChart(model, result, { seed: DEMO_SEED, runsPerPath: 32, hideMoney: true });
  return new ImageResponse(<BrandCard chart={chart} host={siteHost()} />, {
    ...size,
    fonts: await ogFonts(),
  });
}
