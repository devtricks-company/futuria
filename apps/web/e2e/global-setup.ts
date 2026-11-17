import { dropE2eDatabase } from './db';

/** Start from an empty test database (a previous run may have stopped half-way). */
export default async function globalSetup(): Promise<void> {
  await dropE2eDatabase();
}
