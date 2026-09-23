import type {
  CatalogSearchResult,
  ExternalArtistRef,
  ExternalImage,
  ExternalMaster,
  ExternalRelease,
  ExternalTrack,
  Grade,
  MarketValue,
} from '@kollektor/core';
import type { DArtist, DImage, DMaster, DPriceSuggestions, DRelease, DSearchResult, DTrack, DVersion } from './types';

const SOURCE = 'discogs';
const WEB = 'https://www.discogs.com';

/** "3:45" / "1:02:03" → seconds. */
export function parseDuration(d?: string): number | null {
  if (!d || !/^\d+(:\d{1,2}){1,2}$/.test(d.trim())) return null;
  return d.trim().split(':').reduce((acc, p) => acc * 60 + Number(p), 0);
}

const artists = (list: DArtist[] = []): ExternalArtistRef[] =>
  list.map((a) => ({ externalId: String(a.id), name: a.name, joinPhrase: a.join?.trim() || null }));

const images = (list: DImage[] = []): ExternalImage[] =>
  list
    .filter((i) => i.uri)
    .map((i) => ({ kind: i.type === 'primary' ? 'primary' : 'secondary', url: i.uri, width: i.width ?? null, height: i.height ?? null }));

const artistCredit = (list?: DArtist[]) =>
  list?.length ? list.map((a, i) => a.name + (i < list.length - 1 ? ` ${a.join?.trim() || ','} ` : '')).join('').replace(/ , /g, ', ') : null;

/** Flattens index tracks into their sub-tracks and drops headings. */
export function mapTracklist(list: DTrack[] = []): ExternalTrack[] {
  const out: ExternalTrack[] = [];
  for (const t of list) {
    if (t.type_ === 'heading') continue;
    if (t.type_ === 'index' && t.sub_tracks?.length) {
      out.push(...mapTracklist(t.sub_tracks.map((s) => ({ ...s, type_: 'track' as const }))));
      continue;
    }
    out.push({
      position: t.position?.trim() || null,
      title: t.title,
      durationSeconds: parseDuration(t.duration),
      artistCredit: artistCredit(t.artists),
    });
  }
  return out;
}

export function formatSummary(r: DRelease): string | null {
  if (!r.formats?.length) return null;
  return r.formats
    .map((f) => {
      const qty = Number(f.qty ?? 1);
      return [qty > 1 ? `${qty}×${f.name}` : f.name, ...(f.descriptions ?? []), f.text].filter(Boolean).join(', ');
    })
    .join(' + ');
}

export function mapRelease(r: DRelease, currency = 'USD'): ExternalRelease {
  return {
    source: SOURCE,
    externalId: String(r.id),
    url: r.uri ?? `${WEB}/release/${r.id}`,
    title: r.title,
    artists: artists(r.artists),
    year: r.year && r.year > 0 ? r.year : null,
    releaseDate: r.released && /^\d{4}-\d{2}-\d{2}$/.test(r.released) && !r.released.endsWith('-00') ? r.released : null,
    country: r.country || null,
    genres: r.genres ?? [],
    styles: r.styles ?? [],
    labels: (r.labels ?? []).map((l) => ({ externalId: l.id ? String(l.id) : null, name: l.name, catalogNumber: l.catno ?? null })),
    formats: (r.formats ?? []).map((f) => ({
      name: f.name,
      qty: Math.max(1, Number(f.qty ?? 1) || 1),
      descriptions: f.descriptions ?? [],
      text: f.text?.trim() || null,
    })),
    formatSummary: formatSummary(r),
    barcodes: (r.identifiers ?? []).filter((i) => i.type === 'Barcode').map((i) => i.value.replace(/\s/g, '')),
    tracklist: mapTracklist(r.tracklist),
    images: images(r.images),
    notes: r.notes ?? null,
    masterId: r.master_id ? String(r.master_id) : null,
    community: { have: r.community?.have ?? null, want: r.community?.want ?? null },
    lowestPrice: r.lowest_price != null ? { amount: r.lowest_price, currency } : null,
    numForSale: r.num_for_sale ?? null,
  };
}

export function mapMaster(m: DMaster): ExternalMaster {
  return {
    source: SOURCE,
    externalId: String(m.id),
    url: m.uri ?? `${WEB}/master/${m.id}`,
    title: m.title,
    artists: artists(m.artists),
    year: m.year && m.year > 0 ? m.year : null,
    genres: m.genres ?? [],
    styles: m.styles ?? [],
    mainReleaseId: m.main_release ? String(m.main_release) : null,
    images: images(m.images),
  };
}

/** Search titles come as "Artist - Title". */
export function splitTitle(title: string): { artist: string | null; title: string } {
  const i = title.indexOf(' - ');
  return i === -1 ? { artist: null, title } : { artist: title.slice(0, i), title: title.slice(i + 3) };
}

export function mapSearchResult(r: DSearchResult): CatalogSearchResult {
  const { artist, title } = splitTitle(r.title);
  const year = Number(r.year);
  return {
    source: SOURCE,
    type: r.type === 'master' ? 'master' : 'release',
    externalId: String(r.id),
    masterId: r.master_id ? String(r.master_id) : null,
    title,
    artist,
    year: Number.isFinite(year) && year > 0 ? year : null,
    country: r.country ?? null,
    labels: [...new Set(r.label ?? [])],
    catalogNumber: r.catno && r.catno !== 'none' ? r.catno : null,
    formats: r.format ?? [],
    barcodes: (r.barcode ?? []).map((b) => b.replace(/\s/g, '')),
    thumbUrl: r.thumb || null,
    coverUrl: r.cover_image || null,
    community: { have: r.community?.have ?? null, want: r.community?.want ?? null },
  };
}

export function mapVersion(v: DVersion, master: { artist: string | null }): CatalogSearchResult {
  const year = Number(v.released?.slice(0, 4));
  return {
    source: SOURCE,
    type: 'release',
    externalId: String(v.id),
    masterId: null,
    title: v.title,
    artist: master.artist,
    year: Number.isFinite(year) && year > 0 ? year : null,
    country: v.country ?? null,
    labels: v.label ? [v.label] : [],
    catalogNumber: v.catno ?? null,
    formats: [...(v.major_formats ?? []), ...(v.format ? v.format.split(',').map((s) => s.trim()) : [])],
    barcodes: [],
    thumbUrl: v.thumb || null,
    coverUrl: null,
    community: { have: v.stats?.community?.in_collection ?? null, want: v.stats?.community?.in_wantlist ?? null },
  };
}

const CONDITION_MAP: Record<string, Grade> = {
  'Mint (M)': 'M',
  'Near Mint (NM or M-)': 'NM',
  'Very Good Plus (VG+)': 'VG+',
  'Very Good (VG)': 'VG',
  'Good Plus (G+)': 'G+',
  'Good (G)': 'G',
  'Fair (F)': 'F',
  'Poor (P)': 'P',
};

export function mapPriceSuggestions(s: DPriceSuggestions): MarketValue[] {
  return Object.entries(s)
    .filter(([k, v]) => CONDITION_MAP[k] && v && Number.isFinite(v.value))
    .map(([k, v]) => ({ kind: 'suggestion' as const, condition: CONDITION_MAP[k]!, amount: Math.round(v.value * 100) / 100, currency: v.currency }));
}
