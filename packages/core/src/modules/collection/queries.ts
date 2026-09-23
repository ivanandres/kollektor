import { sql, type SQL } from 'drizzle-orm';
import type { CollectionQuery } from '@kollektor/schemas';
import { allTokensMatch } from '../search/conditions';
import { tokenize } from '../search/tokens';

/** Filters over `collection_items ci JOIN releases r JOIN albums a`. All filters combine with AND. */
export function collectionFilters(userId: string, q: CollectionQuery, now: Date): SQL {
  const f: SQL[] = [sql`ci.user_id = ${userId}`, sql`ci.deleted_at IS NULL`];
  const albumYear = sql`coalesce(a.original_release_year, r.release_year)`;
  const arr = (values: (string | number)[]) =>
    sql`ARRAY[${sql.join(values.map((v) => sql`${v}`), sql`, `)}]`;

  if (q.q) f.push(allTokensMatch(tokenize(q.q, now)));
  if (q.artistId?.length)
    f.push(sql`EXISTS (SELECT 1 FROM album_artists aa WHERE aa.album_id = a.id AND aa.artist_id::text = ANY(${arr(q.artistId)}))`);
  if (q.genre?.length)
    f.push(sql`EXISTS (SELECT 1 FROM album_genres ag JOIN genres g ON g.id = ag.genre_id WHERE ag.album_id = a.id AND g.name = ANY(${arr(q.genre)}))`);
  if (q.style?.length)
    f.push(sql`EXISTS (SELECT 1 FROM album_styles ast JOIN styles s ON s.id = ast.style_id WHERE ast.album_id = a.id AND s.name = ANY(${arr(q.style)}))`);
  if (q.decade?.length) f.push(sql`(${albumYear} / 10) * 10 = ANY(${arr(q.decade)}::int[])`);
  if (q.yearFrom != null) f.push(sql`${albumYear} >= ${q.yearFrom}`);
  if (q.yearTo != null) f.push(sql`${albumYear} <= ${q.yearTo}`);
  if (q.editionYearFrom != null) f.push(sql`r.release_year >= ${q.editionYearFrom}`);
  if (q.editionYearTo != null) f.push(sql`r.release_year <= ${q.editionYearTo}`);
  if (q.country?.length) f.push(sql`r.country = ANY(${arr(q.country)})`);
  if (q.label?.length)
    f.push(sql`EXISTS (SELECT 1 FROM release_labels rl JOIN labels lb ON lb.id = rl.label_id WHERE rl.release_id = r.id AND lb.name = ANY(${arr(q.label)}))`);
  if (q.format?.length)
    f.push(sql`EXISTS (SELECT 1 FROM release_formats rf WHERE rf.release_id = r.id AND (rf.name = ANY(${arr(q.format)}) OR rf.descriptions && ${arr(q.format)}::text[] OR rf.size = ANY(${arr(q.format)})))`);
  if (q.editionType?.length) f.push(sql`r.edition_type::text = ANY(${arr(q.editionType)})`);
  if (q.condition?.length) f.push(sql`ci.condition_media::text = ANY(${arr(q.condition)})`);
  if (q.tag?.length)
    f.push(sql`EXISTS (SELECT 1 FROM collection_item_tags cit JOIN tags tg ON tg.id = cit.tag_id WHERE cit.collection_item_id = ci.id AND tg.name = ANY(${arr(q.tag)}))`);
  if (q.paidMin != null) f.push(sql`ci.purchase_price_base >= ${q.paidMin}`);
  if (q.paidMax != null) f.push(sql`ci.purchase_price_base <= ${q.paidMax}`);
  if (q.valueMin != null) f.push(sql`ci.estimated_value_base >= ${q.valueMin}`);
  if (q.valueMax != null) f.push(sql`ci.estimated_value_base <= ${q.valueMax}`);
  return sql.join(f, sql` AND `);
}

export const ARTIST_DISPLAY = sql`(SELECT string_agg(ar.name, ', ' ORDER BY aa.position)
  FROM album_artists aa JOIN artists ar ON ar.id = aa.artist_id WHERE aa.album_id = a.id)`;

export const ARTIST_SORT = sql`(SELECT ar.sort_name FROM album_artists aa JOIN artists ar ON ar.id = aa.artist_id
  WHERE aa.album_id = a.id ORDER BY aa.position LIMIT 1)`;

export const COVER_URL = sql`coalesce((SELECT ri.url FROM release_images ri WHERE ri.release_id = r.id
  ORDER BY (ri.kind = 'primary') DESC, ri.position LIMIT 1), a.cover_image_url)`;

export function collectionOrderBy(sort: CollectionQuery['sort']): SQL {
  switch (sort) {
    case 'added_asc':
      return sql`ci.created_at ASC`;
    case 'artist_asc':
      return sql`${ARTIST_SORT} ASC NULLS LAST, coalesce(a.original_release_year, r.release_year) ASC NULLS LAST, a.title_normalized`;
    case 'title_asc':
      return sql`a.title_normalized ASC`;
    case 'year_asc':
      return sql`coalesce(a.original_release_year, r.release_year) ASC NULLS LAST, a.title_normalized`;
    case 'year_desc':
      return sql`coalesce(a.original_release_year, r.release_year) DESC NULLS LAST, a.title_normalized`;
    case 'paid_desc':
      return sql`ci.purchase_price_base DESC NULLS LAST`;
    case 'value_desc':
      return sql`ci.estimated_value_base DESC NULLS LAST`;
    default:
      return sql`ci.created_at DESC`;
  }
}
