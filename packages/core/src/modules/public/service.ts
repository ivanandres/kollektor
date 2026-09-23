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
    const res = await collection.list(p.userId, {
      ...q,
      paidMin: undefined,
      paidMax: undefined,
      ...(p.showValues ? {} : { valueMin: undefined, valueMax: undefined }),
      ...(q.sort === 'paid_desc' && !p.showPrices ? { sort: 'added_desc' } : {}),
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
