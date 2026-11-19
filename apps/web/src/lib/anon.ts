/*
 * Anonymous visitor id (journey step 5). A signed-out visitor drafts a simulation under a random
 * id kept in an httpOnly cookie; the API proxy sends it as `x-anon-id`. After sign-up, the first
 * signed-in API call carries it once more so the API moves the drafts to the account, then the
 * proxy deletes the cookie. Only used when Clerk is enabled: without Clerk everyone is the dev
 * user and there is no signup gate.
 */
export const ANON_COOKIE = 'futuria_anon';

/** Matches the API's validation (a v1–v8 UUID). */
export const ANON_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Same lifetime as the API keeps anonymous drafts. */
const ANON_MAX_AGE_SECONDS = 14 * 24 * 60 * 60;

export const anonCookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: ANON_MAX_AGE_SECONDS,
} as const;

export function validAnonId(value: string | undefined): string | undefined {
  return value && ANON_ID_PATTERN.test(value) ? value : undefined;
}
