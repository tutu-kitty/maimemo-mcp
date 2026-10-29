import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";

import { MaimemoError } from "../dist/errors.js";
import { getTokenStatus } from "../dist/token-status.js";

/** Minimal stand-in for MaimemoClient — only the two members the tool uses. */
function fakeClient(fingerprint, behaviour) {
  return {
    tokenFingerprint: () => fingerprint,
    request: async (path, options) => behaviour(path, options),
  };
}

const ok = () => ({ data: { notepads: [] } });
const authError = () =>
  new MaimemoError("Maimemo rejected the API token (401/403).", { code: "auth", status: 401 });
const networkError = () =>
  new MaimemoError("Network failure: socket hang up", { code: "network", retryable: true });

let stateDir;

before(() => {
  stateDir = mkdtempSync(join(tmpdir(), "maimemo-token-state-"));
  process.env.MAIMEMO_TOKEN_STATE_DIR = stateDir;
});

after(() => {
  delete process.env.MAIMEMO_TOKEN_STATE_DIR;
  rmSync(stateDir, { recursive: true, force: true });
});

beforeEach(() => {
  rmSync(join(stateDir, "token-status.json"), { force: true });
});

describe("getTokenStatus", () => {
  it("reports a working token as valid", async () => {
    const status = await getTokenStatus(fakeClient("fp-valid", ok));
    assert.equal(status.status, "valid");
    assert.equal(status.probed, true);
    assert.equal(status.error, null);
  });

  it("records the baseline the first time a token is seen working", async () => {
    const status = await getTokenStatus(fakeClient("fp-first", ok));
    assert.ok(status.first_seen_valid_at, "expected a first_seen_valid_at timestamp");
    assert.equal(status.days_since_first_seen, 0);
    assert.equal(status.token_fingerprint, "fp-first");
  });

  it("never echoes the token itself", async () => {
    const secret = "super-secret-token-value";
    // Mirror what MaimemoClient.tokenFingerprint() really does.
    const fingerprint = createHash("sha256").update(secret).digest("hex").slice(0, 16);
    const status = await getTokenStatus(fakeClient(fingerprint, ok));
    assert.equal(status.token_fingerprint, fingerprint);
    assert.notEqual(status.token_fingerprint, secret);
    assert.ok(!JSON.stringify(status).includes(secret));
  });

  it("treats an explicit auth failure as expired_or_invalid", async () => {
    const status = await getTokenStatus(
      fakeClient("fp-auth", () => {
        throw authError();
      }),
    );
    assert.equal(status.status, "expired_or_invalid");
    assert.match(status.error, /token/i);
  });

  it("treats a transport failure as unknown, not as an expired token", async () => {
    const status = await getTokenStatus(
      fakeClient("fp-net", () => {
        throw networkError();
      }),
    );
    assert.equal(status.status, "unknown");
    assert.ok(status.error, "expected the transport error to be surfaced");
  });

  it("does not start the clock for a token that was never seen working", async () => {
    const status = await getTokenStatus(
      fakeClient("fp-fail", () => {
        throw authError();
      }),
    );
    assert.equal(status.first_seen_valid_at, null);
    assert.equal(status.expires_at_earliest, null);
    assert.equal(status.expires_at_latest, null);
    assert.equal(status.days_remaining_max, null);
    assert.equal(status.expires_soon, null);
  });

  it("probes the notepad endpoint, which does not depend on dictionary contents", async () => {
    let requestedPath = null;
    await getTokenStatus(
      fakeClient("fp-path", (path) => {
        requestedPath = path;
        return ok();
      }),
    );
    assert.equal(requestedPath, "/api/v1/notepads");
  });

  it("skips the probe when asked to only read local bookkeeping", async () => {
    let called = false;
    const status = await getTokenStatus(
      fakeClient("fp-noprobe", () => {
        called = true;
        return ok();
      }),
      { probe: false },
    );
    assert.equal(called, false);
    assert.equal(status.probed, false);
    assert.equal(status.status, "unknown");
  });

  it("keeps the baseline across restarts", async () => {
    await getTokenStatus(fakeClient("fp-persist", ok));
    const persisted = JSON.parse(readFileSync(join(stateDir, "token-status.json"), "utf-8"));
    assert.ok(persisted.firstSeenValidAt["fp-persist"], "expected the baseline to be persisted");

    const second = await getTokenStatus(fakeClient("fp-persist", ok));
    assert.equal(second.first_seen_valid_at, persisted.firstSeenValidAt["fp-persist"]);
  });

  it("recovers from a corrupt state file instead of failing", async () => {
    writeFileSync(join(stateDir, "token-status.json"), "{ this is not json");
    const status = await getTokenStatus(fakeClient("fp-corrupt", ok));
    assert.equal(status.status, "valid");
    assert.ok(status.first_seen_valid_at, "expected the baseline to be relearned");
  });

  it("writes state atomically and leaves no temporary files behind", async () => {
    await getTokenStatus(fakeClient("fp-atomic", ok));
    const leftovers = readdirSync(stateDir).filter((name) => name.includes(".tmp"));
    assert.deepEqual(leftovers, []);
  });

  it("reports the expiry as a window rather than a single date", async () => {
    const status = await getTokenStatus(fakeClient("fp-window", ok));
    const firstSeen = new Date(status.first_seen_valid_at);
    const earliest = new Date(status.expires_at_earliest);
    const latest = new Date(status.expires_at_latest);
    assert.equal(earliest.getTime(), firstSeen.getTime());
    assert.equal(
      latest.getTime() - earliest.getTime(),
      status.ttl_days * 24 * 60 * 60 * 1000,
    );
  });

  it("honours a configured TTL", async () => {
    process.env.MAIMEMO_TOKEN_TTL_DAYS = "3";
    try {
      const status = await getTokenStatus(fakeClient("fp-ttl", ok));
      assert.equal(status.ttl_days, 3);
      const firstSeen = new Date(status.first_seen_valid_at);
      const latest = new Date(status.expires_at_latest);
      assert.equal(
        latest.getTime() - firstSeen.getTime(),
        3 * 24 * 60 * 60 * 1000,
      );
    } finally {
      delete process.env.MAIMEMO_TOKEN_TTL_DAYS;
    }
  });

  it("flags a token whose latest-possible expiry is close", async () => {
    process.env.MAIMEMO_TOKEN_TTL_DAYS = "1";
    try {
      // Pretend the token was first seen 6.5 days ago: whatever the real issue
      // time was, the latest it can live is firstSeen + 1 day, which has passed.
      const stale = new Date(Date.now() - 6.5 * 24 * 60 * 60 * 1000).toISOString();
      writeFileSync(
        join(stateDir, "token-status.json"),
        JSON.stringify({ firstSeenValidAt: { "fp-stale": stale } }),
      );
      const status = await getTokenStatus(fakeClient("fp-stale", ok));
      assert.equal(status.expires_soon, true);
      assert.ok(status.days_remaining_max < 0);
    } finally {
      delete process.env.MAIMEMO_TOKEN_TTL_DAYS;
    }
  });

  it("offers an actionable remedy that does not leak a local path", async () => {
    const status = await getTokenStatus(fakeClient("fp-remedy", ok));
    assert.match(status.remedy, /MAIMEMO_API_TOKEN/);
    assert.ok(!status.remedy.includes("/etc/"), "remedy should not mention a local filesystem path");
  });
});
