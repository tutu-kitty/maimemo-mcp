/**
 * Maimemo enforces several overlapping request quotas. Blowing through them
 * returns 429s that look like random failures to an LLM, so we shape traffic
 * client-side with a multi-window sliding log.
 */

export type RateLimitWindow = {
  /** Window size in milliseconds. */
  windowMs: number;
  /** Maximum number of requests permitted inside the window. */
  limit: number;
};

export const DEFAULT_RATE_LIMITS: RateLimitWindow[] = [
  { windowMs: 10_000, limit: 20 },
  { windowMs: 60_000, limit: 40 },
  { windowMs: 5 * 60 * 60 * 1000, limit: 2000 },
];

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class SlidingWindowRateLimiter {
  private readonly windows: RateLimitWindow[];
  private readonly maxWindowMs: number;
  private hits: number[] = [];
  /** Serialises reservations so concurrent callers cannot overcommit. */
  private tail: Promise<unknown> = Promise.resolve();

  constructor(windows: RateLimitWindow[] = DEFAULT_RATE_LIMITS) {
    this.windows = windows.filter((w) => w.limit > 0 && w.windowMs > 0);
    this.maxWindowMs = this.windows.reduce((m, w) => Math.max(m, w.windowMs), 0);
  }

  /** Resolves once it is safe to issue one more request. */
  async acquire(signal?: AbortSignal): Promise<void> {
    if (this.windows.length === 0) return;
    const run = this.tail.then(
      () => this.reserve(signal),
      () => this.reserve(signal),
    );
    this.tail = run.catch(() => undefined);
    return run;
  }

  private async reserve(signal?: AbortSignal): Promise<void> {
    for (;;) {
      if (signal?.aborted) throw new Error("Rate limit wait aborted");

      const now = Date.now();
      this.hits = this.hits.filter((t) => now - t < this.maxWindowMs);

      let waitMs = 0;
      for (const window of this.windows) {
        const inWindow = this.hits.filter((t) => now - t < window.windowMs);
        if (inWindow.length >= window.limit) {
          const expiring = inWindow[inWindow.length - window.limit];
          waitMs = Math.max(waitMs, expiring + window.windowMs - now + 10);
        }
      }

      if (waitMs <= 0) {
        this.hits.push(now);
        return;
      }
      await sleep(Math.min(waitMs, 5_000));
    }
  }

  /** Diagnostics for the /healthz endpoint. */
  snapshot(): Array<RateLimitWindow & { used: number }> {
    const now = Date.now();
    return this.windows.map((w) => ({
      ...w,
      used: this.hits.filter((t) => now - t < w.windowMs).length,
    }));
  }
}
