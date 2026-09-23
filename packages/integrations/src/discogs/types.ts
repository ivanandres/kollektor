/** Subset of the Discogs API v2 response shapes we consume. */
export interface DArtist {
  id: number;
  name: string;
  anv?: string;
  join?: string;
}

export interface DLabel {
  id?: number;
  name: string;
  catno?: string;
}

export interface DFormat {
  name: string;
  qty?: string;
  descriptions?: string[];
  text?: string;
}

export interface DTrack {
  position: string;
  type_: 'track' | 'heading' | 'index';
  title: string;
  duration?: string;
  artists?: DArtist[];
  sub_tracks?: DTrack[];
}

export interface DImage {
  type: 'primary' | 'secondary';
  uri: string;
  width?: number;
  height?: number;
}

export interface DRelease {
  id: number;
  title: string;
  uri?: string;
  artists: DArtist[];
  year?: number;
  released?: string;
  country?: string;
  genres?: string[];
  styles?: string[];
  labels?: DLabel[];
  formats?: DFormat[];
  identifiers?: { type: string; value: string; description?: string }[];
  tracklist?: DTrack[];
  images?: DImage[];
  notes?: string;
  master_id?: number;
  community?: { have?: number; want?: number };
  lowest_price?: number | null;
  num_for_sale?: number;
}

export interface DMaster {
  id: number;
  title: string;
  uri?: string;
  artists: DArtist[];
  year?: number;
  genres?: string[];
  styles?: string[];
  main_release: number;
  images?: DImage[];
}

export interface DSearchResult {
  id: number;
  type: 'release' | 'master' | 'artist' | 'label';
  master_id?: number;
  title: string;
  year?: string;
  country?: string;
  label?: string[];
  catno?: string;
  format?: string[];
  barcode?: string[];
  thumb?: string;
  cover_image?: string;
  community?: { have?: number; want?: number };
}

export interface DPagination {
  page: number;
  pages: number;
  items: number;
}

export interface DSearchResponse {
  pagination: DPagination;
  results: DSearchResult[];
}

export interface DVersion {
  id: number;
  title: string;
  format?: string;
  label?: string;
  country?: string;
  released?: string;
  catno?: string;
  thumb?: string;
  major_formats?: string[];
  stats?: { community?: { in_collection?: number; in_wantlist?: number } };
}

export interface DVersionsResponse {
  pagination: DPagination;
  versions: DVersion[];
}

/** Keys are Discogs condition names, e.g. "Near Mint (NM or M-)". */
export type DPriceSuggestions = Record<string, { currency: string; value: number }>;

export interface DMarketStats {
  lowest_price?: { currency: string; value: number } | null;
  num_for_sale?: number | null;
  blocked_from_sale?: boolean;
}
