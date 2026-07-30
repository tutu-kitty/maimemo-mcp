import { MaimemoError, errorFromStatus } from "./errors.js";
import {
  DEFAULT_RATE_LIMITS,
  SlidingWindowRateLimiter,
  type RateLimitWindow,
} from "./rate-limiter.js";

export type HttpMethod = "GET" | "POST" | "DELETE";

export type RequestOptions = {
  method?: HttpMethod;
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  signal?: AbortSignal;
};

export type MaimemoClientOptions = {
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  rateLimits?: RateLimitWindow[];
  /** Shared across clients so per-user tokens still respect one global quota. */
  rateLimiter?: SlidingWindowRateLimiter;
};

type Envelope<T> = {
  data?: T;
  errors?: unknown[];
  success?: boolean;
  pagination?: unknown;
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export class MaimemoClient {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly limiter: SlidingWindowRateLimiter;
  /** spelling -> voc_id. Vocabulary IDs are stable, so caching is safe. */
  private readonly vocIdCache = new Map<string, string>();

  constructor(token: string, options: MaimemoClientOptions = {}) {
    if (!token) throw new MaimemoError("A Maimemo API token is required.", { code: "auth" });
    this.token = token;
    this.baseUrl = options.baseUrl ?? "https://open.maimemo.com/open/";
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.maxRetries = options.maxRetries ?? 3;
    this.limiter =
      options.rateLimiter ??
      new SlidingWindowRateLimiter(options.rateLimits ?? DEFAULT_RATE_LIMITS);
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const url = new URL(path.replace(/^\//, ""), this.baseUrl);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }

    let lastError: MaimemoError | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      await this.limiter.acquire(options.signal);

      try {
        return await this.execute<T>(url, options);
      } catch (error) {
        const err =
          error instanceof MaimemoError
            ? error
            : new MaimemoError(`Network failure: ${(error as Error).message}`, {
                code: "network",
                retryable: true,
                cause: error,
              });

        lastError = err;
        const canRetry =
          err.retryable &&
          attempt < this.maxRetries &&
          (err.status === undefined || RETRYABLE_STATUS.has(err.status));

        if (!canRetry) throw err;

        // Exponential backoff with jitter, capped so tools stay responsive.
        const backoff = Math.min(500 * 2 ** attempt, 8_000);
        await sleep(backoff + Math.random() * 250);
      }
    }

    throw lastError ?? new MaimemoError("Request failed.", { code: "api_error" });
  }

  private async execute<T>(url: URL, options: RequestOptions): Promise<T> {
    const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
    const signal = options.signal
      ? AbortSignal.any([options.signal, timeoutSignal])
      : timeoutSignal;

    let res: Response;
    try {
      res = await fetch(url.toString(), {
        method: options.method ?? "GET",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal,
      });
    } catch (error) {
      if (timeoutSignal.aborted) {
        throw new MaimemoError(
          `Request to ${url.pathname} timed out after ${this.timeoutMs}ms.`,
          { code: "timeout", retryable: true, cause: error },
        );
      }
      throw error;
    }

    const text = await res.text();

    if (!res.ok) {
      throw errorFromStatus(res.status, text || res.statusText, tryParse(text));
    }
    if (!text.trim()) return {} as T;

    const json = tryParse(text) as Envelope<T> | undefined;
    if (json === undefined) {
      throw new MaimemoError(`Maimemo returned a non-JSON response: ${text.slice(0, 300)}`, {
        code: "api_error",
      });
    }

    if (Array.isArray(json.errors) && json.errors.length > 0) {
      throw new MaimemoError("Maimemo returned an application-level error.", {
        code: "api_error",
        details: json.errors,
      });
    }
    if (json.success === false) {
      throw new MaimemoError("Maimemo reported the request as unsuccessful.", {
        code: "api_error",
        details: json,
      });
    }

    return (json.data as T) ?? (json as unknown as T);
  }

  /** Resolves a single spelling (or passthrough voc_id) to a vocabulary ID. */
  async resolveVocId(word?: string, vocId?: string): Promise<string> {
    if (vocId) return vocId;
    if (!word) {
      throw new MaimemoError("Provide either `word` or `voc_id`.", { code: "invalid_input" });
    }

    const cached = this.vocIdCache.get(word);
    if (cached) return cached;

    const res = await this.request<{ voc?: { id: string } }>("/api/v1/vocabulary", {
      query: { spelling: word },
    });
    const id = res.voc?.id;
    if (!id) {
      throw new MaimemoError(`Word "${word}" was not found in the Maimemo dictionary.`, {
        code: "not_found",
      });
    }

    this.cacheVocId(word, id);
    return id;
  }

  /**
   * Batch-resolves spellings to IDs in a single call, skipping anything already
   * cached. Returns IDs in the caller's original order.
   */
  async resolveVocIds(spellings: string[] = [], ids: string[] = []): Promise<string[]> {
    const resolved = [...ids];
    if (spellings.length === 0) return resolved;

    const uncached = [...new Set(spellings.filter((s) => !this.vocIdCache.has(s)))];

    // The batch endpoint accepts at most 1000 spellings per call.
    for (let i = 0; i < uncached.length; i += 1000) {
      const chunk = uncached.slice(i, i + 1000);
      const res = await this.request<{ voc?: Array<{ spelling: string; id: string }> }>(
        "/api/v1/vocabulary/query",
        { method: "POST", body: { spellings: chunk, ids: [] } },
      );
      for (const voc of res.voc ?? []) this.cacheVocId(voc.spelling, voc.id);
    }

    const missing = spellings.filter((s) => !this.vocIdCache.has(s));
    if (missing.length > 0) {
      throw new MaimemoError(
        `These words were not found in the Maimemo dictionary: ${missing.join(", ")}`,
        { code: "not_found" },
      );
    }

    resolved.push(...spellings.map((s) => this.vocIdCache.get(s)!));
    return resolved;
  }

  private cacheVocId(spelling: string, id: string): void {
    // Simple FIFO bound so long-lived servers cannot leak memory.
    if (this.vocIdCache.size >= 5000) {
      const oldest = this.vocIdCache.keys().next().value;
      if (oldest !== undefined) this.vocIdCache.delete(oldest);
    }
    this.vocIdCache.set(spelling, id);
  }
}

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
