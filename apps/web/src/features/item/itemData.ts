import type { CollectionItem, EssentialProgress } from '@kollektor/api-client';
import { countryEs } from '@/lib/filters';
import { editionLong, shortDate } from '@kollektor/app-logic';

export function coverOf(item: CollectionItem): string | null {
  return item.release.coverImageUrl ?? item.release.album.coverImageUrl ?? null;
}

export function formatLabel(item: CollectionItem): string {
  const f = item.release.formats[0];
  if (!f) return item.release.formatSummary ?? '—';
  const desc = f.descriptions.filter((d) => !/^album$/i.test(d));
  const main = desc.length ? desc : [f.name];
  const head = f.qty > 1 ? `${f.qty}×${main[0]}` : main[0];
  return [head, ...main.slice(1), f.color].filter(Boolean).join(' · ');
}

export function sourceLabel(item: CollectionItem): { text: string; url: string | null } {
  if (!item.release.isVerified) return { text: 'Carga manual', url: null };
  const ext = item.release.external.find((e) => e.source === 'discogs') ?? item.release.external[0];
  if (!ext) return { text: '—', url: null };
  const name = ext.source === 'discogs' ? 'Discogs' : ext.source === 'demo' ? 'Demo' : ext.source;
  return { text: `${name} #${ext.externalId}`, url: ext.url };
}

export function metaRows(item: CollectionItem): { k: string; v: string; href?: string | null }[] {
  const r = item.release;
  const labels = r.labels.map((l) => l.name).filter(Boolean);
  const cat = r.labels.map((l) => l.catalogNumber).filter(Boolean);
  const src = sourceLabel(item);
  return [
    { k: 'Año original', v: String(r.album.originalReleaseYear ?? '—') },
    { k: 'Año de edición', v: String(r.releaseYear ?? '—') },
    { k: 'País', v: countryEs(r.country) },
    { k: 'Sello', v: labels.join(', ') || '—' },
    { k: 'Catálogo', v: cat.join(', ') || '—' },
    { k: 'Formato', v: formatLabel(item) },
    {
      k: 'Edición',
      v: `${editionLong(r.editionType)}${item.copyNumber ? ` · Nº ${item.copyNumber}` : ''}`,
    },
    { k: 'Fuente', v: src.text, href: src.url },
  ];
}

export function tags(
  item: CollectionItem,
): { label: string; kind: 'accent' | 'neutral' | 'outline' }[] {
  const out: { label: string; kind: 'accent' | 'neutral' | 'outline' }[] = [];
  if (
    item.isFirstPressing ||
    (item.isFirstPressing == null && item.release.editionType === 'original')
  )
    out.push({ label: '1ª edición', kind: 'accent' });
  const cond = [item.conditionMedia, item.conditionSleeve].filter(Boolean).join(' / ');
  if (cond) out.push({ label: cond, kind: 'neutral' });
  const genre = [item.release.album.genres[0], item.release.album.styles[0]]
    .filter(Boolean)
    .join(' · ');
  if (genre) out.push({ label: genre, kind: 'neutral' });
  if (!item.release.isVerified) out.push({ label: 'Carga manual', kind: 'outline' });
  return out;
}

const SOURCE_NAME: Record<string, string> = {
  discogs: 'Discogs Marketplace',
  demo: 'datos de demostración',
};

export function valueNote(item: CollectionItem, withYear = false): string {
  const v = item.value;
  if (v.override) return 'Valor cargado por vos. No es una tasación.';
  if (!v.estimate) return 'Todavía no hay datos de mercado para esta edición.';
  const src = SOURCE_NAME[v.estimate.source] ?? v.estimate.source;
  return `Estimación de ${src}, act. ${shortDate(v.estimate.capturedAt, withYear)}. No es una tasación.`;
}

/** The essential discography this record's artist belongs to, if any. */
export function essentialFor(item: CollectionItem, list: EssentialProgress[] | undefined) {
  const names = item.release.album.artists.map((a) => a.name.toLowerCase());
  return (list ?? []).find((e) => names.includes(e.artistName.toLowerCase())) ?? null;
}

export function totalDuration(item: CollectionItem): number | null {
  const d = item.release.tracks.map((t) => t.durationSeconds);
  return d.length && d.every((x) => x != null) ? d.reduce<number>((a, b) => a + (b ?? 0), 0) : null;
}
