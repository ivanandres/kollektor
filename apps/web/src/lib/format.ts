/** Display helpers. Numbers use es-AR grouping ("4.250", "24,7"), like the mockups. */

const intFmt = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const dec1Fmt = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function num(n: number | null | undefined): string {
  return n == null ? '—' : intFmt.format(Math.round(n));
}

export function dec1(n: number | null | undefined): string {
  return n == null ? '—' : dec1Fmt.format(n);
}

/** "USD 4.250" */
export function money(n: number | null | undefined, currency = 'USD'): string {
  return n == null ? '—' : `${currency} ${num(n)}`;
}

/** "+1.430" / "−320" (true minus sign, as in the mockups). */
export function signed(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${n >= 0 ? '+' : '−'}${num(Math.abs(n))}`;
}

/** "+USD 1.430" */
export function signedMoney(n: number | null | undefined, currency = 'USD'): string {
  if (n == null) return '—';
  return `${n >= 0 ? '+' : '−'}${currency} ${num(Math.abs(n))}`;
}

export function pct(part: number, total: number): string {
  if (!total) return '0%';
  return `${Math.max(0, Math.min(100, Math.round((part / total) * 100)))}%`;
}

/** "21/09" or "21/09/2026" */
export function shortDate(iso: string | null | undefined, withYear = false): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return withYear ? `${dd}/${mm}/${d.getFullYear()}` : `${dd}/${mm}`;
}

/** "hoy", "ayer", "hace 3 días", or the date. */
export function relativeDay(iso: string | null | undefined): string {
  if (!iso) return '—';
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((start(new Date()) - start(new Date(iso))) / 86_400_000);
  if (days <= 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 7) return `hace ${days} días`;
  return shortDate(iso, true);
}

/** "3:45" */
export function duration(seconds: number | null | undefined): string {
  if (seconds == null) return '';
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, '0');
  if (m >= 60) return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${s}`;
  return `${m}:${s}`;
}

const EDITION_SHORT: Record<string, string> = {
  original: '1ª ed.',
  reissue: 'Reedición',
  remaster: 'Remaster',
  limited: 'Limitada',
  promo: 'Promo',
  bootleg: 'Bootleg',
  compilation: 'Compilado',
};

const EDITION_LONG: Record<string, string> = {
  original: '1ª edición',
  reissue: 'Reedición',
  remaster: 'Remaster',
  limited: 'Edición limitada',
  promo: 'Promo',
  bootleg: 'Bootleg',
  compilation: 'Compilado',
  other: 'Otra',
};

export const editionLong = (t: string | null | undefined) => (t ? (EDITION_LONG[t] ?? t) : '—');

const COUNTRY_SHORT: Record<string, string> = {
  Argentina: 'AR',
  Japan: 'JP',
  Japón: 'JP',
  Germany: 'DE',
  Alemania: 'DE',
  Netherlands: 'NL',
  France: 'FR',
  Italy: 'IT',
  Spain: 'ES',
  Brazil: 'BR',
  Mexico: 'MX',
  Canada: 'CA',
  Europe: 'EU',
  Australia: 'AU',
};

/** Country as shown in the edition line: "UK", "US", "JP", "AR"… */
export const countryShort = (c: string | null | undefined) => (c ? (COUNTRY_SHORT[c] ?? c) : null);

/** "UK 1973 · 1ª ed." */
export function editionLine(
  country: string | null | undefined,
  year: number | null | undefined,
  editionType: string | null | undefined,
): string {
  const head = [countryShort(country), year].filter(Boolean).join(' ');
  const tail = editionType ? EDITION_SHORT[editionType] : undefined;
  return [head || null, tail].filter(Boolean).join(' · ') || 'Edición sin datos';
}

/** "Vinyl, LP, Album" → "LP"; "Vinyl, 3×LP, Album, Limited Edition" → "3×LP, Limited Edition". */
export function formatShort(summary: string | null | undefined): string {
  if (!summary) return '—';
  const parts = summary
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p && !/^(vinyl|album)$/i.test(p));
  return parts.slice(0, 2).join(', ') || 'LP';
}

/** Sort key for the shelf: "The Beatles" files under B. */
export const shelfName = (artist: string) => artist.replace(/^the\s+/i, '');

/** Short mark for an achievement badge: "50 discos" → "50", "5 géneros" → "5G", "Pink Floyd Complete" → "PF". */
export function badgeMark(name: string): string {
  if (/^primer\b/i.test(name)) return '1';
  const m = name.match(/^(\d+)\s+(\S+)/);
  if (m) {
    const word = m[2]!.toLowerCase();
    return /^(discos|vinilos)$/.test(word) ? m[1]! : `${m[1]}${word[0]!.toUpperCase()}`;
  }
  const words = name
    .split(/\s+/)
    .filter((w) => w && !/^(de|del|la|las|el|los|y|en|a|complete|completo)$/i.test(w));
  return (
    words
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || '★'
  );
}

export const PRIORITY_LABEL: Record<number, string> = { 1: 'ALTA', 2: 'MEDIA', 3: 'BAJA' };

export const CONDITIONS = ['M', 'NM', 'VG+', 'VG', 'G', 'P'] as const;
