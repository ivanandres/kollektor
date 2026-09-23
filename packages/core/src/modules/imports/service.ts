import type { CoreDeps } from '../../context';
import { DomainError } from '../../lib/errors';
import type { CollectionService } from '../collection/service';
import type { JobService } from '../jobs/service';

const JOB = 'import.discogs_release';
const MAX_PAGES = 50; // 5,000 records

/**
 * Imports a user's public Discogs collection. Listing is cheap (100 per request); each record
 * then needs its own release/master lookups, so records are queued as jobs and processed in
 * rate-limit-friendly batches (by the client polling `runBatch`, or by cron).
 */
export function importService(deps: CoreDeps, collection: CollectionService, jobs: JobService) {
  function provider() {
    const p = deps.catalogProvider;
    if (!p?.listUserCollection)
      throw new DomainError('NOT_CONFIGURED', 'La importación desde Discogs no está disponible');
    return p as Required<Pick<typeof p, 'listUserCollection'>> & typeof p;
  }

  async function startDiscogsImport(userId: string, username: string) {
    const p = provider();
    let page = 1;
    let queued = 0;
    let total: number;
    for (;;) {
      const res = await p.listUserCollection(username, page);
      total = res.total;
      for (const entry of res.items) {
        await jobs.enqueue(
          JOB,
          { userId, externalReleaseId: entry.externalReleaseId, instanceId: entry.instanceId },
          { dedupeKey: `import:${userId}:${entry.instanceId}` },
        );
        queued++;
      }
      if (page >= res.pages || page >= MAX_PAGES) break;
      page++;
    }
    return { username, total, queued, status: await status(userId) };
  }

  const handler = async (p: Record<string, unknown>) => {
    await collection.add(String(p.userId), {
      discogsReleaseId: Number(p.externalReleaseId),
      // Re-running an import never duplicates a copy.
      clientRequestId: `discogs-${String(p.instanceId)}`.slice(0, 64),
    });
  };

  const status = (userId: string) => jobs.countsFor(JOB, userId);

  async function runBatch(userId: string, limit = 10) {
    const result = await jobs.runDue({ [JOB]: handler }, limit, { type: JOB, userId });
    return { ...result, status: await status(userId) };
  }

  return { startDiscogsImport, runBatch, status, handler, JOB };
}

export type ImportService = ReturnType<typeof importService>;
