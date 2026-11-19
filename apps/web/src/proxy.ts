import { randomUUID } from 'node:crypto';
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { ANON_COOKIE, anonCookieOptions, validAnonId } from '@/lib/anon';
import { clerkEnabled } from '@/lib/clerk';

/** Pages that need an account (Clerk shows sign-in first). */
const isAccountPage = createRouteMatcher(['/dashboard(.*)', '/settings(.*)']);
/** The wizard: signed-out visitors draft there before the signup gate. */
const isWizardPage = createRouteMatcher(['/new(.*)']);

/*
 * Clerk allows 5 s of clock difference when it checks a session token. On a machine whose clock
 * runs behind, a token minted at sign-in looks "issued in the future", and the client-side
 * navigation back to the protected page (which Clerk can't repair with a handshake) arrives
 * signed out, so `auth.protect()` bounces the person to /sign-in again. Development tolerates a
 * drifting clock, as Clerk already does for full page loads; production keeps the strict check.
 * The API's token check does the same (apps/api/src/auth/token-verifier.service.ts).
 */
const clockSkewInMs = process.env.NODE_ENV === 'production' ? undefined : 5 * 60_000;

/*
 * With Clerk: account pages require sign-in, and a signed-out visitor who opens the wizard gets
 * an anonymous id cookie up front, so parallel API calls all use the same id (lib/anon.ts).
 * Without Clerk keys (CI, e2e tests) the proxy is a pass-through.
 */
export default clerkEnabled
  ? clerkMiddleware(
      async (auth, request) => {
        if (isAccountPage(request)) await auth.protect();
        const response = NextResponse.next();
        if (
          isWizardPage(request) &&
          !validAnonId(request.cookies.get(ANON_COOKIE)?.value) &&
          !(await auth()).userId
        ) {
          response.cookies.set(ANON_COOKIE, randomUUID(), anonCookieOptions);
        }
        return response;
      },
      { clockSkewInMs },
    )
  : () => NextResponse.next();

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
