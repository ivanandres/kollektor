import { Hono } from 'hono';
import { z } from 'zod';
import {
  addToCollectionInput,
  collectionQuery,
  updateCollectionItemInput,
} from '@kollektor/schemas';
import { jsonBody, parse, queryObject } from '../lib/http';
import { IMAGE_TYPES, requireStorage, verifyUploadedImage, type ImageType } from '../lib/uploads';
import type { AppDeps, AppEnv } from '../types';

/** RFC 4180 cell; neutralizes spreadsheet formula injection. */
function csvCell(v: string): string {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const ID = '[0-9a-f-]{36}';

export function collectionRoutes({ core, storage }: AppDeps) {
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
        const rows = await core.collection.exportRows(c.get('userId'));
        const header = Object.keys(rows[0] ?? { artista: '', album: '' });
        const lines = [
          header,
          ...rows.map((r) => header.map((h) => (r[h] == null ? '' : String(r[h])))),
        ];
        const csv = lines.map((r) => r.map(csvCell).join(',')).join('\r\n');
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
      // Match a (manual) record to another edition, e.g. its Discogs release.
      .post(`/:id{${ID}}/link`, async (c) => {
        const target = parse(
          z
            .object({
              releaseId: z.uuid().optional(),
              discogsReleaseId: z.coerce.number().int().positive().optional(),
            })
            .refine((v) => (v.releaseId == null) !== (v.discogsReleaseId == null), {
              message: 'Indicá releaseId o discogsReleaseId',
            }),
          await jsonBody(c),
        );
        return c.json(
          await withAchievements(
            await core.collection.relink(c.get('userId'), c.req.param('id'), target),
          ),
        );
      })
      // Photos of my copy: 1) get a presigned upload, 2) PUT the file, 3) register its public URL.
      .post(`/:id{${ID}}/photos/upload`, async (c) => {
        const s = requireStorage(storage);
        await core.collection.getOwnedRow(c.get('userId'), c.req.param('id'));
        const { contentType } = parse(
          z.object({ contentType: z.enum(Object.keys(IMAGE_TYPES) as [ImageType]) }),
          await jsonBody(c),
        );
        const key = `copies/${c.get('userId')}/${c.req.param('id')}/${crypto.randomUUID()}.${IMAGE_TYPES[contentType]}`;
        return c.json(await s.createUpload(key, contentType));
      })
      .post(`/:id{${ID}}/photos`, async (c) => {
        const s = requireStorage(storage);
        const { url, caption } = parse(
          z.object({ url: z.url(), caption: z.string().trim().max(200).optional() }),
          await jsonBody(c),
        );
        await core.collection.getOwnedRow(c.get('userId'), c.req.param('id'));
        await verifyUploadedImage(s, url, `copies/${c.get('userId')}/${c.req.param('id')}/`);
        return c.json(
          await core.collection.addPhoto(c.get('userId'), c.req.param('id'), url, caption),
          201,
        );
      })
      .delete(`/:id{${ID}}/photos/:photoId{${ID}}`, async (c) => {
        await core.collection.removePhoto(
          c.get('userId'),
          c.req.param('id'),
          c.req.param('photoId'),
        );
        return c.body(null, 204);
      })
  );
}
