import { expect, test } from './fixtures';

/*
 * Plan gates on the Free plan (fixture mode, billing disabled): each locked control opens the
 * upgrade dialog instead of failing, and nothing is lost.
 */
const SARA = 'What if I quit my job to become a freelance UX designer?';

test('Free plan gates open the upgrade dialog', async ({ page, isMobile }) => {
  await page.goto(`/new?q=${encodeURIComponent(SARA)}`);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Skip to your paths' }).click();

  // Paths: Free compares 3; the limit offers Pro.
  await expect(page.getByTestId('path-option')).toHaveCount(3);
  await page.getByRole('button', { name: /compare up to 5 with Pro/ }).click();
  const paths = page.getByRole('dialog', { name: 'Compare more paths' });
  await expect(paths).toBeVisible();
  await expect(paths.getByRole('button', { name: 'Upgrade to Pro' })).toBeDisabled();
  await expect(paths.getByText('Payments aren’t set up here yet')).toBeVisible();
  await paths.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Build my simulation' }).click();

  // Assumptions: longer horizons are locked, and choosing one keeps 12 months.
  await expect(page.getByRole('heading', { name: "Here's what we assumed" })).toBeVisible();
  await page.getByRole('radio', { name: '24 months (paid plans)' }).click();
  const horizon = page.getByRole('dialog', { name: 'See further ahead' });
  await expect(horizon).toBeVisible();
  // The yearly switch shows the yearly prices.
  await horizon.getByRole('radio', { name: /Yearly/ }).click();
  await expect(horizon.getByText('$190')).toBeVisible();
  await horizon.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByText('Horizon: 12 months')).toBeVisible();

  await page.getByRole('button', { name: 'Run simulation' }).click();
  await expect(page.getByTestId('path-card')).toHaveCount(3, { timeout: 30_000 });
  await expect(page.getByText('Writing your stories…')).toBeHidden({ timeout: 30_000 });

  // Results: sliders stay free, a new story is a paid feature.
  if (isMobile) await page.getByRole('button', { name: 'Tweak' }).click();
  const savings = page.getByRole('slider', { name: 'Savings today' });
  await savings.focus();
  await savings.press('End');
  await expect(page.getByText("You're exploring tweaked numbers")).toBeVisible();
  // On phones the open Tweak sheet covers the lower half of the page; its own button is the one
  // to tap. On desktop, the notice's button.
  const updateStory = isMobile
    ? page
        .getByRole('dialog', { name: 'Tweak the future' })
        .getByRole('button', { name: 'Update the story' })
    : page.getByRole('button', { name: 'Update the story' }).first();
  await updateStory.click();
  const story = page.getByRole('dialog', { name: 'Update the story with your changes' });
  await expect(story).toBeVisible();
  await expect(story.getByText('Recommended')).toBeVisible();
  await story.getByRole('button', { name: 'Close' }).click();
  // Nothing was re-run or cleared.
  await expect(page.getByTestId('path-card')).toHaveCount(3);

  // The billing page shows the plan and its usage.
  await page.goto('/settings/billing');
  await expect(page.getByRole('heading', { name: 'Plan and billing' })).toBeVisible();
  await expect(page.getByText('1 of 3 used')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upgrade to Pro' })).toBeDisabled();
});
