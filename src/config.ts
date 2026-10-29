import { DEFAULT_RATE_LIMITS, type RateLimitWindow } from "./rate-limiter.js";

export type TransportKind = "http" | "stdio";

export type AppConfig = {
  /** Fallback token. Optional in http mode, where clients may send their own. */
  token?: string;
  transport: TransportKind;
  port: number;
  host: string;
  baseUrl: string;
  requestTimeoutMs: number;
  maxRetries: number;
  rateLimits: RateLimitWindow[];
  /** When true, http mode refuses requests that do not carry a Bearer token. */
  requireClientToken: boolean;
  logLevel: "debug" | "info" | "warn" | "error" | "silent";
};

function intFromEnv(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid ${name}: "${raw}" is not a non-negative integer.`);
  }
  return parsed;
}

function boolFromEnv(env: NodeJS.ProcessEnv, name: string, fallback: boolean): boolean {
  const raw = env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  throw new Error(`Invalid ${name}: "${raw}" is not a boolean.`);
}

/**
 * Parses configuration from the environment, failing fast with actionable
 * messages instead of surfacing confusing runtime errors later on.
 */
export function loadConfig(env = process.env): AppConfig {
  const rawTransport = (env.MAIMEMO_MCP_TRANSPORT ?? "http").trim().toLowerCase();
  // `sse` stays accepted for backwards compatibility with the 1.x releases.
  const transport: TransportKind =
    rawTransport === "stdio"
      ? "stdio"
      : rawTransport === "http" || rawTransport === "sse"
        ? "http"
        : (() => {
            throw new Error(
              `Invalid MAIMEMO_MCP_TRANSPORT: "${rawTransport}". Use "http" or "stdio".`,
            );
          })();

  const token = env.MAIMEMO_API_TOKEN?.trim() || undefined;
  const requireClientToken = boolFromEnv(env, "MAIMEMO_REQUIRE_CLIENT_TOKEN", !token);

  if (transport === "stdio" && !token) {
    throw new Error(
      "MAIMEMO_API_TOKEN is required in stdio mode. Get one in the app: \u6211\u7684 \u2192 \u66f4\u591a\u8bbe\u7f6e \u2192 \u5b9e\u9a8c\u529f\u80fd \u2192 \u5f00\u653e API.",
    );
  }
  if (transport === "http" && !token && !requireClientToken) {
    throw new Error(
      "http mode needs either MAIMEMO_API_TOKEN or MAIMEMO_REQUIRE_CLIENT_TOKEN=true.",
    );
  }

  const rateLimits: RateLimitWindow[] = env.MAIMEMO_RATE_LIMITS
    ? parseRateLimits(env.MAIMEMO_RATE_LIMITS)
    : DEFAULT_RATE_LIMITS;

  return {
    token,
    transport,
    port: intFromEnv(env, "PORT", 3000),
    host: env.HOST?.trim() || "0.0.0.0",
    baseUrl: env.MAIMEMO_API_BASE_URL?.trim() || "https://open.maimemo.com/open/",
    requestTimeoutMs: intFromEnv(env, "MAIMEMO_REQUEST_TIMEOUT_MS", 20_000),
    maxRetries: intFromEnv(env, "MAIMEMO_MAX_RETRIES", 3),
    rateLimits,
    requireClientToken,
    logLevel: (env.LOG_LEVEL?.trim().toLowerCase() as AppConfig["logLevel"]) || "info",
  };
}

/** Format: "10s:20,60s:40,5h:2000" */
function parseRateLimits(raw: string): RateLimitWindow[] {
  const unitMs: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000 };
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = /^(\d+)([smh]):(\d+)$/.exec(part);
      if (!match) {
        throw new Error(
          `Invalid MAIMEMO_RATE_LIMITS entry "${part}". Expected e.g. "10s:20".`,
        );
      }
      return {
        windowMs: Number(match[1]) * unitMs[match[2]],
        limit: Number(match[3]),
      };
    });
}
