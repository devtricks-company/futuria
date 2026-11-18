import { expect, test } from './fixtures';

/** Decisions FUTURIA doesn't simulate stop before any questions. */

test('an out-of-scope decision gets the "not yet" screen', async ({ page }) => {
  await page.goto('/new');
  await page
    .getByLabel('What decision are you thinking about?')
    .fill('Should I buy an apartment in Lisbon or keep renting?');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: "We can't simulate this one yet" })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Try a career decision' })).toBeVisible();
});

test('a crisis gets support resources, not a simulation', async ({ page }) => {
  await page.goto('/new');
  await page
    .getByLabel('What decision are you thinking about?')
    .fill('I lost my job and I want to end my life');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(
    page.getByRole('heading', { name: 'It sounds like things are really hard right now' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'findahelpline.com' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'A few questions' })).toHaveCount(0);
});
