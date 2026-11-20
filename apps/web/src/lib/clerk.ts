/**
 * Clerk is optional: without a publishable key the app runs without sign-in UI and the API proxy
 * uses the dev identity (the API must then run in AUTH_MODE=dev). CI and the Playwright tests run
 * this way. NEXT_PUBLIC_CLERK_DISABLED=1 forces it off even when .env.local has keys
 * (`pnpm --filter @futuria/web build:e2e`).
 */
export const clerkEnabled =
  Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) &&
  process.env.NEXT_PUBLIC_CLERK_DISABLED !== '1';
