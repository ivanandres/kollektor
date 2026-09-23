import { Hono } from 'hono';
import {
  addToCollectionInput,
  collectionQuery,
  updateCollectionItemInput,
} from '@kollektor/schemas';
import { jsonBody, parse, queryObject } from '../lib/http';
import type { AppDeps, AppEnv } from '../types';

/** RFC 4180 cell; neutralizes spreadsheet formula injection. */
function csvCell(v: string): string {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function collectionRoutes({ core }: AppDeps) {
  const withAchievements = async <T extends { unlockedAchievements: string[] }>(r: T) => ({
    ...r,
    unlockedAchievements: await core.achievements.getByCodes(r.unlockedAchievements),
  });
  return (
    new Hono<AppEnv>()
      .get('/', async (c) =>
        c.json(await core.collection.list(c.get('userId'), parse(collectionQuery, queryObject(c)))),
      )
      .get('/facets', async (c) => c.json(await core.collection.facets(c.get('userId'))))
      // Owner-only export (includes private fields). Your data is yours.
      .get('/export.csv', async (c) => {
        const rows: string[][] = [];
        for (let page = 1; ; page++) {
          const res = await core.collection.list(c.get('userId'), {
            ...parse(collectionQuery, {}),
            page,
            pageSize: 200,
          });
          for (const i of res.items) {
            const d = await core.collection.get(c.get('userId'), i.id);
            rows.push([
              d.release.album.artistDisplay,
              d.release.album.title,
              String(d.release.album.originalReleaseYear ?? ''),
              String(d.release.releaseYear ?? ''),
              d.release.country ?? '',
              d.release.labels.map((l) => l.name).join(' / '),
              d.release.labels
                .map((l) => l.catalogNumber ?? '')
                .filter(Boolean)
                .join(' / '),
              d.release.formatSummary ?? '',
              d.conditionMedia ?? '',
              d.conditionSleeve ?? '',
              d.purchaseDate ?? '',
              d.purchasePrice?.toString() ?? '',
              d.purchaseCurrency ?? '',
              d.value.estimated?.toString() ?? '',
              d.value.baseCurrency ?? '',
              d.purchasePlace ?? '',
              d.storageLocation ?? '',
              d.tags.join(' / '),
              d.notes ?? '',
            ]);
          }
          if (page >= res.pages) break;
        }
        const header = [
          'artista',
          'album',
          'año_original',
          'año_edicion',
          'pais',
          'sello',
          'catalogo',
          'formato',
          'estado_disco',
          'estado_tapa',
          'fecha_compra',
          'precio',
          'moneda',
          'valor_estimado',
          'moneda_base',
          'lugar_compra',
          'ubicacion',
          'tags',
          'notas',
        ];
        const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
        c.header('Content-Type', 'text/csv; charset=utf-8');
        c.header('Content-Disposition', 'attachment; filename="kollektor-coleccion.csv"');
        return c.body(`\uFEFF${csv}`);
      })
      .post('/', async (c) => {
        const body = (await jsonBody(c)) as Record<string, unknown>;
        const key = c.req.header('idempotency-key');
        const input = parse(
          addToCollectionInput,
          key && body && typeof body === 'object' ? { clientRequestId: key, ...body } : body,
        );
        const result = await core.collection.add(c.get('userId'), input);
        return c.json(await withAchievements(result), result.replayed ? 200 : 201);
      })
      .get('/:id{[0-9a-f-]{36}}', async (c) =>
        c.json(await core.collection.get(c.get('userId'), c.req.param('id'))),
      )
      .patch('/:id{[0-9a-f-]{36}}', async (c) => {
        const input = parse(updateCollectionItemInput, await jsonBody(c));
        return c.json(
          await withAchievements(
            await core.collection.update(c.get('userId'), c.req.param('id'), input),
          ),
        );
      })
      .delete('/:id{[0-9a-f-]{36}}', async (c) => {
        await core.collection.remove(c.get('userId'), c.req.param('id'));
        return c.body(null, 204);
      })
  );
}
