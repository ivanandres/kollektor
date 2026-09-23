import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer } from 'better-auth/plugins';
import type { Core } from '@kollektor/core';
import { schema, type Database } from '@kollektor/db';
import type { EmailService } from '@kollektor/integrations';
import type { Env } from './env';

export function createAuth(opts: { db: Database; core: Core; email: EmailService; env: Env }) {
  const { db, core, email, env } = opts;
  return betterAuth({
    appName: 'Kollektor',
    baseURL: env.BETTER_AUTH_URL,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: env.WEB_ORIGIN.split(',').map((o) => o.trim()),
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await email.send({
          to: user.email,
          subject: 'Recuperá tu contraseña de Kollektor',
          text: `Hola ${user.name || ''}:\n\nPara elegir una nueva contraseña entrá a:\n${url}\n\nSi no lo pediste, ignorá este mensaje.`,
          html: `<p>Hola ${escapeHtml(user.name || '')}:</p><p>Para elegir una nueva contraseña hacé clic <a href="${url}">acá</a>.</p><p>Si no lo pediste, ignorá este mensaje.</p>`,
        });
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    // Mobile (Expo) clients authenticate with `Authorization: Bearer <session token>`.
    plugins: [bearer()],
    rateLimit: { enabled: env.NODE_ENV === 'production' },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await core.profiles.ensureProfile(user.id);
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

function escapeHtml(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}
