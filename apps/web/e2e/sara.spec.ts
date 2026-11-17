import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/*
 * Sara's journey (docs/ROADMAP.md) in fixture mode. Her exact sentence plus every default answer
 * replays the recorded real intake and model (apps/api/fixtures/ai), so the assumptions review
 * shows Claude's actual estimates; the stories are synthetic.
 */
const SARA = 'What if I quit my job to become a freelance UX designer?';

/** The freelance card's "chance of running out", e.g. "19%". */
async function freelanceRisk(page: Page): Promise<string> {
  const card = page
    .getByTestId('path-card')
    .filter({ hasText: /freelance/i })
    .first();
  return (await card.getByTestId('prob-run-out').innerText()).trim();
}

test('Sara simulates quitting to freelance, end to end', async ({ page, isMobile }) => {
  // 1. Landing: the hero input.
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /explore the future/i })).toBeVisible();
  await page.getByLabel('Your decision').fill(SARA);
  await page.getByRole('button', { name: 'Simulate my futures' }).click();

  // 2. Decision step, pre-filled from the landing page.
  await expect(page).toHaveURL(/\/new\?q=/);
  const decision = page.getByLabel('What decision are you thinking about?');
  await expect(decision).toHaveValue(SARA);
  await page.getByRole('button', { name: 'Continue' }).click();

  // 3. Questions with smart defaults (Claude's recorded intake).
  await expect(page.getByRole('heading', { name: 'A few questions' })).toBeVisible();
  await expect(page).toHaveURL(/\/new\/[a-f0-9]{24}$/);
  await expect(page.getByLabel(/take-home pay/i)).toHaveValue('4000');
  await page.getByRole('button', { name: 'Next: your paths' }).click();

  // 4. Paths: three proposed futures.
  await expect(page.getByRole('heading', { name: 'The futures to compare' })).toBeVisible();
  await expect(page.getByLabel('Name', { exact: true })).toHaveCount(3);
  await page.getByRole('button', { name: 'Build my simulation' }).click();

  // 5. Assumptions review: AI estimates are flagged, everything is editable.
  await expect(page.getByRole('heading', { name: "Here's what we assumed" })).toBeVisible();
  const estimates = page.locator('[data-testid="assumption"][data-source="ai_estimate"]');
  expect(await estimates.count()).toBeGreaterThan(5);
  await expect(estimates.first().getByText('AI estimate')).toBeVisible();

  // Confirm one estimate by editing it: it becomes the person's own value.
  const first = estimates.first();
  const label = (await first.locator('span.font-medium').first().innerText()).trim();
  await first.getByRole('button', { name: `Edit ${label}` }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText('You have unsaved changes')).toBeVisible();

  await page.getByRole('button', { name: 'Run simulation' }).click();

  // 6–7. Results: one card per path, the fan chart, numbers from the engine.
  await expect(page).toHaveURL(/\/s\/[a-f0-9]{24}$/);
  await expect(page.getByTestId('path-card')).toHaveCount(3, { timeout: 30_000 });
  await expect(page.getByText('Savings over time')).toBeVisible();
  // Wait for the stories so later checks see the finished run.
  await expect(page.getByText('Writing your stories…')).toBeHidden({ timeout: 30_000 });

  // Scenario switch: the cards follow the selected percentile.
  await page.getByRole('radio', { name: 'Pessimistic' }).click();
  await expect(page.getByText(/Savings, pessimistic/).first()).toBeVisible();
  await page.getByRole('radio', { name: 'Realistic' }).click();

  // 8. Tweak: more savings lowers the freelance risk, computed in the browser.
  const before = await freelanceRisk(page);
  if (isMobile) await page.getByRole('button', { name: 'Tweak' }).click();
  const savings = page.getByRole('slider', { name: 'Savings today' });
  await savings.focus();
  await savings.press('End');
  await expect(page.getByText("You're exploring tweaked numbers")).toBeVisible();
  await expect.poll(() => freelanceRisk(page)).not.toBe(before);
  await page.getByRole('button', { name: 'Reset to my assumptions' }).click();
  await expect.poll(() => freelanceRisk(page)).toBe(before);
  if (isMobile) await page.getByRole('button', { name: 'Close' }).click();

  // 9. What matters most.
  await page.getByRole('tab', { name: 'What matters most' }).click();
  await expect(page.getByTestId('tornado')).toBeVisible();
  expect(await page.getByTestId('tornado').locator('li').count()).toBeGreaterThan(1);

  // 10. Time Machine: milestones with engine numbers.
  await page.getByRole('tab', { name: 'Time Machine' }).click();
  const timeline = page.getByTestId('time-machine');
  await expect(timeline.getByText('Month 12', { exact: true })).toBeVisible();
  await expect(timeline.getByText('Savings').first()).toBeVisible();

  // 11. Action plan: before -> after risk per action.
  await page.getByRole('tab', { name: 'Action plan' }).click();
  await expect(page.getByTestId('action-card').first()).toBeVisible();
  await expect(
    page.getByTestId('action-card').first().getByText('Chance of running out', { exact: true }),
  ).toBeVisible();

  // The dashboard lists it as ready.
  await page.goto('/dashboard');
  const row = page.getByTestId('simulation-row').first();
  await expect(row).toContainText('Ready');
});

test('saved profile values pre-fill the questions', async ({ page }) => {
  await page.goto('/settings/profile');
  await page.getByLabel('Savings you could draw on').fill('22000');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible();

  await page.goto(`/new?q=${encodeURIComponent(SARA)}`);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'A few questions' })).toBeVisible();
  await expect(page.getByLabel(/savings could you draw on/i)).toHaveValue('22000');
  await expect(page.getByText('From your profile')).toBeVisible();
});
