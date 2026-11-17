import { dropE2eDatabase } from './db';

export default async function globalTeardown(): Promise<void> {
  await dropE2eDatabase();
}
