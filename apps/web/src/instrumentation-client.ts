import posthog from 'posthog-js';
import { ANALYTICS, RELAY_PATH, sanitizeEvent } from '@/lib/analytics-config';

/*
 * Runs in the browser before the app becomes interactive. Starts PostHog when analytics is on
 * (NEXT_PUBLIC_POSTHOG_KEY): explicit funnel events plus page views, through our /ingest relay.
 * No autocapture (it would record what people type and see), no session recording, and private
 * URL parameters (the decision text, the checkout session) are stripped from every event.
 */
if (ANALYTICS.key) {
  posthog.init(ANALYTICS.key, {
    api_host: RELAY_PATH,
    ui_host: ANALYTICS.uiHost,
    person_profiles: 'identified_only',
    capture_pageview: 'history_change',
    capture_pageleave: true,
    autocapture: false,
    disable_session_recording: true,
    before_send: (event) => sanitizeEvent(event),
  });
}
