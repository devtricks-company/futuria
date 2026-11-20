'use client';

import { useEffect, useRef } from 'react';
import { type AnalyticsEvent, type EventProperties, refParam, track } from '@/lib/analytics';

/**
 * Records one event when a page (often a Server Component) is viewed, with `ref` from the URL
 * (e.g. visitors arriving from a share page). Renders nothing.
 */
export function TrackView({
  event,
  properties,
}: {
  event: AnalyticsEvent;
  properties?: EventProperties;
}) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    track(event, { ...properties, ref: refParam() });
  }, [event, properties]);
  return null;
}
