import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Migrations + seed (achievements, essential discographies) on the e2e database. */
export default function globalSetup() {
  const root = fileURLToPath(new URL('../../..', import.meta.url));
  const env = {
    ...process.env,
    DATABASE_URL:
      process.env.E2E_DATABASE_URL ??
      'postgresql://kollektor:kollektor@localhost:5432/kollektor_test',
  };
  execSync('pnpm -s db:migrate && pnpm -s db:seed', { cwd: root, env, stdio: 'inherit' });
}
