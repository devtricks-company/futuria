import { type APIRequestContext, expect } from '@playwright/test';
import { SARA_MODEL } from '@futuria/shared';

export const SARA_DECISION = 'What if I quit my job to become a freelance UX designer?';

/**
 * A finished simulation of Sara's model, made through the app's API proxy as the test's dev user
 * (`page.request` shares the page's cookies). Fixture AI and the inline pipeline make it quick.
 */
export async function finishedSimulation(
  request: APIRequestContext,
  title = 'Freelance or stay?',
): Promise<string> {
  const created = await request.post('/api/backend/simulations', {
    data: { decisionText: SARA_DECISION, title, model: SARA_MODEL },
  });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()) as { id: string };
  expect((await request.post(`/api/backend/simulations/${id}/run`)).status()).toBe(202);
  await expect
    .poll(
      async () =>
        ((await (await request.get(`/api/backend/simulations/${id}`)).json()) as { status: string })
          .status,
      { timeout: 30_000 },
    )
    .toBe('ready');
  return id;
}
