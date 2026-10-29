import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { MaimemoClient } from "./client.js";
import { MaimemoError } from "./errors.js";

/**
 * MaiMemo documents a 7-day lifetime for Open API tokens issued from the web
 * console. The API exposes no token-introspection endpoint, so validity has to
 * be measured by probing, and the baseline has to be recorded locally.
 *
 * Expiry window maths: let T be the issue time and E = T + TTL the expiry.
 * We can only observe `firstSeen`, a moment at which the token still worked,
 * so T <= firstSeen and firstSeen <= E. Substituting E = T + TTL gives
 *
 *     firstSeen <= E <= firstSeen + TTL
 *
 * so the true expiry lies inside that window — it may be as early as
 * firstSeen (issued long before we noticed) and as late as firstSeen + TTL
 * (issued the moment we noticed). We report the window instead of a single
 * fake-precise date.
 */
const DEFAULT_TTL_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** How close to the latest-possible expiry counts as "soon". */
const EXPIRES_SOON_DAYS = 2;

export type TokenStatus = {
  /** "valid" | "expired_or_invalid" | "unknown" */
  status: "valid" | "expired_or_invalid" | "unknown";
  checked_at: string;
  /** sha256 prefix of the token — never the token itself. */
  token_fingerprint: string;
  first_seen_valid_at: string | null;
  days_since_first_seen: number | null;
  /** Configured token lifetime in days. */
  ttl_days: number;
  /** Earliest the token could possibly expire (it was already alive at firstSeen). */
  expires_at_earliest: string | null;
  /** Latest it could possibly expire (issue time could have been firstSeen). */
  expires_at_latest: string | null;
  days_remaining_max: number | null;
  /** True when even the latest-possible expiry is close. */
  expires_soon: boolean | null;
  probed: boolean;
  error: string | null;
  remedy: string;
};

type TokenState = {
  /** fingerprint -> ISO timestamp of the first moment that token was seen working. */
  firstSeenValidAt: Record<string, string>;
};

/**
 * Where the per-token bookkeeping lives.
 *
 * Defaults to an XDG state directory so a service manager does not inherit a
 * surprising working directory. Deployments that keep the project tree
 * read-only should point this somewhere writable.
 */
function stateDir(): string {
  const configured = process.env.MAIMEMO_TOKEN_STATE_DIR?.trim();
  if (configured) return configured;
  const stateHome = process.env.XDG_STATE_HOME?.trim() || join(homedir(), ".local", "state");
  return join(stateHome, "mcp-server-maimemo");
}

function stateFile(): string {
  return join(stateDir(), "token-status.json");
}

/**
 * Token lifetime in days. The documented value is 7; deployments that see a
 * different policy can override it without patching code.
 */
function ttlDays(): number {
  const raw = process.env.MAIMEMO_TOKEN_TTL_DAYS?.trim();
  if (!raw) return DEFAULT_TTL_DAYS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `Invalid MAIMEMO_TOKEN_TTL_DAYS: "${raw}". Expected a positive number of days.`,
    );
  }
  return parsed;
}

function loadState(): TokenState {
  try {
    const raw = readFileSync(stateFile(), "utf-8");
    const parsed = JSON.parse(raw) as TokenState;
    if (parsed && typeof parsed === "object" && parsed.firstSeenValidAt) {
      return { firstSeenValidAt: parsed.firstSeenValidAt };
    }
  } catch {
    // Missing or corrupt state is not fatal — we just re-learn the baseline.
  }
  return { firstSeenValidAt: {} };
}

/**
 * Persists state atomically: a crash mid-write must not leave a truncated
 * file that would silently discard every baseline we have learned.
 */
function saveState(state: TokenState): void {
  const file = stateFile();
  const temp = `${file}.${process.pid}.tmp`;
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    renameSync(temp, file);
  } catch {
    // A read-only filesystem must degrade, not break the tool.
    try {
      rmSync(temp, { force: true });
    } catch {
      // Nothing further to do — the temporary file is best-effort cleanup.
    }
  }
}

function isoDaysFrom(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * DAY_MS).toISOString();
}

/**
 * Verifies the configured token and reports how close it is to expiry.
 *
 * The probe deliberately reuses a cheap authenticated read so that a valid
 * token and a rejected token produce clearly different outcomes. Only an
 * explicit auth failure counts as "expired_or_invalid"; transport problems
 * are reported as "unknown" so nobody is told to rotate a working token
 * because the network blipped.
 */
export async function getTokenStatus(
  client: MaimemoClient,
  options: { probe?: boolean } = {},
): Promise<TokenStatus> {
  const probe = options.probe ?? true;
  const fingerprint = client.tokenFingerprint();
  const checkedAt = new Date().toISOString();
  const ttl = ttlDays();

  let status: TokenStatus["status"] = "unknown";
  let error: string | null = null;

  if (probe) {
    try {
      // Listing cloud notepads is a cheap authenticated read that succeeds for
      // every valid token and never depends on a particular word being in the
      // dictionary — a vocabulary lookup could 404 on a missing word and be
      // mistaken for a broken token.
      await client.request("/api/v1/notepads", { query: { limit: "1" } });
      status = "valid";
    } catch (err) {
      if (err instanceof MaimemoError) {
        error = err.message;
        status = err.code === "auth" ? "expired_or_invalid" : "unknown";
      } else {
        error = err instanceof Error ? err.message : String(err);
        status = "unknown";
      }
    }
  }

  const state = loadState();

  // Only a token we have just seen working may start the clock.
  if (status === "valid" && !state.firstSeenValidAt[fingerprint]) {
    state.firstSeenValidAt[fingerprint] = checkedAt;
    saveState(state);
  }

  const firstSeen = state.firstSeenValidAt[fingerprint] ?? null;
  const daysSince = firstSeen
    ? Math.floor((Date.now() - new Date(firstSeen).getTime()) / DAY_MS)
    : null;
  const earliest = firstSeen;
  const latest = firstSeen ? isoDaysFrom(firstSeen, ttl) : null;
  const daysRemainingMax = firstSeen
    ? Math.floor((new Date(latest as string).getTime() - Date.now()) / DAY_MS)
    : null;

  return {
    status,
    checked_at: checkedAt,
    token_fingerprint: fingerprint,
    first_seen_valid_at: firstSeen,
    days_since_first_seen: daysSince,
    ttl_days: ttl,
    expires_at_earliest: earliest,
    expires_at_latest: latest,
    days_remaining_max: daysRemainingMax,
    expires_soon: daysRemainingMax === null ? null : daysRemainingMax <= EXPIRES_SOON_DAYS,
    probed: probe,
    error,
    remedy:
      "If the status is expired_or_invalid, request a fresh token in the Maimemo app " +
      "(我的 → 更多设置 → 实验功能 → 开放 API) or at " +
      "https://open.maimemo.com/open/api/v1/tokens/openapi, then update MAIMEMO_API_TOKEN " +
      "in the server environment and restart the server.",
  };
}
