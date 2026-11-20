import { cache } from 'react';
import { type ShareViewDto, shareSlugSchema } from '@futuria/shared';
import { backendFetch } from './backend';

/*
 * Server-only: share pages and their metadata read a share link's public view from the API.
 */

export type ShareLookup = ShareViewDto | { status: 'missing' } | { status: 'unavailable' };

/**
 * A share link's public view, fetched once per render (React `cache`) for the page and its
 * metadata. It is never cached across requests, so turning sharing off takes effect at once.
 * The slug is validated before it goes into a URL: `new URL('/share/' + slug)` collapses "..",
 * which could reach other API routes. No identity is sent; the API route is public.
 */
export const getShare = cache(async (slug: string): Promise<ShareLookup> => {
  if (!shareSlugSchema.safeParse(slug).success) return { status: 'missing' };
  let res: Response;
  try {
    res = await backendFetch(`/share/${slug}`, { token: null });
  } catch {
    return { status: 'unavailable' };
  }
  if (res.status === 404 || res.status === 400) return { status: 'missing' };
  if (!res.ok) return { status: 'unavailable' };
  return (await res.json()) as ShareViewDto;
});
