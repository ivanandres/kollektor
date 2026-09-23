export type FetchLike = typeof fetch;

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** GET JSON with retries on 429/5xx (exponential backoff, honoring Retry-After). */
export async function fetchJson<T>(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit = {},
  opts: { retries?: number; baseDelayMs?: number; onResponse?: (res: Response) => void } = {},
): Promise<T> {
  const retries = opts.retries ?? 3;
  const base = opts.baseDelayMs ?? 1000;
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetchImpl(url, init);
    } catch (e) {
      if (attempt >= retries) throw e;
      await sleep(base * 2 ** attempt);
      continue;
    }
    opts.onResponse?.(res);
    if (res.ok) return (await res.json()) as T;
    const retryAfter = Number(res.headers.get('retry-after'));
    const retryAfterMs =
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined;
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= retries) {
      const body = await res.text().catch(() => '');
      throw new HttpError(
        res.status,
        `HTTP ${res.status} for ${url.split('?')[0]}: ${body.slice(0, 200)}`,
        retryAfterMs,
      );
    }
    await sleep(retryAfterMs ?? base * 2 ** attempt);
  }
}
