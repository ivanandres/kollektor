import { and, eq, sql } from 'drizzle-orm';
import { schema } from '@kollektor/db';
import type { CoreDeps } from '../../context';
import { nowOf } from '../../context';

const { syncJobs } = schema;
const MAX_ATTEMPTS = 5;

export type JobHandler = (payload: Record<string, unknown>) => Promise<void>;

/** Minimal Postgres-backed queue. Triggered by cron (Vercel Cron today, system cron on a VPS). */
export function jobService(deps: CoreDeps) {
  const { db } = deps;

  async function enqueue(type: string, payload: Record<string, unknown>, opts: { dedupeKey?: string; runAfter?: Date } = {}) {
    await db
      .insert(syncJobs)
      .values({ type, payload, dedupeKey: opts.dedupeKey ?? null, runAfter: opts.runAfter ?? nowOf(deps) })
      .onConflictDoNothing();
  }

  /** Runs up to `limit` due jobs. Safe to call concurrently (SKIP LOCKED). */
  async function runDue(handlers: Record<string, JobHandler>, limit = 20) {
    const picked = await db.execute<{ id: string; type: string; payload: Record<string, unknown>; attempts: number }>(sql`
      UPDATE ${syncJobs} SET status = 'running', attempts = attempts + 1, updated_at = now()
       WHERE id IN (
         SELECT id FROM ${syncJobs}
          WHERE status = 'pending' AND run_after <= ${nowOf(deps)}
          ORDER BY run_after LIMIT ${limit} FOR UPDATE SKIP LOCKED)
      RETURNING id, type, payload, attempts`);
    const result = { done: 0, failed: 0, retried: 0 };
    for (const job of picked) {
      const handler = handlers[job.type];
      try {
        if (!handler) throw new Error(`No handler for job type ${job.type}`);
        await handler(job.payload);
        // Done jobs release their dedupe key so the same work can be scheduled again later.
        await db.update(syncJobs).set({ status: 'done', dedupeKey: null, updatedAt: nowOf(deps) }).where(eq(syncJobs.id, job.id));
        result.done++;
      } catch (e) {
        const final = job.attempts >= MAX_ATTEMPTS;
        const backoffMs = 60_000 * 2 ** job.attempts;
        await db
          .update(syncJobs)
          .set({
            status: final ? 'failed' : 'pending',
            lastError: e instanceof Error ? e.message : String(e),
            runAfter: new Date(nowOf(deps).getTime() + backoffMs),
            dedupeKey: final ? null : undefined,
            updatedAt: nowOf(deps),
          })
          .where(and(eq(syncJobs.id, job.id)));
        if (final) result.failed++;
        else result.retried++;
      }
    }
    return result;
  }

  return { enqueue, runDue };
}

export type JobService = ReturnType<typeof jobService>;
