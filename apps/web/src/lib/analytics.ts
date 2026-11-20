import posthog from 'posthog-js';
import { ANALYTICS } from './analytics-config';

/*
 * Product analytics events (client side). Every call is a no-op unless analytics is on
 * (NEXT_PUBLIC_POSTHOG_KEY). Events carry plan names, counts and flags, never decision text,
 * amounts, names or emails. People are identified by their Clerk user id only.
 */

/** The growth funnel, in order (docs/ROADMAP.md, Phase 6). */
export const FUNNEL_EVENTS = [
  'landing_viewed',
  'intake_started',
  'model_reviewed',
  'signed_up',
  'results_viewed',
  'shared',
  'upgraded',
] as const;
export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];

/** Outside the funnel: what shared pages and reports do for growth. */
export type AnalyticsEvent = FunnelEvent | 'share_viewed' | 'share_link_copied' | 'pdf_exported';

export type EventProperties = Record<string, string | number | boolean | null | undefined>;

const enabled = () => ANALYTICS.key !== null && typeof window !== 'undefined';

export function track(event: AnalyticsEvent, properties?: EventProperties): void {
  if (enabled()) posthog.capture(event, properties);
}

/** Tie this browser's events (including those from before sign-up) to the account. */
export function identify(userId: string): void {
  if (enabled() && posthog.get_distinct_id() !== userId) posthog.identify(userId);
}

/** Signed out: later events in this browser belong to a new anonymous visitor. */
export function resetIdentity(): void {
  if (enabled()) posthog.reset();
}

/** `?ref=share` and the like: where a visit came from inside FUTURIA. */
export function refParam(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return new URLSearchParams(window.location.search).get('ref') ?? undefined;
}
