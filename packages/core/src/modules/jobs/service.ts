import { and, eq, sql } from 'drizzle-orm';
import { schema } from '@kollektor/db';
import type { CoreDeps } from '../../context';
import { nowOf } from '../../context';

const { syncJobs } = schema;
const MAX_ATTEMPTS = 5;

export type JobHandler = (payload: Record<string, unknown>) => Promise<void>;

/**
 * Minimal Postgres-backed queue. Dedupe keys are permanent: include a date in the key for
 * periodic work (e.g. `snapshot:<user>:<day>`). Triggered by cron (Vercel Cron today, system cron on a VPS). */
export function jobService(deps: CoreDeps) {
  const { db } = deps;

  async function enqueue(
    type: string,
    payload: Record<string, unknown>,
    opts: { dedupeKey?: string; runAfter?: Date } = {},
  ) {
    await db
      .insert(syncJobs)
      .values({
        type,
        payload,
        dedupeKey: opts.dedupeKey ?? null,
        runAfter: opts.runAfter ?? nowOf(deps),
      })
      .onConflictDoNothing();
  }

  /** Runs up to `limit` due jobs. Safe to call concurrently (SKIP LOCKED). */
  async function runDue(
    handlers: Record<string, JobHandler>,
    limit = 20,
    filter: { type?: string; userId?: string } = {},
  ) {
    const typeCond = filter.type ? sql`AND type = ${filter.type}` : sql``;
    const userCond = filter.userId ? sql`AND payload->>'userId' = ${filter.userId}` : sql``;
    const picked = await db.execute<{
      id: string;
      type: string;
      payload: Record<string, unknown>;
      attempts: number;
    }>(sql`
      UPDATE ${syncJobs} SET status = 'running', attempts = attempts + 1, updated_at = now()
       WHERE id IN (
         SELECT id FROM ${syncJobs}
          WHERE status = 'pending' AND run_after <= ${nowOf(deps).toISOString()}::timestamptz ${typeCond} ${userCond}
          ORDER BY run_after LIMIT ${limit} FOR UPDATE SKIP LOCKED)
      RETURNING id, type, payload, attempts`);
    const result = { done: 0, failed: 0, retried: 0 };
    for (const job of picked) {
      const handler = handlers[job.type];
      try {
        if (!handler) throw new Error(`No handler for job type ${job.type}`);
        await handler(job.payload);
        await db
          .update(syncJobs)
          .set({ status: 'done', updatedAt: nowOf(deps) })
          .where(eq(syncJobs.id, job.id));
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
            updatedAt: nowOf(deps),
          })
          .where(and(eq(syncJobs.id, job.id)));
        if (final) result.failed++;
        else result.retried++;
      }
    }
    return result;
  }

  async function countsFor(type: string, userId: string) {
    const rows = await db.execute<{ status: string; n: number }>(sql`
      SELECT status, count(*)::int AS n FROM ${syncJobs}
       WHERE type = ${type} AND payload->>'userId' = ${userId} GROUP BY status`);
    const by = Object.fromEntries(rows.map((r) => [r.status, r.n]));
    return {
      pending: (by.pending ?? 0) + (by.running ?? 0),
      done: by.done ?? 0,
      failed: by.failed ?? 0,
    };
  }

  return { enqueue, runDue, countsFor };
}

export type JobService = ReturnType<typeof jobService>;
