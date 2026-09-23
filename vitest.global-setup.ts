import { runMigrations } from './packages/db/src/migrate';
import { TEST_DATABASE_URL } from './packages/db/src/testing';

export default async function setup() {
  await runMigrations(TEST_DATABASE_URL);
}
