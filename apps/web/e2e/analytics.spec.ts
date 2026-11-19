import { expect, test } from './fixtures';

/*
 * Analytics is opt-in by configuration: the e2e build has no PostHog key, so nothing may be
 * loaded or sent, and the /ingest relay is closed.
 */
test('without a PostHog key, nothing is sent anywhere', async ({ page }) => {
  const analytics: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('/ingest') || url.includes('posthog')) analytics.push(url);
  });

  await page.goto('/');
  await page.getByLabel('Your decision').first().fill('What if I quit my job to freelance?');
  await page.getByRole('button', { name: 'Simulate my futures' }).first().click();
  await expect(page).toHaveURL(/\/new\?q=/);
  await page.waitForLoadState('networkidle');
  expect(analytics).toEqual([]);

  // The relay is off, and answers directly: no trailing-slash redirect for the SDK's /e/.
  const relay = await page.request.post('/ingest/e/', { data: '{}', maxRedirects: 0 });
  expect(relay.status()).toBe(404);
});
