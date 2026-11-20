import { MongoClient } from 'mongodb';
import type { PlanId } from '@futuria/shared';

/** One throwaway database for the web e2e run; never the app's `futuria` database. */
export const E2E_DATABASE = 'futuria_test_web_e2e';

/** MONGODB_TEST_URI (like the API e2e tests), else local MongoDB. */
export function e2eMongoUri(): string {
  const base = process.env.MONGODB_TEST_URI || 'mongodb://127.0.0.1:27017';
  const url = new URL(base);
  url.pathname = `/${E2E_DATABASE}`;
  return url.toString();
}

export async function dropE2eDatabase(): Promise<void> {
  if (!E2E_DATABASE.startsWith('futuria_test_')) {
    throw new Error(`Refusing to drop non-test database "${E2E_DATABASE}"`);
  }
  const client = new MongoClient(e2eMongoUri(), { serverSelectionTimeoutMS: 10_000 });
  try {
    await client.connect();
    await client.db(E2E_DATABASE).dropDatabase();
  } finally {
    await client.close();
  }
}

/**
 * Put a dev user on a plan, as a Stripe sync would. The user must exist already (any API call
 * as that user creates it); updating instead of upserting keeps the API's defaults.
 */
export async function setPlan(devUser: string, plan: PlanId): Promise<void> {
  const client = new MongoClient(e2eMongoUri(), { serverSelectionTimeoutMS: 10_000 });
  try {
    await client.connect();
    const res = await client
      .db(E2E_DATABASE)
      .collection('users')
      .updateOne({ externalId: `dev:${devUser}` }, { $set: { plan } });
    if (res.matchedCount !== 1) throw new Error(`No user dev:${devUser} to put on ${plan}`);
  } finally {
    await client.close();
  }
}
