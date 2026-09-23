import type { CoreDeps } from '@kollektor/core';
import { DiscogsService } from './discogs/service';
import { ConsoleEmailService, ResendEmailService, type EmailService } from './email/resend';
import { ChainFx, CurrencyApiFx, FrankfurterFx } from './fx/providers';
import { GeniusLyricsService } from './lyrics/genius';
import { SpotifyService } from './spotify/service';
import { S3StorageService, type StorageService } from './storage/s3';
import { ClaudeCoverRecognizer } from './vision/claude';
import { YouTubeService } from './youtube/service';

export { DiscogsService } from './discogs/service';
export { RateLimiter } from './discogs/rate-limiter';
export * as discogsMapper from './discogs/mapper';
export { SpotifyService } from './spotify/service';
export { YouTubeService } from './youtube/service';
export { GeniusLyricsService } from './lyrics/genius';
export { ClaudeCoverRecognizer } from './vision/claude';
export { ChainFx, CurrencyApiFx, FrankfurterFx } from './fx/providers';
export {
  ConsoleEmailService,
  ResendEmailService,
  type EmailService,
  type EmailMessage,
} from './email/resend';
export { scoreMatch, coreTitle } from './matching';
export { HttpError } from './http/fetch-json';
export { S3StorageService, type StorageService, type UploadTarget } from './storage/s3';

export interface IntegrationEnv {
  DISCOGS_USER_TOKEN?: string;
  DISCOGS_USER_AGENT?: string;
  ANTHROPIC_API_KEY?: string;
  VISION_MODEL?: string;
  SPOTIFY_CLIENT_ID?: string;
  SPOTIFY_CLIENT_SECRET?: string;
  YOUTUBE_API_KEY?: string;
  GENIUS_ACCESS_TOKEN?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  STORAGE_ENDPOINT?: string;
  STORAGE_BUCKET?: string;
  STORAGE_ACCESS_KEY_ID?: string;
  STORAGE_SECRET_ACCESS_KEY?: string;
  STORAGE_PUBLIC_BASE_URL?: string;
}

/** Builds adapters from env. Anything not configured is simply left out (features degrade gracefully). */
export function integrationsFromEnv(
  env: IntegrationEnv,
): Omit<CoreDeps, 'db' | 'now' | 'config'> & { email: EmailService; storage?: StorageService } {
  const discogs = env.DISCOGS_USER_TOKEN
    ? new DiscogsService({
        token: env.DISCOGS_USER_TOKEN,
        userAgent: env.DISCOGS_USER_AGENT ?? 'Kollektor/0.1',
      })
    : undefined;
  const musicLinks = [
    ...(env.SPOTIFY_CLIENT_ID && env.SPOTIFY_CLIENT_SECRET
      ? [
          new SpotifyService({
            clientId: env.SPOTIFY_CLIENT_ID,
            clientSecret: env.SPOTIFY_CLIENT_SECRET,
          }),
        ]
      : []),
    ...(env.YOUTUBE_API_KEY ? [new YouTubeService({ apiKey: env.YOUTUBE_API_KEY })] : []),
  ];
  return {
    fx: new ChainFx([new FrankfurterFx(), new CurrencyApiFx()]),
    catalogProvider: discogs,
    marketValue: discogs,
    musicLinks,
    lyrics: env.GENIUS_ACCESS_TOKEN
      ? new GeniusLyricsService({ accessToken: env.GENIUS_ACCESS_TOKEN })
      : undefined,
    recognizer: env.ANTHROPIC_API_KEY
      ? new ClaudeCoverRecognizer({
          apiKey: env.ANTHROPIC_API_KEY,
          model: env.VISION_MODEL || undefined,
        })
      : undefined,
    email:
      env.RESEND_API_KEY && env.EMAIL_FROM
        ? new ResendEmailService({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM })
        : new ConsoleEmailService(),
    storage:
      env.STORAGE_ENDPOINT &&
      env.STORAGE_BUCKET &&
      env.STORAGE_ACCESS_KEY_ID &&
      env.STORAGE_SECRET_ACCESS_KEY &&
      env.STORAGE_PUBLIC_BASE_URL
        ? new S3StorageService({
            endpoint: env.STORAGE_ENDPOINT,
            bucket: env.STORAGE_BUCKET,
            accessKeyId: env.STORAGE_ACCESS_KEY_ID,
            secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY,
            publicBaseUrl: env.STORAGE_PUBLIC_BASE_URL,
          })
        : undefined,
  };
}
