import type { CoreDeps } from '../../context';
import { DomainError } from '../../lib/errors';
import type { CollectionService } from '../collection/service';
import type { JobService } from '../jobs/service';

const RELEASE_JOB = 'import.discogs_release';
const PAGE_JOB = 'import.discogs_page';
const MAX_PAGES = 50; // 5,000 records

/**
 * Imports a user's public Discogs collection. The first page is read in the request (validates
 * the username/privacy right away); following pages and every record are queued as jobs and
 * processed in rate-limit-friendly batches (client polling `runBatch`, or cron).
 */
export function importService(deps: CoreDeps, collection: CollectionService, jobs: JobService) {
  function provider() {
    const p = deps.catalogProvider;
    if (!p?.listUserCollection)
      throw new DomainError('NOT_CONFIGURED', 'La importación desde Discogs no está disponible');
    return p as typeof p & Required<Pick<typeof p, 'listUserCollection'>>;
  }

  /** Lists one page, queues its records and the next page. Returns what it found. */
  async function queuePage(userId: string, username: string, page: number) {
    const res = await provider().listUserCollection(username, page);
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

  async function startDiscogsImport(userId: string, username: string) {
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
      discogsReleaseId: Number(p.externalReleaseId),
      clientRequestId: `discogs-${String(p.instanceId)}`.slice(0, 64),
    });
  };

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
    startDiscogsImport,
    runBatch,
    status,
    handlers: { [RELEASE_JOB]: releaseHandler, [PAGE_JOB]: pageHandler },
  };
}

export type ImportService = ReturnType<typeof importService>;
