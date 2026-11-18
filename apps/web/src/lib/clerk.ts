/**
 * Clerk is optional until Phase 5: without a publishable key the app runs without sign-in UI and
 * the API proxy uses the dev identity (the API must then run in AUTH_MODE=dev). CI and the
 * Playwright tests run this way.
 */
export const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
