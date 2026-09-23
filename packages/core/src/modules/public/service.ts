import type { CollectionQuery } from '@kollektor/schemas';
import type { CoreDeps } from '../../context';
import type { CollectionService } from '../collection/service';
import type { ProfileService } from '../profiles/service';
import type { StatsService } from '../stats/service';
import type { WishlistService } from '../wishlist/service';

/**
 * Read-only public views (base for the V2 social layer). Every response is an explicit
 * projection: purchase place and storage location are never included; prices and values only
 * when the owner opted in.
 */
export function publicService(
  _deps: CoreDeps,
  profiles: ProfileService,
  collection: CollectionService,
  wishlist: WishlistService,
  stats: StatsService,
) {
  async function profile(username: string) {
    const p = await profiles.publicOwner(username, 'profile');
    const summary = p.collectionVisibility === 'public' ? await stats.summary(p.userId) : null;
    return {
      username: p.username,
      displayName: p.displayName,
      avatarUrl: p.avatarUrl,
      bio: p.bio,
      collectionVisible: p.collectionVisibility === 'public',
      wishlistVisible: p.wishlistVisibility === 'public',
      stats: summary
        ? {
            items: summary.items,
            artists: summary.artists,
            albums: summary.albums,
            ...(p.showValues ? { estimated: summary.estimated, currency: summary.currency } : {}),
            ...(p.showPrices ? { invested: summary.invested, currency: summary.currency } : {}),
          }
        : null,
    };
  }

  async function collectionOf(username: string, q: CollectionQuery) {
    const p = await profiles.publicOwner(username, 'collection');
    // Whitelist: only filters/sorts over data the owner made public. Tags, and prices/values
    // unless opted in, can't be used to filter or rank (that would leak them).
    const publicSorts: CollectionQuery['sort'][] = [
      'added_desc',
      'added_asc',
      'artist_asc',
      'title_asc',
      'year_asc',
      'year_desc',
    ];
    if (p.showPrices) publicSorts.push('paid_desc');
    if (p.showValues) publicSorts.push('value_desc');
    const res = await collection.list(p.userId, {
      q: q.q,
      artistId: q.artistId,
      genre: q.genre,
      style: q.style,
      decade: q.decade,
      yearFrom: q.yearFrom,
      yearTo: q.yearTo,
      editionYearFrom: q.editionYearFrom,
      editionYearTo: q.editionYearTo,
      country: q.country,
      label: q.label,
      format: q.format,
      editionType: q.editionType,
      condition: q.condition,
      ...(p.showPrices ? { paidMin: q.paidMin, paidMax: q.paidMax } : {}),
      ...(p.showValues ? { valueMin: q.valueMin, valueMax: q.valueMax } : {}),
      sort: publicSorts.includes(q.sort) ? q.sort : 'added_desc',
      page: q.page,
      pageSize: q.pageSize,
    });
    return {
      ...res,
      items: res.items.map((i) => ({
        id: i.id,
        releaseId: i.releaseId,
        albumId: i.albumId,
        title: i.title,
        artist: i.artist,
        originalReleaseYear: i.originalReleaseYear,
        releaseYear: i.releaseYear,
        country: i.country,
        formatSummary: i.formatSummary,
        editionType: i.editionType,
        coverImageUrl: i.coverImageUrl,
        conditionMedia: i.conditionMedia,
        conditionSleeve: i.conditionSleeve,
        ...(p.showPrices ? { purchasePriceBase: i.purchasePriceBase } : {}),
        ...(p.showValues ? { estimatedValueBase: i.estimatedValueBase } : {}),
        ...(p.showPrices || p.showValues ? { currency: i.baseCurrency } : {}),
        createdAt: i.createdAt,
      })),
    };
  }

  async function wishlistOf(username: string) {
    const p = await profiles.publicOwner(username, 'wishlist');
    const items = await wishlist.list(p.userId);
    return items.map((w) => ({
      id: w.id,
      album: {
        id: w.album.id,
        title: w.album.title,
        artist: w.album.artistDisplay,
        year: w.album.originalReleaseYear,
        coverImageUrl: w.album.coverImageUrl,
      },
      release: w.release,
      priority: w.priority,
      status: w.status,
    }));
  }

  return { profile, collectionOf, wishlistOf };
}

export type PublicService = ReturnType<typeof publicService>;
