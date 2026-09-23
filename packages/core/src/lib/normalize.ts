/** Lowercase, strip diacritics, unify punctuation and collapse whitespace. Used for search/dedupe. */
export function normalizeText(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const LEADING_ARTICLES = /^(the|a|an|los|las|el|la|les|le|die|der|das) /;

/** "The Beatles" → "beatles", used to sort artists like record stores do. */
export function sortName(name: string): string {
  return normalizeText(name).replace(LEADING_ARTICLES, '');
}

/** Catalog numbers are compared ignoring spaces, dashes and dots: "SHVL 804" == "shvl-804". */
export function normalizeCatalogNumber(catno: string): string {
  return normalizeText(catno).replace(/[\s.\-/']/g, '');
}

/** Discogs disambiguates homonyms as "Love (2)". */
export function stripDisambiguation(name: string): string {
  return name.replace(/\s\(\d+\)$/, '').trim();
}

/** "A1" → "A", "B12" → "B", "1-04" → null. */
export function sideFromPosition(position: string | null | undefined): string | null {
  if (!position) return null;
  const m = /^([A-Z]{1,2})\d*/.exec(position.trim().toUpperCase());
  return m?.[1] ?? null;
}

export function decadeOf(year: number | null | undefined): number | null {
  return year == null ? null : Math.floor(year / 10) * 10;
}
