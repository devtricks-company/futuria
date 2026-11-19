import { ImageResponse } from 'next/og';
import { BrandCard, OG_SIZE, ShareCard } from '@/components/og/og-cards';
import { ogFonts } from '@/lib/og-fonts';
import { getShare } from '@/lib/share';
import { siteHost } from '@/lib/site';

/*
 * The "My 3 futures" link preview of a shared simulation. Rendered per request (it reads the
 * share), so turning sharing off also stops the card. No amounts, ever; Free plans get a
 * watermark. No `runtime` export and no generateStaticParams: Cache Components needs neither.
 */
export const alt = 'Simulated futures of a career decision, made with FUTURIA';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const [share, fonts] = await Promise.all([getShare((await params).slug), ogFonts()]);
  const host = siteHost();
  const card =
    share.status === 'ready' ? (
      <ShareCard share={share} host={host} />
    ) : (
      <BrandCard
        chart={null}
        title={share.status === 'updating' ? share.title : 'A simulated career decision'}
        subtitle={
          share.status === 'updating'
            ? 'This simulation is being updated.'
            : 'See your own futures before you decide.'
        }
        host={host}
      />
    );
  return new ImageResponse(card, { ...size, fonts });
}
