import { z } from 'zod';

const optional = z
  .string()
  .trim()
  .optional()
  .transform((v) => v || undefined);

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(16),
  BETTER_AUTH_URL: z.string().url().default('http://localhost:3001'),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  CRON_SECRET: optional,
  DISCOGS_USER_TOKEN: optional,
  DISCOGS_USER_AGENT: optional,
  DISCOGS_CONSUMER_KEY: optional,
  DISCOGS_CONSUMER_SECRET: optional,
  /** 32 random bytes, base64 (`openssl rand -base64 32`). Encrypts linked-account tokens. */
  TOKEN_ENCRYPTION_KEY: optional,
  /** Where to send the user after linking Discogs (web page or app deep link). Default: WEB_ORIGIN. */
  DISCOGS_CONNECT_RETURN_URL: optional,
  ANTHROPIC_API_KEY: optional,
  VISION_MODEL: optional,
  VISION_DAILY_LIMIT: z.coerce.number().int().positive().default(30),
  SPOTIFY_CLIENT_ID: optional,
  SPOTIFY_CLIENT_SECRET: optional,
  YOUTUBE_API_KEY: optional,
  GENIUS_ACCESS_TOKEN: optional,
  RESEND_API_KEY: optional,
  EMAIL_FROM: optional,
  STORAGE_ENDPOINT: optional,
  STORAGE_BUCKET: optional,
  STORAGE_ACCESS_KEY_ID: optional,
  STORAGE_SECRET_ACCESS_KEY: optional,
  STORAGE_PUBLIC_BASE_URL: optional,
  /** Per-user requests per minute to endpoints that hit external APIs (Discogs, vision). */
  EXTERNAL_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(30),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }
  return parsed.data;
}
