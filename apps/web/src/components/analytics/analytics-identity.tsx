'use client';

import { useUser } from '@clerk/nextjs';
import { useEffect, useRef } from 'react';
import { identify, resetIdentity, track } from '@/lib/analytics';
import { ANALYTICS, isNewSignup } from '@/lib/analytics-config';

const signupFlag = (userId: string) => `futuria-signup-tracked:${userId}`;

function once(key: string): boolean {
  try {
    if (window.localStorage.getItem(key)) return false;
    window.localStorage.setItem(key, '1');
    return true;
  } catch {
    return true;
  }
}

/**
 * Ties analytics to the signed-in account (Clerk user id only) and records `signed_up` on the
 * visit an account is created. Mounted inside ClerkProvider, only when Clerk is on.
 */
export function AnalyticsIdentity() {
  const { isLoaded, user } = useUser();
  const identified = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !ANALYTICS.key) return;
    if (user) {
      if (identified.current === user.id) return;
      identified.current = user.id;
      identify(user.id);
      if (isNewSignup(user.createdAt) && once(signupFlag(user.id))) track('signed_up');
    } else if (identified.current) {
      identified.current = null;
      resetIdentity();
    }
  }, [isLoaded, user]);

  return null;
}
