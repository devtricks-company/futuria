import type { MetadataRoute } from 'next';
import { SEO_PAGE_LIST } from '@/lib/seo-pages';
import { SITE_URL } from '@/lib/site';

/** The public pages worth finding: the landing page and the search landing pages. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: 'weekly', priority: 1 },
    ...SEO_PAGE_LIST.map((page) => ({
      url: `${SITE_URL}/${page.slug}`,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
  ];
}
