import { test as base, expect } from '@playwright/test';

/**
 * Each test acts as its own dev user (the API runs in AUTH_MODE=dev), so tests never see each
 * other's simulations. The web proxy forwards this cookie as `x-dev-user`.
 */
export const test = base.extend<{ devUser: string }>({
  devUser: [
    async ({ context, baseURL }, use, testInfo) => {
      const name = `e2e-${testInfo.project.name}-${testInfo.workerIndex}-${Date.now().toString(36)}`;
      await context.addCookies([{ name: 'futuria_dev_user', value: name, url: baseURL! }]);
      await use(name);
    },
    { auto: true },
  ],
});

export { expect };
