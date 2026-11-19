import type { Metadata } from 'next';
import { Suspense } from 'react';
import {
  ShareMissing,
  ShareUnavailable,
  ShareUpdating,
  ShareView,
} from '@/components/share/share-view';
import { Skeleton } from '@/components/ui/skeleton';
import { getShare } from '@/lib/share';
import { shareDescription } from '@/lib/share-view';

/*
 * A shared simulation: public, read-only, never indexed (it's someone's personal decision), but
 * readable by link-preview bots so the social card shows.
 */
const NOT_INDEXED: Metadata['robots'] = { index: false, follow: false };

export async function generateMetadata({ params }: PageProps<'/share/[slug]'>): Promise<Metadata> {
  const share = await getShare((await params).slug);
  if (share.status !== 'ready') {
    return { title: 'Shared simulation', robots: NOT_INDEXED };
  }
  const title = `${share.paths.length} possible futures: ${share.title}`;
  const description = shareDescription(share);
  return {
    title,
    description,
    robots: NOT_INDEXED,
    openGraph: { type: 'article', title, description, siteName: 'FUTURIA' },
    twitter: { card: 'summary_large_image', title, description },
  };
}

async function SharedSimulation({ slug }: { slug: string }) {
  const share = await getShare(slug);
  switch (share.status) {
    case 'ready':
      return <ShareView share={share} />;
    case 'updating':
      return <ShareUpdating title={share.title} />;
    case 'missing':
      return <ShareMissing />;
    case 'unavailable':
      return <ShareUnavailable />;
  }
}

export default function SharePage({ params }: PageProps<'/share/[slug]'>) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <Suspense fallback={<Skeleton className="h-96" />}>
        {params.then(({ slug }) => (
          <SharedSimulation slug={slug} />
        ))}
      </Suspense>
    </main>
  );
}
