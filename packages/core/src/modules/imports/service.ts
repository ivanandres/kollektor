import { createHash } from 'node:crypto';
import {
  addToCollectionInput,
  type AddToCollectionInput,
  type CollectionItemFields,
} from '@kollektor/schemas';
import type { CoreDeps } from '../../context';
import { DomainError } from '../../lib/errors';
import type { AccountService } from '../accounts/service';
import type { CollectionService } from '../collection/service';
import type { JobService } from '../jobs/service';
import type { ProfileService } from '../profiles/service';
import { mapHeader, parseCsv, parseCurrencyCode, parseDate, parseGrade, parsePrice } from './csv';

const MAX_CSV_ROWS = 5000;

const RELEASE_JOB = 'import.discogs_release';
const MANUAL_JOB = 'import.manual_row';
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

  const manualHandler = async (p: Record<string, unknown>) => {
    await collection.add(String(p.userId), p.input as AddToCollectionInput);
  };

  /**
   * CSV import. Every row is validated now and queued as a job (processed by `runBatch`, like a
   * Discogs import), so big files never block a request:
   * - rows with a Discogs `release_id` (Discogs' collection export) import that edition — works
   *   for private collections without OAuth;
   * - other rows (a personal spreadsheet: artista, álbum, año, sello, precio…) become private
   *   manual records.
   * Re-uploading the same file never duplicates. Identical rows count as separate copies.
   * Note: a Discogs CSV imported after a username import of the same collection creates
   * duplicates (Discogs' export has no copy ids to match on).
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
      skipped: 0,
      errors: [] as { line: number; message: string }[],
      warnings: [] as { line: number; message: string }[],
    };
    const seen = new Map<string, number>();

    for (const [index, row] of rows.slice(1).entries()) {
      const line = index + 2;
      const get = (f: keyof typeof col) =>
        col[f] != null ? row[col[f]!]?.trim() || undefined : undefined;
      // Same content twice = two copies: the occurrence number keeps both.
      const content = createHash('sha1')
        .update(`${userId}|${row.join('\u0001')}`)
        .digest('hex')
        .slice(0, 20);
      const occurrence = (seen.get(content) ?? 0) + 1;
      seen.set(content, occurrence);
      const rowKey = `${content}-${occurrence}`;

      const price = parsePrice(get('price'));
      const rawDate = get('purchaseDate');
      const purchaseDate = parseDate(rawDate);
      if (rawDate && !purchaseDate)
        result.warnings.push({ line, message: `Fecha no reconocida ("${rawDate}"), se omitió` });
      const rawCurrency = get('currency');
      const currencyCode = parseCurrencyCode(rawCurrency);
      if (rawCurrency && !currencyCode)
        result.warnings.push({
          line,
          message: `Moneda no reconocida ("${rawCurrency}"), se usó ${price.currency ?? baseCurrency}`,
        });
      const fields: CollectionItemFields = {
        conditionMedia: parseGrade(get('mediaCondition')),
        conditionSleeve: parseGrade(get('sleeveCondition')),
        purchaseDate,
        purchasePrice: price.amount,
        purchaseCurrency:
          price.amount != null ? (currencyCode ?? price.currency ?? baseCurrency) : null,
        purchasePlace: get('place')?.slice(0, 200) ?? null,
        storageLocation: get('location')?.slice(0, 200) ?? null,
        notes: get('notes')?.slice(0, 5000) ?? null,
      };

      const releaseId = get('releaseId');
      let job: { type: string; payload: Record<string, unknown> };
      if (releaseId && /^\d+$/.test(releaseId)) {
        job = {
          type: RELEASE_JOB,
          payload: { userId, externalReleaseId: releaseId, instanceId: `csv-${rowKey}`, fields },
        };
      } else {
        const artist = get('artist');
        const title = get('title');
        if (!artist || !title) {
          result.errors.push({ line, message: 'Falta artista o álbum' });
          continue;
        }
        const year = Number(get('year')?.slice(0, 4));
        const editionYear = Number(get('editionYear')?.slice(0, 4));
        const label = get('label');
        const candidate = {
          ...fields,
          clientRequestId: `csv-${rowKey}`,
          manual: {
            album: {
              // Kept as one credit: "Simon & Garfunkel" or "Crosby, Stills & Nash" are single acts.
              artists: [artist.slice(0, 200)],
              title: title.slice(0, 300),
              originalReleaseYear:
                Number.isInteger(year) && year > 1877 && year <= 2100 ? year : null,
              genres: get('genre')
                ? get('genre')!
                    .split(/\s*[,/]\s*/)
                    .slice(0, 10)
                : [],
              styles: [],
            },
            release: {
              year:
                Number.isInteger(editionYear) && editionYear > 1877 && editionYear <= 2100
                  ? editionYear
                  : null,
              country: get('country')?.slice(0, 60) ?? null,
              labels: label
                ? [
                    {
                      name: label.slice(0, 200),
                      catalogNumber: get('catalogNumber')?.slice(0, 100) ?? null,
                    },
                  ]
                : [],
              formats: [],
            },
            tracks: [],
          },
        };
        // Validate now so a bad row is reported, instead of failing later in a job.
        const parsed = addToCollectionInput.safeParse(candidate);
        if (!parsed.success) {
          result.errors.push({ line, message: parsed.error.issues[0]?.message ?? 'Fila inválida' });
          continue;
        }
        job = { type: MANUAL_JOB, payload: { userId, input: parsed.data } };
      }
      const isNew = await jobs.enqueue(job.type, job.payload, {
        dedupeKey: `import:${userId}:csv-${rowKey}`,
      });
      if (isNew) result.queued++;
      else result.skipped++;
    }
    return { ...result, status: await status(userId) };
  }

  const pageHandler = async (p: Record<string, unknown>) => {
    await queuePage(String(p.userId), String(p.username), Number(p.page));
  };

  async function status(userId: string) {
    const [discogs, manual, pages] = await Promise.all([
      jobs.countsFor(RELEASE_JOB, userId),
      jobs.countsFor(MANUAL_JOB, userId),
      jobs.countsFor(PAGE_JOB, userId),
    ]);
    return {
      pending: discogs.pending + manual.pending,
      done: discogs.done + manual.done,
      failed: discogs.failed + manual.failed,
      listing: pages.pending > 0,
    };
  }

  async function runBatch(userId: string, limit = 10) {
    const handlers = {
      [PAGE_JOB]: pageHandler,
      [RELEASE_JOB]: releaseHandler,
      [MANUAL_JOB]: manualHandler,
    };
    await jobs.runDue(handlers, 1, { type: PAGE_JOB, userId });
    // Manual rows don't call Discogs, so a batch can take many more of them.
    const manual = await jobs.runDue(handlers, limit * 5, {
      type: MANUAL_JOB,
      userId,
      budgetMs: 20_000,
    });
    const discogs = await jobs.runDue(handlers, limit, {
      type: RELEASE_JOB,
      userId,
      budgetMs: 40_000,
    });
    return {
      done: manual.done + discogs.done,
      failed: manual.failed + discogs.failed,
      retried: manual.retried + discogs.retried,
      status: await status(userId),
    };
  }

  return {
    importCsv,
    startDiscogsImport,
    runBatch,
    status,
    handlers: {
      [RELEASE_JOB]: releaseHandler,
      [PAGE_JOB]: pageHandler,
      [MANUAL_JOB]: manualHandler,
    },
  };
}

export type ImportService = ReturnType<typeof importService>;
