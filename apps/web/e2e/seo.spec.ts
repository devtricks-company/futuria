import { SEO_PAGE_LIST } from '../src/lib/seo-pages';
import { expect, test } from './fixtures';

/*
 * Search landing pages: each one has its question as the headline, a pre-filled decision that
 * starts the wizard, FAQ structured data, a canonical URL, and a place in the sitemap.
 */
for (const seo of SEO_PAGE_LIST) {
  test(`search page /${seo.slug}`, async ({ page }) => {
    await page.goto(`/${seo.slug}`);
    await expect(page).toHaveTitle(`${seo.title} · FUTURIA`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(seo.h1);
    await expect(page.getByTestId('seo-path')).toHaveCount(3);

    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(new URL(canonical!).pathname).toBe(`/${seo.slug}`);

    const jsonLd = JSON.parse(
      (await page.locator('script[type="application/ld+json"]').textContent())!,
    ) as { '@type': string; mainEntity: unknown[] };
    expect(jsonLd['@type']).toBe('FAQPage');
    expect(jsonLd.mainEntity).toHaveLength(seo.faqs.length);

    // The pre-filled decision starts the wizard with it.
    const input = page.locator(`#${seo.slug}-decision`);
    await expect(input).toHaveValue(seo.decision);
    await page.getByRole('button', { name: 'Simulate my futures' }).first().click();
    await expect(page).toHaveURL(/\/new\?q=/);
    await expect(page.getByLabel('What decision are you thinking about?')).toHaveValue(
      seo.decision,
    );
  });
}

test('the sitemap lists the public pages, and robots.txt keeps crawlers out of the app', async ({
  request,
}) => {
  const sitemap = await (await request.get('/sitemap.xml')).text();
  for (const seo of SEO_PAGE_LIST) expect(sitemap).toContain(`/${seo.slug}</loc>`);
  expect(sitemap).not.toContain('/share/');

  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toContain('Disallow: /api/');
  expect(robots).toContain('Disallow: /s/');
  expect(robots).not.toContain('/share');
  expect(robots).toMatch(/Sitemap: .*\/sitemap\.xml/);
});
