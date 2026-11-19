import { describe, expect, it } from 'vitest';
import {
  analyticsConfig,
  isNewSignup,
  relayTarget,
  sanitizeEvent,
  stripPrivateParams,
} from './analytics-config';

describe('analytics config', () => {
  it('is off without a key, and picks the region hosts', () => {
    expect(analyticsConfig({}).key).toBeNull();
    expect(analyticsConfig({ key: '  ' }).key).toBeNull();
    expect(analyticsConfig({ key: 'phc_abc' })).toEqual({
      key: 'phc_abc',
      apiHost: 'https://us.i.posthog.com',
      assetsHost: 'https://us-assets.i.posthog.com',
      uiHost: 'https://us.posthog.com',
    });
    expect(analyticsConfig({ key: 'phc_abc', region: 'EU' }).apiHost).toBe(
      'https://eu.i.posthog.com',
    );
  });

  it('relays events and static assets to the right PostHog host, only there', () => {
    const config = analyticsConfig({ key: 'phc_abc' });
    expect(relayTarget(['e', ''], '?ip=1', config).toString()).toBe(
      'https://us.i.posthog.com/e/?ip=1',
    );
    expect(relayTarget(['static', 'array.js'], '', config).toString()).toBe(
      'https://us-assets.i.posthog.com/static/array.js',
    );
    // A path can't point the relay at another host.
    expect(relayTarget(['..', '..', 'evil.example', 'x'], '', config).host).toBe(
      'us.i.posthog.com',
    );
    expect(relayTarget(['//evil.example'], '', config).host).toBe('us.i.posthog.com');
  });
});

describe('privacy filters', () => {
  it('drops the decision text and checkout session from URLs', () => {
    expect(stripPrivateParams('https://futuria.app/new?q=quit%20my%20job&utm_source=x#top')).toBe(
      'https://futuria.app/new?utm_source=x#top',
    );
    expect(stripPrivateParams('/settings/billing?session_id=cs_123')).toBe('/settings/billing');
    expect(stripPrivateParams('https://futuria.app/s/abc')).toBe('https://futuria.app/s/abc');
    expect(stripPrivateParams('not a url, q=1')).toBe('not a url, q=1');
  });

  it('cleans every URL-like property of an event, including person properties', () => {
    const event = sanitizeEvent({
      event: '$pageview',
      properties: {
        $current_url: 'https://futuria.app/new?q=secret',
        $referrer: 'https://futuria.app/?q=secret',
        count: 3,
      },
      $set_once: { $initial_current_url: 'https://futuria.app/new?q=secret' },
    });
    expect(JSON.stringify(event)).not.toContain('secret');
    expect(event?.properties?.count).toBe(3);
    expect(sanitizeEvent(null)).toBeNull();
  });
});

describe('isNewSignup', () => {
  const now = new Date('2026-11-19T12:00:00Z');
  it('counts accounts made in the last 15 minutes', () => {
    expect(isNewSignup(new Date('2026-11-19T11:50:00Z'), now)).toBe(true);
    expect(isNewSignup(new Date('2026-11-19T11:30:00Z'), now)).toBe(false);
    expect(isNewSignup(null, now)).toBe(false);
  });
});
