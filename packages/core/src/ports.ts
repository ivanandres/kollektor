/**
 * Ports: interfaces the domain depends on. Adapters live in @kollektor/integrations.
 * No HTTP, no vendor types here.
 */
import type { CatalogSearchQuery } from '@kollektor/schemas';

export interface ExternalArtistRef {
  externalId: string | null;
  name: string;
  joinPhrase?: string | null;
}

export interface ExternalLabelRef {
  externalId: string | null;
  name: string;
  catalogNumber: string | null;
}

export interface ExternalFormat {
  name: string;
  qty: number;
  descriptions: string[];
  /** Free text such as "Red Translucent". */
  text: string | null;
}

export interface ExternalTrack {
  position: string | null;
  title: string;
  durationSeconds: number | null;
  artistCredit: string | null;
}

export interface ExternalImage {
  kind: 'primary' | 'secondary';
  url: string;
  width: number | null;
  height: number | null;
}

export interface ExternalRelease {
  source: string;
  externalId: string;
  url: string | null;
  title: string;
  artists: ExternalArtistRef[];
  year: number | null;
  releaseDate: string | null;
  country: string | null;
  genres: string[];
  styles: string[];
  labels: ExternalLabelRef[];
  formats: ExternalFormat[];
  formatSummary: string | null;
  barcodes: string[];
  tracklist: ExternalTrack[];
  images: ExternalImage[];
  notes: string | null;
  masterId: string | null;
  community: { have: number | null; want: number | null };
  lowestPrice: { amount: number; currency: string } | null;
  numForSale: number | null;
}

export interface ExternalMaster {
  source: string;
  externalId: string;
  url: string | null;
  title: string;
  artists: ExternalArtistRef[];
  year: number | null;
  genres: string[];
  styles: string[];
  mainReleaseId: string | null;
  images: ExternalImage[];
}

export interface CatalogSearchResult {
  source: string;
  type: 'release' | 'master';
  externalId: string;
  masterId: string | null;
  title: string;
  artist: string | null;
  year: number | null;
  country: string | null;
  labels: string[];
  catalogNumber: string | null;
  formats: string[];
  barcodes: string[];
  thumbUrl: string | null;
  coverUrl: string | null;
  community: { have: number | null; want: number | null };
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pages: number;
  total: number;
}

export interface CatalogProvider {
  readonly source: string;
  search(q: CatalogSearchQuery): Promise<Paginated<CatalogSearchResult>>;
  getRelease(externalId: string): Promise<ExternalRelease>;
  getMaster(externalId: string): Promise<ExternalMaster>;
  getMasterVersions(externalId: string, page?: number): Promise<Paginated<CatalogSearchResult>>;
}

export type Grade = 'M' | 'NM' | 'VG+' | 'VG' | 'G+' | 'G' | 'F' | 'P';

export interface MarketValue {
  kind: 'suggestion' | 'lowest' | 'median';
  condition: Grade | null;
  amount: number;
  currency: string;
}

export interface MarketValueProvider {
  readonly source: string;
  getMarketValues(externalReleaseId: string): Promise<MarketValue[]>;
}

export interface FxRateProvider {
  readonly source: string;
  /** Units of `quote` per 1 `base` on `date` (YYYY-MM-DD). null if unknown. */
  getRate(base: string, quote: string, date: string): Promise<number | null>;
}

export interface TrackQuery {
  artist: string;
  title: string;
  album?: string | null;
  durationSeconds?: number | null;
}

export interface MusicLinkMatch {
  url: string;
  externalId: string;
  confidence: number;
}

export interface MusicLinkProvider {
  /** spotify | youtube | … */
  readonly provider: string;
  findTrack(q: TrackQuery): Promise<MusicLinkMatch | null>;
}

export interface LyricsProvider {
  readonly provider: string;
  findLyricsPage(q: TrackQuery): Promise<{ url: string; confidence: number } | null>;
}

export interface RecognitionImage {
  /** base64 without data: prefix */
  data: string;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
}

export interface RecognitionHints {
  artist: string | null;
  title: string | null;
  catalogNumber: string | null;
  label: string | null;
  barcode: string | null;
  country: string | null;
  year: number | null;
  /** 0..1 as self-reported by the recognizer. */
  confidence: number;
}

export interface CoverRecognizer {
  extract(images: RecognitionImage[]): Promise<RecognitionHints>;
}
