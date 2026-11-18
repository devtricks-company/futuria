'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';

/** How long a client navigation may take before we fall back to a full page load. */
const FALLBACK_MS = 2500;

/**
 * Navigate away from the current page after a server-side change (a new simulation, a queued
 * run) and make sure it happens.
 *
 * A concurrent `router.refresh()` can swallow a pending `router.push()`: Clerk refreshes the router
 * when its script finishes loading on a fresh page, so a fast step could leave the person on a
 * spinner forever. The calling component belongs to the page being left, so if it is still
 * mounted shortly after, the navigation didn't happen: do a full page load instead.
 */
export function useNavigate(): (href: string, options?: { replace?: boolean }) => void {
  const router = useRouter();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return useCallback(
    (href, options) => {
      if (options?.replace) router.replace(href);
      else router.push(href);
      window.setTimeout(() => {
        if (!mounted.current) return;
        if (options?.replace) window.location.replace(href);
        else window.location.assign(href);
      }, FALLBACK_MS);
    },
    [router],
  );
}
