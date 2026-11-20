import { readFileSync } from 'node:fs';
import { setPlan } from './db';
import { expect, test } from './fixtures';
import { finishedSimulation } from './simulations';

/*
 * PDF reports: Free gets the upgrade dialog (and the server refuses too); Pro downloads a real
 * PDF named after the simulation.
 */
test('PDF reports are a Pro feature that downloads a real PDF', async ({ page, devUser }) => {
  const id = await finishedSimulation(page.request);
  await page.goto(`/s/${id}`);
  await expect(page.getByTestId('path-card').first()).toBeVisible({ timeout: 30_000 });

  // Free: the locked button opens the upgrade dialog, and the server agrees.
  await page.getByRole('button', { name: 'Download PDF' }).click();
  const dialog = page.getByRole('dialog', { name: 'Download your futures as a PDF' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();
  const refused = await page.request.get(`/api/report/${id}`);
  expect(refused.status()).toBe(403);
  expect(await refused.json()).toMatchObject({
    code: 'plan_feature',
    feature: 'pdfExport',
    requiredPlan: 'pro',
  });

  // Pro: a real PDF, named after the simulation.
  await setPlan(devUser, 'pro');
  await page.reload();
  await expect(page.getByTestId('path-card').first()).toBeVisible({ timeout: 30_000 });
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30_000 }),
    page.getByRole('button', { name: 'Download PDF' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('futuria-freelance-or-stay.pdf');
  const pdf = readFileSync(await download.path());
  expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  expect(pdf.length).toBeGreaterThan(20_000);
  await expect(dialog).toHaveCount(0);

  // Only the owner's simulations, and only real ids.
  expect((await page.request.get('/api/report/507f1f77bcf86cd799439011')).status()).toBe(404);
  expect((await page.request.get('/api/report/not-an-id')).status()).toBe(404);
});
