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

/** Maps an HTTP status from the Maimemo API onto a typed error. */
export function errorFromStatus(
  status: number,
  body: string,
  details?: unknown,
): MaimemoError {
  const snippet = body.slice(0, 500);

  if (status === 401 || status === 403) {
    return new MaimemoError(
      "Maimemo rejected the API token (401/403). Check MAIMEMO_API_TOKEN, or the Bearer token sent by the MCP client. Get a token in the app: \u6211\u7684 \u2192 \u66f4\u591a\u8bbe\u7f6e \u2192 \u5b9e\u9a8c\u529f\u80fd \u2192 \u5f00\u653e API.",
      { code: "auth", status, details },
    );
  }
  if (status === 404) {
    return new MaimemoError(`Resource not found (404). ${snippet}`, {
      code: "not_found",
      status,
      details,
    });
  }
  if (status === 429) {
    return new MaimemoError(
      "Maimemo rate limit exceeded (429). The client throttles automatically; retry shortly.",
      { code: "rate_limit", status, details, retryable: true },
    );
  }
  if (status >= 400 && status < 500) {
    return new MaimemoError(`Maimemo rejected the request (${status}). ${snippet}`, {
      code: "invalid_input",
      status,
      details,
    });
  }
  return new MaimemoError(`Maimemo server error (${status}). ${snippet}`, {
    code: "api_error",
    status,
    details,
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
