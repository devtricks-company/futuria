import { SeoLanding, seoMetadata } from '@/components/landing/seo-landing';
import { SEO_PAGES } from '@/lib/seo-pages';

const page = SEO_PAGES.freelance;

export const metadata = seoMetadata(page);

export default function Page() {
  return <SeoLanding page={page} />;
}
