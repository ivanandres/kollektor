import type { Database } from '@kollektor/db';
import type {
  CatalogProvider,
  CoverRecognizer,
  FxRateProvider,
  LyricsProvider,
  MarketValueProvider,
  MusicLinkProvider,
} from './ports';

export interface CoreDeps {
  db: Database;
  fx: FxRateProvider;
  catalogProvider?: CatalogProvider;
  marketValue?: MarketValueProvider;
  musicLinks?: MusicLinkProvider[];
  lyrics?: LyricsProvider;
  recognizer?: CoverRecognizer;
  now?: () => Date;
  config?: {
    /** Photo recognitions per user per day. */
    visionDailyLimit?: number;
    /** Re-sync external catalog data older than this. */
    catalogStaleAfterDays?: number;
    /** Re-check "not found" music links after this. */
    musicLinkRetryAfterDays?: number;
  };
}

export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
/** Either the root db or a transaction. */
export type Db = Database | Tx;

export const nowOf = (deps: CoreDeps) => (deps.now ? deps.now() : new Date());
