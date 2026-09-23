import { normalizeCatalogNumber, normalizeText } from '../../lib/normalize';

export interface QueryToken {
  /** normalized text token */
  text: string;
  /** catalog-number normalized form ("shvl804") */
  catno: string;
  /** set when the token looks like a year */
  year: number | null;
}

export function tokenize(q: string, now = new Date()): QueryToken[] {
  const maxYear = now.getUTCFullYear() + 1;
  const seen = new Set<string>();
  return normalizeText(q)
    .split(' ')
    .filter((t) => t.length > 0 && !seen.has(t) && seen.add(t))
    .slice(0, 8)
    .map((text) => {
      const n = /^\d{4}$/.test(text) ? Number(text) : NaN;
      return {
        text,
        catno: normalizeCatalogNumber(text),
        year: n >= 1877 && n <= maxYear ? n : null,
      };
    });
}

export const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
