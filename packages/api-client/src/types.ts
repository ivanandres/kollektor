/**
 * Response types derived from the domain services, as they arrive over JSON
 * (Dates become ISO strings). Type-only imports: nothing from the server ships to clients.
 */
import type { Core } from '@kollektor/core';

/** What JSON.parse gives back for a server value. */
export type Jsonify<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Jsonify<U>[]
    : T extends object
      ? { [K in keyof T]: Jsonify<T[K]> }
      : T;

type Out<F extends (...args: never[]) => unknown> = Jsonify<Awaited<ReturnType<F>>>;

export type Profile = Out<Core['profiles']['getProfile']>;
export type CollectionPage = Out<Core['collection']['list']>;
export type CollectionListItem = CollectionPage['items'][number];
export type CollectionFacets = Out<Core['collection']['facets']>;
export type CollectionItem = Out<Core['collection']['get']>;
export type ReleaseDetail = Out<Core['catalog']['getReleaseDetail']>;
export type AlbumReleases = Out<Core['catalog']['listAlbumReleases']>;
export type WishlistItem = Out<Core['wishlist']['list']>[number];
export type SearchResults = Out<Core['search']['search']>;
export type Dashboard = Out<Core['stats']['dashboard']>;
export type StatsSummary = Out<Core['stats']['summary']>;
export type StatsBreakdowns = Out<Core['stats']['breakdowns']>;
export type StatsTimeline = Out<Core['stats']['timeline']>;
export type Achievement = Out<Core['achievements']['listWithProgress']>[number];
export type EssentialProgress = Out<Core['achievements']['essentialProgress']>[number];
export type Insight = Out<Core['discovery']['insights']>[number];
export type TrackLinks = Out<Core['music']['getLinks']>;
/** "¿Ya lo tengo?" flags added to every external candidate. */
export interface Ownership {
  ownedCopies: number;
  ownedEditionsOfAlbum: number;
  inWishlist: boolean;
}

type RawIdentify = Out<Core['recognition']['identifyByPhoto']>;
export type IdentifyResult = Omit<RawIdentify, 'candidates'> & {
  candidates: (RawIdentify['candidates'][number] & Ownership)[];
};
export type ImportStatus = Out<Core['imports']['status']>;
export type ActivityEntry = Out<Core['activity']['list']>[number];
export type PublicProfile = Out<Core['publicViews']['profile']>;
export type PublicCollection = Out<Core['publicViews']['collectionOf']>;
export type PublicWishlist = Out<Core['publicViews']['wishlistOf']>;

type ExternalPage = Out<NonNullable<Core['deps']['catalogProvider']>['search']>;
export type ExternalCandidate = ExternalPage['items'][number] & Ownership;
export type ExternalSearchPage = Omit<ExternalPage, 'items'> & {
  items: ExternalCandidate[];
  attribution: string;
};

export interface UnlockedAchievement {
  code: string;
  name: string;
  description: string;
  icon: string;
}

export interface AddResult {
  item: CollectionItem;
  unlockedAchievements: UnlockedAchievement[];
  replayed: boolean;
}

export interface UploadTarget {
  uploadUrl: string;
  publicUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresIn: number;
}
