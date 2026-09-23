import { sql } from 'drizzle-orm';
import { createDb, type Database, type DbHandle } from './client';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://kollektor:kollektor@localhost:5432/kollektor_test';

export function createTestDb(): DbHandle {
  return createDb(TEST_DATABASE_URL, { max: 5 });
}

/** Truncates every application table. Only for tests. */
export async function resetDb(db: Database): Promise<void> {
  const rows = await db.execute<{ tablename: string }>(
    sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
  );
  const names = rows.map((r) => `"${r.tablename}"`).join(', ');
  if (names) await db.execute(sql.raw(`TRUNCATE ${names} RESTART IDENTITY CASCADE`));
}
