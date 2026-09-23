import { createHash } from 'node:crypto';
import type { CollectionItemFields } from '@kollektor/schemas';
import type { CoreDeps } from '../../context';
import { DomainError } from '../../lib/errors';
import type { AccountService } from '../accounts/service';
import type { CollectionService } from '../collection/service';
import type { JobService } from '../jobs/service';
import type { ProfileService } from '../profiles/service';
import { mapHeader, parseCsv, parseDate, parseGrade, parsePrice } from './csv';

const MAX_CSV_ROWS = 5000;
const MAX_MANUAL_ROWS_PER_REQUEST = 1000;

const RELEASE_JOB = 'import.discogs_release';
const PAGE_JOB = 'import.discogs_page';
const MAX_PAGES = 50; // 5,000 records

/**
 * Imports a user's Discogs collection. The first page is read in the request (validates the
 * username/privacy right away); following pages and every record are queued as jobs and
 * processed in rate-limit-friendly batches (client polling `runBatch`, or cron).
 * With a linked Discogs account, the user's own session is used, so private collections work.
 */
export function importService(
  deps: CoreDeps,
  collection: CollectionService,
  jobs: JobService,
  accounts?: AccountService,
  profiles?: ProfileService,
) {
  async function provider(userId: string, username: string) {
    const linked = await accounts?.discogsFor(userId);
    const p =
      linked && linked.username?.toLowerCase() === username.toLowerCase()
        ? linked.client
        : deps.catalogProvider;
    if (!p?.listUserCollection)
      throw new DomainError('NOT_CONFIGURED', 'La importación desde Discogs no está disponible');
    return p as typeof p & Required<Pick<typeof p, 'listUserCollection'>>;
  }

  /** Lists one page, queues its records and the next page. Returns what it found. */
  async function queuePage(userId: string, username: string, page: number) {
    const res = await (await provider(userId, username)).listUserCollection(username, page);
    let queued = 0;
    for (const entry of res.items) {
      const isNew = await jobs.enqueue(
        RELEASE_JOB,
        { userId, externalReleaseId: entry.externalReleaseId, instanceId: entry.instanceId },
        { dedupeKey: `import:${userId}:${entry.instanceId}` },
      );
      if (isNew) queued++;
    }
    if (page < res.pages && page < MAX_PAGES)
      await jobs.enqueue(
        PAGE_JOB,
        { userId, username, page: page + 1 },
        { dedupeKey: `import-page:${userId}:${username}:${page + 1}:${Date.now()}` },
      );
    return { total: res.total, queued };
  }

  async function startDiscogsImport(userId: string, requestedUsername?: string | null) {
    const username = requestedUsername || (await accounts?.discogsStatus(userId))?.username;
    if (!username)
      throw new DomainError('VALIDATION', 'Indicá tu usuario de Discogs o conectá tu cuenta');
    // Re-running an import retries records that failed before; imported copies never duplicate.
    const retried = await jobs.retryFailed(RELEASE_JOB, userId);
    const first = await queuePage(userId, username, 1);
    return {
      username,
      total: first.total,
      queued: first.queued + retried,
      status: await status(userId),
    };
  }

  const releaseHandler = async (p: Record<string, unknown>) => {
    await collection.add(String(p.userId), {
      ...((p.fields as CollectionItemFields | undefined) ?? {}),
      discogsReleaseId: Number(p.externalReleaseId),
      clientRequestId: `discogs-${String(p.instanceId)}`.slice(0, 64),
    });
  };

  /**
   * CSV import. Rows with a Discogs `release_id` (Discogs' own collection export) are queued like a
   * Discogs import — works for private collections without OAuth. Other rows (a personal
   * spreadsheet: artista, álbum, año, sello, precio…) become private manual entries right away.
   * Re-uploading the same file never duplicates records.
   */
  async function importCsv(userId: string, text: string) {
    const rows = parseCsv(text);
    if (rows.length < 2) throw new DomainError('VALIDATION', 'El CSV está vacío');
    if (rows.length - 1 > MAX_CSV_ROWS)
      throw new DomainError('VALIDATION', `Máximo ${MAX_CSV_ROWS} filas por archivo`);
    const col = mapHeader(rows[0]!);
    if (col.releaseId == null && (col.artist == null || col.title == null))
      throw new DomainError(
        'VALIDATION',
        'No reconocemos las columnas: se necesita "release_id" o "artista" y "álbum"',
      );
    const baseCurrency = profiles ? (await profiles.getProfile(userId)).baseCurrency : 'USD';
    const result = {
      total: rows.length - 1,
      queued: 0,
      created: 0,
      skipped: 0,
      errors: [] as { line: number; message: string }[],
    };
    let manualCount = 0;

    for (const [index, row] of rows.slice(1).entries()) {
      const line = index + 2;
      const get = (f: keyof typeof col) =>
        col[f] != null ? row[col[f]!]?.trim() || undefined : undefined;
      const rowKey = createHash('sha1')
        .update(`${userId}|${row.join('\u0001')}`)
        .digest('hex')
        .slice(0, 24);
      const price = parsePrice(get('price'));
      const fields: CollectionItemFields = {
        conditionMedia: parseGrade(get('mediaCondition')),
        conditionSleeve: parseGrade(get('sleeveCondition')),
        purchaseDate: parseDate(get('purchaseDate')),
        purchasePrice: price.amount,
        purchaseCurrency:
          price.amount != null
            ? (get('currency')?.toUpperCase() ?? price.currency ?? baseCurrency)
            : null,
        purchasePlace: get('place') ?? null,
        storageLocation: get('location') ?? null,
        notes: get('notes') ?? null,
      };
      const releaseId = get('releaseId');
      if (releaseId && /^\d+$/.test(releaseId)) {
        const isNew = await jobs.enqueue(
          RELEASE_JOB,
          { userId, externalReleaseId: releaseId, instanceId: `csv-${rowKey}`, fields },
          { dedupeKey: `import:${userId}:csv-${rowKey}` },
        );
        if (isNew) result.queued++;
        else result.skipped++;
        continue;
      }
      const artist = get('artist');
      const title = get('title');
      if (!artist || !title) {
        result.errors.push({ line, message: 'Falta artista o álbum' });
        continue;
      }
      if (++manualCount > MAX_MANUAL_ROWS_PER_REQUEST) {
        result.errors.push({
          line,
          message: `Se importan hasta ${MAX_MANUAL_ROWS_PER_REQUEST} filas manuales por vez; subí el resto en otro archivo`,
        });
        continue;
      }
      const year = Number(get('year')?.slice(0, 4));
      const editionYear = Number(get('editionYear')?.slice(0, 4));
      const label = get('label');
      try {
        const r = await collection.add(userId, {
          ...fields,
          clientRequestId: `csv-${rowKey}`,
          manual: {
            album: {
              // Kept as one credit: "Simon & Garfunkel" or "Crosby, Stills & Nash" are single acts.
              artists: [artist],
              title,
              originalReleaseYear: Number.isInteger(year) && year > 1877 ? year : null,
              genres: get('genre') ? get('genre')!.split(/\s*[,/]\s*/) : [],
              styles: [],
            },
            release: {
              year: Number.isInteger(editionYear) && editionYear > 1877 ? editionYear : null,
              country: get('country') ?? null,
              labels: label ? [{ name: label, catalogNumber: get('catalogNumber') ?? null }] : [],
              formats: [],
            },
            tracks: [],
          },
        });
        if (r.replayed) result.skipped++;
        else result.created++;
      } catch (e) {
        result.errors.push({
          line,
          message: e instanceof DomainError ? e.message : 'No se pudo importar la fila',
        });
      }
    }
    return { ...result, status: await status(userId) };
  }

  const pageHandler = async (p: Record<string, unknown>) => {
    await queuePage(String(p.userId), String(p.username), Number(p.page));
  };

  async function status(userId: string) {
    const [records, pages] = await Promise.all([
      jobs.countsFor(RELEASE_JOB, userId),
      jobs.countsFor(PAGE_JOB, userId),
    ]);
    return { ...records, listing: pages.pending > 0 };
  }

  async function runBatch(userId: string, limit = 10) {
    const handlers = { [PAGE_JOB]: pageHandler, [RELEASE_JOB]: releaseHandler };
    await jobs.runDue(handlers, 1, { type: PAGE_JOB, userId });
    const result = await jobs.runDue(handlers, limit, { type: RELEASE_JOB, userId });
    return { ...result, status: await status(userId) };
  }

  return {
    importCsv,
    startDiscogsImport,
    runBatch,
    status,
    handlers: { [RELEASE_JOB]: releaseHandler, [PAGE_JOB]: pageHandler },
  };
}

export type ImportService = ReturnType<typeof importService>;
