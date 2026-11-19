import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

/*
 * Crawl the public pages; skip the app itself. Shared pages (/share/...) are NOT disallowed:
 * link-preview bots (X, LinkedIn...) obey robots.txt, and the cards must render. They carry a
 * noindex tag instead, so search engines don't list someone's decision.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/ingest/',
        '/new',
        '/s/',
        '/dashboard',
        '/settings',
        '/sign-in',
        '/sign-up',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
