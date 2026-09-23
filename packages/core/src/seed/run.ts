import { createDb } from '@kollektor/db';
import { seedAll } from './seed';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');
const { db, close } = createDb(url, { max: 1 });
try {
  console.log('Seeded', await seedAll(db));
} finally {
  await close();
}
