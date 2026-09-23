/**
 * Creates (or refreshes) a demo account with a realistic collection for UI/design work.
 *   pnpm db:seed:demo            → demo@kollektor.app / vinilos-demo
 */
import { seedDemo } from '@kollektor/core';
import { bootstrap } from '../bootstrap';
import { loadEnv } from '../env';

const EMAIL = process.env.DEMO_EMAIL ?? 'demo@kollektor.app';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'vinilos-demo';

const env = loadEnv();
if (env.NODE_ENV === 'production' && process.env.DEMO_ALLOW_PRODUCTION !== '1') {
  // The demo account has a known password and adds demo rows to the shared catalog.
  console.error(
    'Refusing to seed demo data in production (set DEMO_ALLOW_PRODUCTION=1 to override).',
  );
  process.exit(1);
}
const { auth, core, close } = bootstrap(env);
try {
  let userId = await core.profiles.userIdByEmail(EMAIL);
  if (!userId) {
    await auth.api.signUpEmail({
      body: { name: 'Demo Coleccionista', email: EMAIL, password: PASSWORD },
    });
    userId = await core.profiles.userIdByEmail(EMAIL);
  }
  const result = await seedDemo(core.deps.db, { userId: userId! });
  console.log(`Demo user: ${EMAIL} / ${PASSWORD}`);
  console.log(result);
} finally {
  await close();
}
