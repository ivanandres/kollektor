import { normalizeText } from '../../lib/normalize';

/** RFC 4180 parser: quotes, escaped quotes, CRLF/LF, BOM, ',' or ';' delimiter (Excel es-AR). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '');
  const firstLine = src.slice(0, src.search(/\r?\n|$/));
  const delimiter =
    (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '')
      quoted = true; // quotes only open at the start of a cell (12" stays literal)
    else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

const ALIASES: Record<string, string[]> = {
  releaseId: ['release_id', 'release id', 'discogs id', 'discogs_id'],
  artist: ['artist', 'artista', 'artists', 'artistas', 'interprete', 'banda'],
  title: ['title', 'titulo', 'album', 'disco', 'nombre'],
  year: ['year', 'ano', 'released', 'ano original', 'original year'],
  editionYear: ['ano edicion', 'edition year', 'ano de edicion'],
  label: ['label', 'sello', 'discografica'],
  catalogNumber: [
    'catalog#',
    'catalog',
    'catalogo',
    'catalog number',
    'nro catalogo',
    'numero de catalogo',
    'catno',
  ],
  country: ['country', 'pais'],
  format: ['format', 'formato'],
  genre: ['genre', 'genero', 'generos', 'genres'],
  mediaCondition: [
    'collection media condition',
    'media condition',
    'estado',
    'estado disco',
    'condicion',
    'condition',
  ],
  sleeveCondition: [
    'collection sleeve condition',
    'sleeve condition',
    'estado tapa',
    'estado portada',
  ],
  price: ['price', 'precio', 'precio pagado', 'paid', 'costo'],
  currency: ['currency', 'moneda'],
  purchaseDate: ['date added', 'fecha', 'fecha compra', 'fecha de compra', 'purchase date'],
  place: ['lugar', 'lugar de compra', 'tienda', 'store', 'place'],
  location: ['ubicacion', 'location', 'estante'],
  notes: ['collection notes', 'notes', 'notas', 'comentarios', 'observaciones'],
};

export type CsvField = keyof typeof ALIASES;

/** Maps header cells to known fields (accent/case-insensitive, Spanish or English). */
export function mapHeader(header: string[]): Partial<Record<CsvField, number>> {
  const out: Partial<Record<CsvField, number>> = {};
  header.forEach((h, i) => {
    const n = normalizeText(h.replace(/#/g, ' # '))
      .replace(/ # /g, '#')
      .replace(/\s+/g, ' ')
      .trim();
    for (const [field, names] of Object.entries(ALIASES) as [CsvField, string[]][]) {
      if (
        out[field] == null &&
        names.some((a) => normalizeText(a) === n || a === h.trim().toLowerCase())
      )
        out[field] = i;
    }
  });
  return out;
}

const GRADE_MAP: [RegExp, 'M' | 'NM' | 'VG+' | 'VG' | 'G+' | 'G' | 'F' | 'P'][] = [
  [/near mint|\bnm\b|m-/i, 'NM'],
  [/^mint|\(m\)|^m$/i, 'M'],
  [/very good plus|vg\+/i, 'VG+'],
  [/very good|\bvg\b/i, 'VG'],
  [/good plus|g\+/i, 'G+'],
  [/^good|\(g\)|^g$/i, 'G'],
  [/fair|^f$/i, 'F'],
  [/poor|^p$/i, 'P'],
];

/** "Near Mint (NM or M-)" / "VG+" / "vg plus" → Goldmine grade. */
export function parseGrade(
  v: string | undefined,
): 'M' | 'NM' | 'VG+' | 'VG' | 'G+' | 'G' | 'F' | 'P' | null {
  const s = v?.trim();
  if (!s) return null;
  for (const [re, g] of GRADE_MAP) if (re.test(s)) return g;
  return null;
}

const CURRENCY_SIGNS: [RegExp, string][] = [
  [/U\$S|US\$|USD/i, 'USD'],
  [/R\$|BRL/i, 'BRL'],
  [/€|EUR/i, 'EUR'],
  [/£|GBP/i, 'GBP'],
  [/¥|JPY/i, 'JPY'],
  [/ARS/i, 'ARS'],
  [/UYU/i, 'UYU'],
  [/CLP/i, 'CLP'],
  [/MXN/i, 'MXN'],
];

/** "$ 35.000,50" / "35000.5" / "U$S 20" / "USD20" / "€ 20" → amount + currency if stated. */
export function parsePrice(v: string | undefined): {
  amount: number | null;
  currency: string | null;
} {
  const s = v?.trim();
  if (!s) return { amount: null, currency: null };
  const currency = CURRENCY_SIGNS.find(([re]) => re.test(s))?.[1] ?? null;
  let num = s.replace(/[^\d.,-]/g, '');
  if (/,\d{1,2}$/.test(num))
    num = num.replace(/\./g, '').replace(',', '.'); // 35.000,50
  else if (/^\d{1,3}(\.\d{3})+$/.test(num))
    num = num.replace(/\./g, ''); // 45.000 (es-AR thousands)
  else num = num.replace(/,/g, ''); // 1,200.00
  const amount = Number(num);
  return { amount: Number.isFinite(amount) && num !== '' && amount >= 0 ? amount : null, currency };
}

/** ISO 4217-looking code or null ("Pesos" → null). */
export function parseCurrencyCode(v: string | undefined): string | null {
  const s = v?.trim().toUpperCase();
  if (!s) return null;
  if (/^[A-Z]{3}$/.test(s)) return s;
  return CURRENCY_SIGNS.find(([re]) => re.test(s))?.[1] ?? null;
}

const isRealDate = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

/** "2024-03-12", "12/03/2024" (dd/mm), "2024-03-12 10:00:00" → YYYY-MM-DD. */
export function parseDate(v: string | undefined): string | null {
  const s = v?.trim();
  if (!s) return null;
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (match) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s)))
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else return null;
  // Invalid calendar dates (05/13/2024 read as dd/mm, 2024-02-31) are dropped, not guessed.
  return isRealDate(y, m, d)
    ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    : null;
}
