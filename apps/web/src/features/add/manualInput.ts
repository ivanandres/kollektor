import type { AddToCollectionInput, ManualReleaseInput } from '@kollektor/schemas';
import { parseAmount } from '@/lib/amount';

/** Pure logic of the manual entry form (1h): values ↔ API input. */
export type Values = Record<FieldKey, string>;
export type FieldKey =
  | 'artist'
  | 'title'
  | 'year'
  | 'genre'
  | 'style'
  | 'tracklist'
  | 'editionYear'
  | 'country'
  | 'label'
  | 'catalog'
  | 'format'
  | 'editionType'
  | 'condMedia'
  | 'condSleeve'
  | 'barcode'
  | 'date'
  | 'price'
  | 'currency'
  | 'place'
  | 'notes'
  | 'location'
  | 'tags';

export function blank(currency: string): Values {
  return {
    artist: '',
    title: '',
    year: '',
    genre: '',
    style: '',
    tracklist: '',
    editionYear: '',
    country: '',
    label: '',
    catalog: '',
    format: 'LP',
    editionType: '',
    condMedia: '',
    condSleeve: '',
    barcode: '',
    date: new Date().toISOString().slice(0, 10),
    price: '',
    currency,
    place: '',
    notes: '',
    location: '',
    tags: '',
  };
}

/** "A1 Title 3:45" per line → tracks. */
export function parseTracklist(text: string) {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^([A-Za-z]?\d{1,2}[a-z]?|[A-Z])[.)]?\s+(.+?)(?:\s+(\d{1,2}:\d{2}))?$/);
      if (m) return { position: m[1]!, title: m[2]!, duration: m[3] ?? null };
      const d = line.match(/^(.+?)\s+(\d{1,2}:\d{2})$/);
      return d
        ? { position: null, title: d[1]!, duration: d[2]! }
        : { position: null, title: line, duration: null };
    });
}

const int = (v: string) => (v.trim() && /^\d+$/.test(v.trim()) ? Number(v.trim()) : null);
const opt = (v: string) => (v.trim() ? v.trim() : null);

export function toInput(v: Values): AddToCollectionInput {
  const qtyMatch = v.format.match(/^(\d+)×(.+)$/);
  const price = parseAmount(v.price);
  return {
    manual: {
      album: {
        artists: v.artist.split(/\s*[;/]\s*/).filter(Boolean),
        title: v.title.trim(),
        originalReleaseYear: int(v.year),
        genres: v.genre.trim() ? [v.genre.trim()] : [],
        styles: v.style
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean),
      },
      release: {
        year: int(v.editionYear) ?? int(v.year),
        country: opt(v.country),
        labels: v.label.trim() ? [{ name: v.label.trim(), catalogNumber: opt(v.catalog) }] : [],
        formats: [
          {
            name: 'Vinyl',
            qty: qtyMatch ? Number(qtyMatch[1]) : 1,
            descriptions: [qtyMatch ? qtyMatch[2]! : v.format].filter(Boolean),
          },
        ],
        editionType: opt(v.editionType) as ManualReleaseInput['release']['editionType'],
        barcode: opt(v.barcode),
      },
      tracks: parseTracklist(v.tracklist),
    },
    conditionMedia: (opt(v.condMedia) as AddToCollectionInput['conditionMedia']) ?? null,
    conditionSleeve: (opt(v.condSleeve) as AddToCollectionInput['conditionSleeve']) ?? null,
    purchaseDate: opt(v.date),
    purchasePrice: price,
    purchaseCurrency: price != null ? v.currency : null,
    purchasePlace: opt(v.place),
    notes: opt(v.notes),
    storageLocation: opt(v.location),
    tags: v.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
  } as AddToCollectionInput;
}
