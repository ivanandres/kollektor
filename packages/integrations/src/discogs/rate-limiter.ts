import { sleep } from '../http/fetch-json';

/**
 * Spaces requests to stay under Discogs' per-minute limit and backs off when the
 * X-Discogs-Ratelimit-Remaining header gets low. Per process: in serverless each instance
 * has its own limiter, so keep the default conservative.
 */
export class RateLimiter {
  private nextSlot = 0;
  private pauseUntil = 0;

  constructor(
    private readonly perMinute = 55,
    private readonly now: () => number = Date.now,
    private readonly wait: (ms: number) => Promise<void> = sleep,
  ) {}

  async acquire(): Promise<void> {
    const interval = 60_000 / this.perMinute;
    const t = this.now();
    const slot = Math.max(t, this.nextSlot, this.pauseUntil);
    this.nextSlot = slot + interval;
    if (slot > t) await this.wait(slot - t);
  }

  observe(remaining: number | null): void {
    if (remaining != null && remaining <= 2) this.pauseUntil = this.now() + 60_000;
  }
}
