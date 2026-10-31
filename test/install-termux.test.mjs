import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

/**
 * The Termux installer is the one-command entry point for running this server
 * without a VPS, so its configuration output has to be predictable: the
 * server-side-token mode and the client-token-only mode must never produce
 * the same file, or a user who asked for one will silently get the other.
 */

const SCRIPT = fileURLToPath(new URL("../deploy/install-termux.sh", import.meta.url));

function runInstaller(args, env = {}) {
  return spawnSync("bash", [SCRIPT, ...args], {
    encoding: "utf8",
    env: { ...process.env, HOME: "/tmp/maimemo-mcp-test-home", ...env },
  });
}

function parseEnv(text) {
  const out = {};
  for (const line of text.trim().split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    out[line.slice(0, eq)] = line.slice(eq + 1);
  }
  return out;
}

describe("install-termux.sh", () => {
  it("prints usage for --help and exits successfully", () => {
    const result = runInstaller(["--help"]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /--client-token-only/);
    assert.match(result.stdout, /--print-config/);
  });

  it("rejects an unknown option instead of ignoring it", () => {
    const result = runInstaller(["--definitely-not-a-flag"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Unknown option/);
  });

  it("keeps the token on the server by default", () => {
    const result = runInstaller(["--print-config"]);
    assert.equal(result.status, 0);
    const env = parseEnv(result.stdout);
    assert.ok("MAIMEMO_API_TOKEN" in env);
    assert.equal(env.MAIMEMO_REQUIRE_CLIENT_TOKEN, undefined);
  });

  it("stores no token at all in --client-token-only mode", () => {
    const result = runInstaller(["--print-config", "--client-token-only"]);
    assert.equal(result.status, 0);
    const env = parseEnv(result.stdout);
    assert.equal(env.MAIMEMO_API_TOKEN, undefined);
    assert.equal(env.MAIMEMO_REQUIRE_CLIENT_TOKEN, "true");
  });

  it("writes a usable transport and loopback defaults in both modes", () => {
    for (const args of [[], ["--client-token-only"]]) {
      const env = parseEnv(runInstaller(["--print-config", ...args]).stdout);
      assert.equal(env.MAIMEMO_MCP_TRANSPORT, "http");
      assert.equal(env.HOST, "127.0.0.1");
      assert.equal(env.PORT, "9103");
      assert.match(env.MAIMEMO_TOKEN_STATE_DIR, /state$/);
    }
  });

  it("honours the port and host overrides", () => {
    const env = parseEnv(
      runInstaller(["--print-config"], { MAIMEMO_PORT: "3000", MAIMEMO_HOST: "0.0.0.0" }).stdout,
    );
    assert.equal(env.PORT, "3000");
    assert.equal(env.HOST, "0.0.0.0");
  });
});
