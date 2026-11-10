/**
 * Typed error hierarchy so tool handlers can turn failures into actionable,
 * model-readable messages instead of opaque `HTTP 400: {...}` strings.
 */

export type MaimemoErrorCode =
  | "auth"
  | "rate_limit"
  | "not_found"
  | "invalid_input"
  | "api_error"
  | "network"
  | "timeout";

export class MaimemoError extends Error {
  readonly code: MaimemoErrorCode;
  readonly status?: number;
  readonly details?: unknown;
  readonly retryable: boolean;

  constructor(
    message: string,
    options: {
      code: MaimemoErrorCode;
      status?: number;
      details?: unknown;
      retryable?: boolean;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = "MaimemoError";
    this.code = options.code;
    this.status = options.status;
    this.details = options.details;
    this.retryable = options.retryable ?? false;
  }
}

/** One entry of Maimemo's structured error body. */
export type MaimemoApiError = { code: string; msg: string; info?: string };

/**
 * Pulls Maimemo's structured error codes out of a response body.
 *
 * Maimemo answers with `{"errors":[{"code":"common_unauthorized","msg":"..."}],"success":false}`.
 * That code is the part that tells an LLM what to do next, so it belongs in
 * the message itself instead of being buried under a raw JSON blob.
 */
export function parseMaimemoErrors(body: string): MaimemoApiError[] {
  try {
    const parsed = JSON.parse(body) as { errors?: unknown };
    if (!Array.isArray(parsed.errors)) return [];
    return parsed.errors
      .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
      .map((entry) => ({
        code: String(entry.code ?? "unknown"),
        msg: String(entry.msg ?? ""),
        info: entry.info === undefined || entry.info === "" ? undefined : String(entry.info),
      }));
  } catch {
    return [];
  }
}

/**
 * Maps an HTTP status from the Maimemo API onto a typed error.
 *
 * `options.tokenSource` decides *where* the fix has to be applied: in the
 * shared, zero-credential deployment the server holds no token at all, so
 * "check MAIMEMO_API_TOKEN" would send the user after a variable that does
 * not exist on this machine.
 */
export function errorFromStatus(
  status: number,
  body: string,
  details?: unknown,
  options: { tokenSource?: "per-request" | "server"; retryAfter?: string } = {},
): MaimemoError {
  const snippet = body.slice(0, 500);
  const apiErrors = parseMaimemoErrors(body);
  const first = apiErrors[0];
  const said = first ? ` Maimemo said: ${first.code} — ${first.msg}` : "";
  const detailPayload = apiErrors.length ? apiErrors : details;

  if (status === 401 || status === 403) {
    const where =
      options.tokenSource === "per-request"
        ? "Send it as the `Authorization: Bearer <token>` header from your MCP client."
        : "Update MAIMEMO_API_TOKEN in the server environment and restart the server.";
    return new MaimemoError(
      `Maimemo rejected the API token (${status}).${said} ` +
        `Get a fresh token in the app: 我的 → 更多设置 → 实验功能 → 开放 API. ${where}`,
      { code: "auth", status, details: detailPayload },
    );
  }
  if (status === 404) {
    return new MaimemoError(`Resource not found (404).${said} ${snippet}`, {
      code: "not_found",
      status,
      details: detailPayload,
    });
  }
  if (status === 429) {
    const wait = options.retryAfter ? ` Retry-After: ${options.retryAfter}.` : "";
    return new MaimemoError(
      `Maimemo rate limit exceeded (429).${said}${wait} ` +
        `The quota is per token (10s/20, 60s/40, 5h/2000) and this call will not be retried — ` +
        `wait for the window to reset, then ask for a smaller page size.`,
      { code: "rate_limit", status, details: detailPayload },
    );
  }
  if (status >= 400 && status < 500) {
    return new MaimemoError(`Maimemo rejected the request (${status}).${said} ${snippet}`, {
      code: "invalid_input",
      status,
      details: detailPayload,
    });
  }
  return new MaimemoError(`Maimemo server error (${status}). ${snippet}`, {
    code: "api_error",
    status,
    details: detailPayload,
    retryable: true,
  });
}

/** Renders any thrown value into a concise string for an MCP error result. */
export function formatError(error: unknown): string {
  if (error instanceof MaimemoError) {
    const parts = [`[${error.code}] ${error.message}`];
    if (error.details !== undefined) {
      parts.push(`Details: ${safeStringify(error.details)}`);
    }
    return parts.join("\n");
  }
  if (error instanceof Error) return `[unexpected] ${error.message}`;
  return `[unexpected] ${String(error)}`;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2).slice(0, 1000);
  } catch {
    return String(value);
  }
}
