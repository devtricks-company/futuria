/*
 * Product analytics (PostHog) settings and privacy filters. Pure, so the browser setup
 * (instrumentation-client.ts), the /ingest relay and the tests share them.
 *
 * Analytics is off unless NEXT_PUBLIC_POSTHOG_KEY is set: no script runs, nothing is sent, and
 * the relay answers 404. Events go through our own /ingest relay (ad blockers, and no third-party
 * cookies), which forwards only what PostHog needs: never the Clerk session.
 */

export type PosthogRegion = 'us' | 'eu';

export interface AnalyticsConfig {
  /** The PostHog project API key (phc_...), or null: analytics off. */
  key: string | null;
  /** Where the relay forwards events and where static assets come from. */
  apiHost: string;
  assetsHost: string;
  /** The PostHog app, for links in the toolbar. */
  uiHost: string;
}

export function analyticsConfig(env: { key?: string; region?: string }): AnalyticsConfig {
  const region: PosthogRegion = env.region?.trim().toLowerCase() === 'eu' ? 'eu' : 'us';
  return {
    key: env.key?.trim() || null,
    apiHost: `https://${region}.i.posthog.com`,
    assetsHost: `https://${region}-assets.i.posthog.com`,
    uiHost: `https://${region}.posthog.com`,
  };
}

// Literal references: Next inlines NEXT_PUBLIC_ variables at build time.
export const ANALYTICS = analyticsConfig({
  key: process.env.NEXT_PUBLIC_POSTHOG_KEY,
  region: process.env.NEXT_PUBLIC_POSTHOG_REGION,
});

/** Same-origin path the browser sends events to (app/ingest/[...path]/route.ts). */
export const RELAY_PATH = '/ingest';

/**
 * Query parameters that never leave the browser: `q` carries the decision text from the landing
 * form (`/new?q=...`), `session_id` the Stripe Checkout session.
 */
export const PRIVATE_PARAMS = ['q', 'session_id'] as const;

/** A URL without its private parameters; anything that isn't a URL comes back unchanged. */
export function stripPrivateParams(value: string): string {
  if (!/^(?:https?:\/\/|\/)/.test(value)) return value;
  if (!PRIVATE_PARAMS.some((p) => value.includes(`${p}=`))) return value;
  let url: URL;
  try {
    url = new URL(value, 'http://relative.invalid');
  } catch {
    return value;
  }
  for (const p of PRIVATE_PARAMS) url.searchParams.delete(p);
  if (url.origin === 'http://relative.invalid') return `${url.pathname}${url.search}${url.hash}`;
  return url.toString();
}

type Properties = Record<string, unknown>;

function cleanProperties(props: Properties | undefined): Properties | undefined {
  if (!props) return props;
  const out: Properties = {};
  for (const [key, value] of Object.entries(props)) {
    out[key] = typeof value === 'string' ? stripPrivateParams(value) : value;
  }
  return out;
}

/**
 * PostHog's `before_send`: strips private parameters from every URL-like property (current URL,
 * referrer, initial URL, person properties).
 */
export function sanitizeEvent<
  T extends { properties?: Properties; $set?: Properties; $set_once?: Properties },
>(event: T | null): T | null {
  if (!event) return event;
  return {
    ...event,
    properties: cleanProperties(event.properties),
    ...(event.$set ? { $set: cleanProperties(event.$set) } : {}),
    ...(event.$set_once ? { $set_once: cleanProperties(event.$set_once) } : {}),
  };
}

/** How recently an account must have been created for this visit to count as its sign-up. */
export const SIGNUP_WINDOW_MS = 15 * 60_000;

/** Whether an account created at `createdAt` was created just now (this visit's sign-up). */
export function isNewSignup(
  createdAt: Date | null | undefined,
  now: Date = new Date(),
  windowMs = SIGNUP_WINDOW_MS,
): boolean {
  if (!createdAt) return false;
  const age = now.getTime() - createdAt.getTime();
  return age >= -60_000 && age <= windowMs;
}

/** Request headers the relay forwards to PostHog. Nothing else: no cookies, no auth. */
export const RELAY_REQUEST_HEADERS = ['content-type', 'user-agent', 'accept'] as const;

/** Where the relay sends `/ingest/<path>`: static assets and events live on different hosts. */
export function relayTarget(path: string[], search: string, config: AnalyticsConfig): URL {
  const host = path[0] === 'static' ? config.assetsHost : config.apiHost;
  const url = new URL(`/${path.map(encodeURIComponent).join('/')}`, host);
  url.search = search;
  return url;
}
