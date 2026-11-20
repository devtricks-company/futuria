/**
 * The site's public origin, for absolute URLs in metadata: social cards, canonical links and the
 * sitemap. Set `NEXT_PUBLIC_SITE_URL` in production, and to the tunnel URL when testing link
 * previews locally (it is read at build time).
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(
  /\/+$/,
  '',
);

/** "futuria.app" (or "localhost:3000"), for watermarks and footers on images. */
export function siteHost(): string {
  return new URL(SITE_URL).host;
}
