import type { APIRequestContext } from '@playwright/test';
import { expect, test } from './fixtures';
import { SARA_DECISION as DECISION, finishedSimulation } from './simulations';

/*
 * Sharing: the owner makes a public link; a stranger (no cookies, no account) sees chances and
 * months but no amounts, then the amounts once the owner opts in, and nothing once sharing is off.
 */
const TITLE = 'Freelance or stay?';
/** A link-preview bot: Next.js gives these the metadata in <head> instead of streaming it. */
const PREVIEW_BOT = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';
const PNG_SIGNATURE = '89504e470d0a1a0a';

/**
 * What a link preview shows: the page's <head> as a preview bot gets it, and its card image
 * (fetched from this server: the absolute URL uses NEXT_PUBLIC_SITE_URL).
 */
async function linkPreview(request: APIRequestContext, url: string) {
  const html = await (await request.get(url, { headers: { 'user-agent': PREVIEW_BOT } })).text();
  const head = html.slice(0, html.indexOf('</head>'));
  const meta = (attr: string) =>
    head.match(new RegExp(`<meta (?:property|name)="${attr}" content="([^"]*)"`))?.[1];
  const imageUrl = meta('og:image');
  expect(imageUrl, 'og:image in <head>').toBeTruthy();
  const { pathname, search } = new URL(imageUrl!);
  const image = await request.get(pathname + search);
  expect(image.status()).toBe(200);
  expect(image.headers()['content-type']).toBe('image/png');
  expect((await image.body()).subarray(0, 8).toString('hex')).toBe(PNG_SIGNATURE);
  return {
    title: meta('og:title'),
    description: meta('og:description'),
    card: meta('twitter:card'),
    robots: meta('robots'),
  };
}

test('a shared simulation shows strangers chances, not amounts', async ({ page, browser }) => {
  const id = await finishedSimulation(page.request, TITLE);
  await page.goto(`/s/${id}`);
  await expect(page.getByTestId('path-card').first()).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Share your futures' });
  // Before anything is public, the dialog shows exactly what would be.
  await expect(dialog.getByText(`“${TITLE}”`)).toBeVisible();
  const isPublic = dialog.getByRole('switch', { name: 'Public link' });
  const showNumbers = dialog.getByRole('switch', { name: 'Show amounts and stories' });
  await isPublic.click();
  const link = dialog.getByLabel('Link', { exact: true });
  await expect(link).toHaveValue(/\/share\/[A-Za-z0-9_-]{12}$/);
  const url = await link.inputValue();

  // A stranger: a fresh browser with no cookies and no account.
  const strangerContext = await browser.newContext();
  const stranger = await strangerContext.newPage();
  await stranger.goto(url);
  const main = stranger.locator('main');
  await expect(stranger.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
  await expect(stranger.getByTestId('shared-path')).toHaveCount(3);
  await expect(stranger.getByTestId('share-watermark')).toBeVisible();
  await expect(main).toContainText('chance of running out');
  await expect(main).not.toContainText('$');
  await expect(main).not.toContainText(DECISION);
  await expect(stranger.getByRole('link', { name: 'Simulate my own decision' })).toHaveAttribute(
    'href',
    '/?ref=share',
  );

  // The link preview: a "My 3 futures" card, never indexed, no amounts.
  const preview = await linkPreview(stranger.request, url);
  expect(preview.title).toBe(`3 possible futures: ${TITLE}`);
  expect(preview.description).toContain('chance of running out');
  expect(preview.description).not.toContain('$');
  expect(preview.card).toBe('summary_large_image');
  expect(preview.robots).toBe('noindex, nofollow');

  // The owner opts in to amounts and stories.
  await showNumbers.click();
  await expect(showNumbers).toBeChecked();
  await expect(showNumbers).toBeEnabled();
  await stranger.reload();
  await expect(stranger.getByTestId('path-card')).toHaveCount(3);
  await expect(main).toContainText('$');
  await expect(stranger.getByTestId('time-machine')).toBeVisible();

  // Sharing off: the link stops working at once.
  await isPublic.click();
  await expect(link).toHaveCount(0);
  await expect(isPublic).toBeEnabled();
  await stranger.reload();
  await expect(stranger.getByText("This link isn't shared anymore")).toBeVisible();
  await strangerContext.close();
});

test('an unknown share link says so instead of failing', async ({ page }) => {
  await page.goto('/share/not_a_real_link');
  await expect(page.getByText("This link isn't shared anymore")).toBeVisible();
  await page.goto('/share/..%2Fsimulations');
  await expect(page.getByText("This link isn't shared anymore")).toBeVisible();
});

test('the site has its own link preview card', async ({ request }) => {
  const preview = await linkPreview(request, '/');
  expect(preview.card).toBe('summary_large_image');
  expect(preview.robots).toBeUndefined();
});
