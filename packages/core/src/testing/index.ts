import { schema, type Database } from '@kollektor/db';

export * from './fakes';

let counter = 0;
export async function createUser(db: Database, name = 'Test User'): Promise<string> {
  const id = `user_${Date.now()}_${counter++}`;
  await db.insert(schema.user).values({ id, name, email: `${id}@example.com` });
  return id;
}
export { seedLibrary } from './library';
