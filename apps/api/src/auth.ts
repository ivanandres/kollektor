import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer } from 'better-auth/plugins';
import type { Core } from '@kollektor/core';
import { schema, type Database } from '@kollektor/db';
import type { EmailService, StorageService } from '@kollektor/integrations';
import type { Env } from './env';

export function createAuth(opts: {
  db: Database;
  core: Core;
  email: EmailService;
  env: Env;
  storage?: StorageService;
}) {
  const { db, core, email, env, storage } = opts;
  /** Files to remove once the account is gone (collected before the rows cascade away). */
  const pendingFileDeletes = new Map<string, string[]>();
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
    // Optional "Continuar con Google" (redirect URI: <BETTER_AUTH_URL>/api/auth/callback/google).
    // Note: on iOS, offering Google login requires also offering Sign in with Apple (App Store 4.8).
    socialProviders:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
        : {},
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
    // "Borrar mi cuenta": POST /api/auth/delete-user { password } removes the user and all their data.
    user: {
      deleteUser: {
        enabled: true,
        beforeDelete: async (user) => {
          pendingFileDeletes.set(user.id, await core.profiles.uploadedFileUrls(user.id));
        },
        afterDelete: async (user) => {
          await core.jobs.deleteForUser(user.id);
          const urls = pendingFileDeletes.get(user.id) ?? [];
          pendingFileDeletes.delete(user.id);
          if (!storage) return;
          for (const url of urls) {
            const key = storage.keyFromPublicUrl(url);
            if (key)
              await storage
                .delete(key)
                .catch((e) => console.error('storage delete failed', key, e));
          }
        },
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
