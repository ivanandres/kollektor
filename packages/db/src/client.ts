import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index';

export type Database = PostgresJsDatabase<typeof schema>;

export interface DbHandle {
  db: Database;
  close: () => Promise<void>;
}

export function createDb(url: string, opts: { max?: number } = {}): DbHandle {
  // prepare:false keeps us compatible with transaction-mode poolers (Neon/PgBouncer).
  const client = postgres(url, { max: opts.max ?? 10, prepare: false, onnotice: () => {} });
  const db = drizzle(client, { schema });
  return { db, close: () => client.end() };
}
