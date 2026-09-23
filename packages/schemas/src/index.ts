import { z } from 'zod';

export const GRADES = ['M', 'NM', 'VG+', 'VG', 'G+', 'G', 'F', 'P'] as const;
export const EDITION_TYPES = [
  'original',
  'reissue',
  'remaster',
  'limited',
  'promo',
  'bootleg',
  'compilation',
  'other',
] as const;
export const WISHLIST_STATUSES = ['wanted', 'searching', 'found', 'purchased'] as const;
export const VISIBILITIES = ['private', 'public'] as const;

export const grade = z.enum(GRADES);
export const editionType = z.enum(EDITION_TYPES);
export const visibility = z.enum(VISIBILITIES);
export const wishlistStatus = z.enum(WISHLIST_STATUSES);

export const currencyCode = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{3}$/, 'Código de moneda ISO 4217 de 3 letras'));

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha en formato YYYY-MM-DD');

const currentYear = () => new Date().getUTCFullYear();
export const year = z
  .number()
  .int()
  .min(1877)
  .refine((y) => y <= currentYear() + 1, 'Año inválido');

const money = z.number().nonnegative().max(10_000_000);
const optionalText = (max = 2000) => z.string().trim().max(max).optional().nullable();

// ─── Profile ────────────────────────────────────────────────────────────────

export const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_.]{3,30}$/, 'Entre 3 y 30 caracteres: letras, números, "_" o "."');

export const profileUpdateInput = z
  .object({
    username,
    displayName: optionalText(80),
    bio: optionalText(500),
    avatarUrl: z.url().max(2000).optional().nullable(),
    profileVisibility: visibility,
    collectionVisibility: visibility,
    wishlistVisibility: visibility,
    showPrices: z.boolean(),
    showValues: z.boolean(),
    baseCurrency: currencyCode,
    locale: z.string().max(10),
  })
  .partial();
export type ProfileUpdateInput = z.infer<typeof profileUpdateInput>;

// ─── Catalog (manual entry) ─────────────────────────────────────────────────

export const labelInput = z.object({
  name: z.string().trim().min(1).max(200),
  catalogNumber: optionalText(100),
});

export const formatInput = z.object({
  name: z.string().trim().min(1).max(50).default('Vinyl'),
  qty: z.number().int().min(1).max(100).default(1),
  size: optionalText(20),
  speed: optionalText(20),
  color: optionalText(50),
  descriptions: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
});

/** Accepts seconds or "m:ss" / "h:mm:ss". */
export const duration = z.union([
  z.number().int().nonnegative(),
  z
    .string()
    .trim()
    .regex(/^(\d+:)?\d{1,2}:\d{2}$/)
    .transform((s) => s.split(':').reduce((acc, part) => acc * 60 + Number(part), 0)),
]);

export const trackInput = z.object({
  position: optionalText(10),
  title: z.string().trim().min(1).max(300),
  duration: duration.optional().nullable(),
  artistCredit: optionalText(300),
});

export const manualReleaseInput = z.object({
  album: z.object({
    artists: z.array(z.string().trim().min(1).max(200)).min(1).max(10),
    title: z.string().trim().min(1).max(300),
    originalReleaseYear: year.optional().nullable(),
    genres: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
    styles: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
    description: optionalText(5000),
  }),
  release: z
    .object({
      year: year.optional().nullable(),
      country: optionalText(60),
      labels: z.array(labelInput).max(10).default([]),
      formats: z.array(formatInput).max(10).default([]),
      editionType: editionType.optional().nullable(),
      barcode: optionalText(40),
      notes: optionalText(5000),
    })
    .default({ labels: [], formats: [] }),
  tracks: z.array(trackInput).max(200).default([]),
});
export type ManualReleaseInput = z.infer<typeof manualReleaseInput>;

// ─── Collection ─────────────────────────────────────────────────────────────

/** Client-generated id (e.g. a UUID) that makes "add" requests safe to retry on bad connections. */
export const clientRequestId = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{8,64}$/)
  .optional();

export const collectionItemFields = z.object({
  conditionMedia: grade.optional().nullable(),
  conditionSleeve: grade.optional().nullable(),
  copyNumber: optionalText(30),
  isFirstPressing: z.boolean().optional().nullable(),
  purchaseDate: isoDate.optional().nullable(),
  purchasePrice: money.optional().nullable(),
  purchaseCurrency: currencyCode.optional().nullable(),
  purchasePlace: optionalText(200),
  storageLocation: optionalText(200),
  notes: optionalText(5000),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  valueOverride: money.optional().nullable(),
  valueOverrideCurrency: currencyCode.optional().nullable(),
});
export type CollectionItemFields = z.infer<typeof collectionItemFields>;

const withPriceCurrency = <T extends z.ZodType<CollectionItemFields>>(s: T) =>
  s
    .refine((v) => v.purchasePrice == null || v.purchaseCurrency != null, {
      message: 'La moneda es obligatoria si hay precio',
      path: ['purchaseCurrency'],
    })
    .refine((v) => v.valueOverride == null || v.valueOverrideCurrency != null, {
      message: 'La moneda es obligatoria si hay valor manual',
      path: ['valueOverrideCurrency'],
    });

/** Exactly one source for the edition: an existing release, a Discogs release, or manual data. */
export const addToCollectionInput = withPriceCurrency(
  collectionItemFields.extend({
    clientRequestId,
    releaseId: z.uuid().optional(),
    discogsReleaseId: z.coerce.number().int().positive().optional(),
    manual: manualReleaseInput.optional(),
  }),
).refine((v) => [v.releaseId, v.discogsReleaseId, v.manual].filter((x) => x != null).length === 1, {
  message: 'Indicá exactamente una fuente: releaseId, discogsReleaseId o manual',
});
export type AddToCollectionInput = z.infer<typeof addToCollectionInput>;

/** Price/currency consistency is checked against the stored row by the service. */
export const updateCollectionItemInput = collectionItemFields;
export type UpdateCollectionItemInput = z.infer<typeof updateCollectionItemInput>;

/** Query-string friendly: arrays accept "a,b,c" or repeated params. */
const list = <T extends z.ZodType>(item: T) =>
  z.preprocess((v) => {
    if (v == null || v === '') return undefined;
    const arr = Array.isArray(v) ? v : [v];
    return arr.flatMap((x) => (typeof x === 'string' ? x.split(',') : [x])).filter((x) => x !== '');
  }, z.array(item).optional());

const num = z.coerce.number();
const int = z.coerce.number().int();

export const COLLECTION_SORTS = [
  'added_desc',
  'added_asc',
  'artist_asc',
  'title_asc',
  'year_asc',
  'year_desc',
  'paid_desc',
  'value_desc',
] as const;

export const collectionQuery = z.object({
  q: z.string().trim().max(200).optional(),
  artistId: list(z.uuid()),
  genre: list(z.string()),
  style: list(z.string()),
  decade: list(int),
  yearFrom: int.optional(),
  yearTo: int.optional(),
  editionYearFrom: int.optional(),
  editionYearTo: int.optional(),
  country: list(z.string()),
  label: list(z.string()),
  format: list(z.string()),
  editionType: list(editionType),
  condition: list(grade),
  tag: list(z.string()),
  /** Physical location (private to the owner). */
  location: list(z.string()),
  paidMin: num.optional(),
  paidMax: num.optional(),
  valueMin: num.optional(),
  valueMax: num.optional(),
  sort: z.enum(COLLECTION_SORTS).default('added_desc'),
  page: int.min(1).default(1),
  pageSize: int.min(1).max(200).default(48),
});
export type CollectionQuery = z.infer<typeof collectionQuery>;

// ─── Wishlist ───────────────────────────────────────────────────────────────

export const wishlistFields = z.object({
  targetPrice: money.optional().nullable(),
  targetCurrency: currencyCode.optional().nullable(),
  priority: z.number().int().min(1).max(3).optional(),
  status: wishlistStatus.optional(),
  notes: optionalText(2000),
});

export const addToWishlistInput = wishlistFields
  .extend({
    clientRequestId,
    albumId: z.uuid().optional(),
    releaseId: z.uuid().optional(),
    discogsReleaseId: z.coerce.number().int().positive().optional(),
    discogsMasterId: z.coerce.number().int().positive().optional(),
    manual: manualReleaseInput.optional(),
  })
  .refine(
    (v) =>
      [v.albumId, v.releaseId, v.discogsReleaseId, v.discogsMasterId, v.manual].filter(
        (x) => x != null,
      ).length === 1,
    { message: 'Indicá exactamente una fuente' },
  );
export type AddToWishlistInput = z.infer<typeof addToWishlistInput>;

export const updateWishlistInput = wishlistFields;
export type UpdateWishlistInput = z.infer<typeof updateWishlistInput>;

export const wishlistQuery = z.object({
  status: list(wishlistStatus),
  includePurchased: z.stringbool().default(false),
});

// ─── Search / external catalog ──────────────────────────────────────────────

export const searchQuery = z.object({
  q: z.string().trim().min(1).max(200),
  limit: int.min(1).max(50).default(10),
});

export const catalogSearchQuery = z.object({
  q: z.string().trim().max(200).optional(),
  artist: z.string().trim().max(200).optional(),
  title: z.string().trim().max(200).optional(),
  catalogNumber: z.string().trim().max(100).optional(),
  barcode: z.string().trim().max(40).optional(),
  country: z.string().trim().max(60).optional(),
  year: int.optional(),
  format: z.string().trim().max(40).optional(),
  type: z.enum(['release', 'master']).default('release'),
  page: int.min(1).default(1),
  perPage: int.min(1).max(50).default(20),
});
export type CatalogSearchQuery = z.infer<typeof catalogSearchQuery>;
