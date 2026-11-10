/**
 * Minimal leveled logger.
 *
 * Why it exists: before this, the service wrote nothing but its startup banner,
 * so every incident had to be diagnosed from the reverse proxy's access log
 * alone — which does not know what the MCP session was actually doing.
 *
 * Two rules this file exists to enforce:
 *
 * 1. **Never log a token.** Callers pass a fingerprint (sha256 prefix), not the
 *    secret. There is no code path here that accepts a raw token.
 * 2. **Never log a full response body.** Tool results can contain the user's
 *    vocabulary and notes; only metadata is logged.
 *
 * Everything goes to stderr on purpose: systemd appends stdout and stderr to
 * the same log file, and stderr stays unbuffered on a crash.
 */

type Level = "debug" | "info" | "warn" | "error";

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function threshold(): number {
  // LOG_LEVEL is the name the deployment already sets; MAIMEMO_LOG_LEVEL is
  // accepted as an explicit override so a host app can scope it.
  const raw = (process.env.LOG_LEVEL ?? process.env.MAIMEMO_LOG_LEVEL ?? "info")
    .trim()
    .toLowerCase();
  if (raw === "silent") return Number.POSITIVE_INFINITY;
  return LEVELS[raw as Level] ?? LEVELS.info;
}

function emit(level: Level, message: string, fields?: Record<string, unknown>): void {
  if (LEVELS[level] < threshold()) return;
  const extra = fields ? ` ${JSON.stringify(fields)}` : "";
  console.error(`[maimemo] ${level.toUpperCase()} ${message}${extra}`);
}

export const log = {
  debug: (message: string, fields?: Record<string, unknown>): void =>
    emit("debug", message, fields),
  info: (message: string, fields?: Record<string, unknown>): void =>
    emit("info", message, fields),
  warn: (message: string, fields?: Record<string, unknown>): void =>
    emit("warn", message, fields),
  error: (message: string, fields?: Record<string, unknown>): void =>
    emit("error", message, fields),
};
