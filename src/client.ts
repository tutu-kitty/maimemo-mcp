import { createHash } from "node:crypto";
import { MaimemoError, errorFromStatus, parseMaimemoErrors } from "./errors.js";
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
  /** The window this client is subject to. One per token, not one per process. */
  rateLimiter?: SlidingWindowRateLimiter;
  /**
   * Where the token came from.
   *
   * "per-request" means the client sent it in the Authorization header (the
   * shared-deployment mode, where the server holds no credential at all).
   * "server" means the server-side MAIMEMO_API_TOKEN was used.
   *
   * The token-status tool uses this to say the *right* remedy: rotating a token
   * in the server environment is pointless when the server never held one.
   */
  tokenSource?: "per-request" | "server";
};

type Envelope<T> = {
  data?: T;
  errors?: unknown[];
  success?: boolean;
  pagination?: unknown;
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/**
 * Statuses worth retrying.
 *
 * 429 is deliberately absent: Maimemo's quota is per token and per window,
 * so an immediate retry lands in the same exhausted window and only burns
 * more quota and more of the caller's timeout budget.
 */
const RETRYABLE_STATUS = new Set([408, 425, 500, 502, 503, 504]);

/**
 * Stable, non-reversible fingerprint of a token.
 *
 * Callers use it to key per-token state (rate limiting, token bookkeeping)
 * without ever holding on to the token itself.
 */
export function tokenFingerprint(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 16);
}

export class MaimemoClient {
  private token: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private limiter: SlidingWindowRateLimiter;
  /** Where this client's token came from — see MaimemoClientOptions.tokenSource. */
  readonly tokenSource: "per-request" | "server";
  /** spelling -> voc_id. Vocabulary IDs are stable, so caching is safe. */
  private readonly vocIdCache = new Map<string, string>();

  constructor(token: string, options: MaimemoClientOptions = {}) {
    if (!token) throw new MaimemoError("A Maimemo API token is required.", { code: "auth" });
    this.token = token;
    this.baseUrl = options.baseUrl ?? "https://open.maimemo.com/open/";
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.maxRetries = options.maxRetries ?? 3;
    this.tokenSource = options.tokenSource ?? "server";
    this.limiter =
      options.rateLimiter ??
      new SlidingWindowRateLimiter(options.rateLimits ?? DEFAULT_RATE_LIMITS);
  }

  /**
   * Swap the token this client uses.
   *
   * An MCP session outlives the token it was opened with: Maimemo tokens
   * expire after roughly seven days, and the client (a phone app) then sends a
   * fresh token on the *same* session. Pinning the token to the session meant
   * the server kept calling Maimemo with the dead token — every call 401'd and
   * nothing the user did could fix it short of rebuilding the session.
   *
   * The rate limiter is per token (Maimemo quotas are per token), so the
   * caller has to hand over the new token's limiter as well.
   */
  setToken(token: string, options: { rateLimiter?: SlidingWindowRateLimiter } = {}): void {
    if (!token) throw new MaimemoError("A Maimemo API token is required.", { code: "auth" });
    this.token = token;
    if (options.rateLimiter) this.limiter = options.rateLimiter;
  }

  /**
   * Stable, non-reversible fingerprint of the active token.
   * Lets callers correlate a token across restarts without ever exposing it.
   */
  tokenFingerprint(): string {
    return tokenFingerprint(this.token);
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
      throw errorFromStatus(res.status, text || res.statusText, tryParse(text), {
        tokenSource: this.tokenSource,
        retryAfter: res.headers.get("retry-after") ?? undefined,
      });
    }
    if (!text.trim()) return {} as T;

    const json = tryParse(text) as Envelope<T> | undefined;
    if (json === undefined) {
      throw new MaimemoError(`Maimemo returned a non-JSON response: ${text.slice(0, 300)}`, {
        code: "api_error",
      });
    }

    if (Array.isArray(json.errors) && json.errors.length > 0) {
      // Maimemo sometimes answers 200 with an application-level error body.
      // `common_unauthorized` is a token problem, not a generic API problem,
      // and the distinction is what tells the caller what to fix.
      const parsed = parseMaimemoErrors(text);
      const first = parsed[0];
      if (first?.code === "common_unauthorized") {
        throw errorFromStatus(401, text, parsed, { tokenSource: this.tokenSource });
      }
      throw new MaimemoError(
        `Maimemo returned an application-level error${first ? `: ${first.code} — ${first.msg}` : "."}`,
        { code: "api_error", details: parsed.length ? parsed : json.errors },
      );
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
