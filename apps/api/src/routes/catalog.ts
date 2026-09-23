import { Hono } from 'hono';
import { z } from 'zod';
import { catalogSearchQuery } from '@kollektor/schemas';
import { DomainError, type RecognitionImage } from '@kollektor/core';
import { jsonBody, parse, queryObject } from '../lib/http';
import type { AppDeps, AppEnv } from '../types';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

const photoJson = z.object({
  images: z
    .array(z.object({ data: z.string().min(1).max(8_000_000), mediaType: z.enum(MEDIA_TYPES) }))
    .min(1)
    .max(3),
});

/** Local catalog (releases already in the DB) + external catalog (Discogs) + recognition. */
export function catalogRoutes({ core }: AppDeps) {
  const provider = () => {
    const p = core.deps.catalogProvider;
    if (!p) throw new DomainError('NOT_CONFIGURED', 'El catálogo externo no está configurado');
    return p;
  };
  const attribution = { attribution: 'Datos provistos por Discogs' };

  /** Adds "¿ya lo tengo?" flags to every external candidate. */
  async function withOwnership<T extends { externalId: string; masterId: string | null }>(
    userId: string,
    items: T[],
  ) {
    const source = core.deps.catalogProvider?.source ?? 'discogs';
    const owned = await core.collection.ownershipOf(userId, source, items);
    const none = { ownedCopies: 0, ownedEditionsOfAlbum: 0, inWishlist: false };
    return items.map((i) => ({ ...i, ...(owned.get(i.externalId) ?? none) }));
  }

  return (
    new Hono<AppEnv>()
      .get('/releases/:id{[0-9a-f-]{36}}', async (c) =>
        c.json(await core.catalog.getReleaseDetail(c.get('userId'), c.req.param('id'))),
      )
      .get('/albums/:id{[0-9a-f-]{36}}/releases', async (c) =>
        c.json(await core.catalog.listAlbumReleases(c.get('userId'), c.req.param('id'))),
      )
      .get('/albums/:id{[0-9a-f-]{36}}/external-versions', async (c) => {
        const page = Number(c.req.query('page') ?? 1) || 1;
        const res = await core.catalog.externalVersions(c.get('userId'), c.req.param('id'), page);
        return c.json({
          ...res,
          items: await withOwnership(c.get('userId'), res.items),
          ...attribution,
        });
      })
      .get('/tracks/:id{[0-9a-f-]{36}}/links', async (c) =>
        c.json(await core.music.getLinks(c.get('userId'), c.req.param('id'))),
      )

      // External catalog (used by the "+ Agregar vinilo" flow)
      .get('/external/search', async (c) => {
        const q = parse(catalogSearchQuery, queryObject(c));
        if (!q.q && !q.artist && !q.title && !q.catalogNumber && !q.barcode)
          throw new DomainError('VALIDATION', 'Indicá qué buscar');
        const res = await provider().search(q);
        return c.json({
          ...res,
          items: await withOwnership(c.get('userId'), res.items),
          ...attribution,
        });
      })
      .get('/external/releases/:id{[0-9]+}', async (c) =>
        c.json({ ...(await provider().getRelease(c.req.param('id'))), ...attribution }),
      )
      .get('/external/masters/:id{[0-9]+}/versions', async (c) => {
        const page = Number(c.req.query('page') ?? 1) || 1;
        const res = await provider().getMasterVersions(c.req.param('id'), page);
        return c.json({
          ...res,
          items: await withOwnership(c.get('userId'), res.items),
          ...attribution,
        });
      })

      // Identification
      .post('/identify/barcode', async (c) => {
        const { barcode } = parse(
          z.object({ barcode: z.string().regex(/^[\d\s-]{8,20}$/) }),
          await jsonBody(c),
        );
        const res = await core.recognition.identifyByBarcode(barcode.replace(/\D/g, ''));
        return c.json({
          ...res,
          candidates: await withOwnership(c.get('userId'), res.candidates),
          ...attribution,
        });
      })
      .post('/identify/photo', async (c) => {
        const images = await readImages(c.req.raw);
        const res = await core.recognition.identifyByPhoto(c.get('userId'), images);
        return c.json({
          ...res,
          candidates: await withOwnership(c.get('userId'), res.candidates),
          ...attribution,
        });
      })
  );
}

/** Accepts multipart/form-data (`images` files) or JSON `{ images: [{ data, mediaType }] }`. */
async function readImages(req: Request): Promise<RecognitionImage[]> {
  const type = req.headers.get('content-type') ?? '';
  if (type.includes('multipart/form-data')) {
    const form = await req.formData();
    const files = form.getAll('images').filter((f) => typeof f !== 'string') as Blob[];
    if (files.length < 1 || files.length > 3)
      throw new DomainError('VALIDATION', 'Subí entre 1 y 3 fotos');
    return Promise.all(
      files.map(async (f) => {
        if (!(MEDIA_TYPES as readonly string[]).includes(f.type))
          throw new DomainError('VALIDATION', 'Formato de imagen no soportado');
        if (f.size > MAX_IMAGE_BYTES)
          throw new DomainError('VALIDATION', 'Cada foto debe pesar menos de 5 MB');
        return {
          data: Buffer.from(await f.arrayBuffer()).toString('base64'),
          mediaType: f.type as RecognitionImage['mediaType'],
        };
      }),
    );
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new DomainError('VALIDATION', 'Enviá las fotos como multipart/form-data o JSON');
  }
  return parse(photoJson, body).images.map((i) => ({
    ...i,
    data: i.data.replace(/^data:[^,]+,/, ''),
  }));
}
