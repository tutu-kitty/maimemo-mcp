import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { loadConfig } from "../dist/config.js";
import { SERVER_VERSION } from "../dist/server.js";

const BASE = { MAIMEMO_API_TOKEN: "test-token" };

describe("loadConfig", () => {
  it("reads values from the environment it is given, not from process.env", () => {
    const config = loadConfig({ ...BASE, PORT: "4321" });
    assert.equal(config.port, 4321);
  });

  it("applies documented defaults", () => {
    const config = loadConfig({ ...BASE });
    assert.equal(config.transport, "http");
    assert.equal(config.port, 3000);
    assert.equal(config.host, "0.0.0.0");
    assert.equal(config.baseUrl, "https://open.maimemo.com/open/");
    assert.equal(config.requestTimeoutMs, 20_000);
    assert.equal(config.maxRetries, 3);
    assert.equal(config.logLevel, "info");
  });

  it("parses rate limit windows", () => {
    const config = loadConfig({ ...BASE, MAIMEMO_RATE_LIMITS: "10s:20,60s:40" });
    assert.equal(config.rateLimits.length, 2);
    assert.deepEqual(config.rateLimits[0], { windowMs: 10_000, limit: 20 });
    assert.deepEqual(config.rateLimits[1], { windowMs: 60_000, limit: 40 });
  });

  it("rejects a malformed rate limit window with a useful message", () => {
    assert.throws(
      () => loadConfig({ ...BASE, MAIMEMO_RATE_LIMITS: "10x:20" }),
      /MAIMEMO_RATE_LIMITS/,
    );
  });

  it("rejects an invalid port instead of silently defaulting", () => {
    assert.throws(() => loadConfig({ ...BASE, PORT: "not-a-number" }), /Invalid PORT/);
  });

  it("rejects an invalid boolean instead of silently defaulting", () => {
    assert.throws(
      () => loadConfig({ ...BASE, MAIMEMO_REQUIRE_CLIENT_TOKEN: "maybe" }),
      /MAIMEMO_REQUIRE_CLIENT_TOKEN/,
    );
  });

  it("rejects an unknown transport", () => {
    assert.throws(() => loadConfig({ ...BASE, MAIMEMO_MCP_TRANSPORT: "carrier-pigeon" }), /transport/i);
  });

  it("requires a token in stdio mode", () => {
    assert.throws(() => loadConfig({ MAIMEMO_MCP_TRANSPORT: "stdio" }), /MAIMEMO_API_TOKEN/);
  });

  it("requires a token or client tokens in http mode", () => {
    assert.throws(
      () => loadConfig({ MAIMEMO_MCP_TRANSPORT: "http", MAIMEMO_REQUIRE_CLIENT_TOKEN: "false" }),
      /MAIMEMO_API_TOKEN/,
    );
  });

  it("allows http mode without a server token when client tokens are required", () => {
    const config = loadConfig({
      MAIMEMO_MCP_TRANSPORT: "http",
      MAIMEMO_REQUIRE_CLIENT_TOKEN: "true",
    });
    assert.equal(config.requireClientToken, true);
    assert.equal(config.token, undefined);
  });

  it("still accepts the legacy sse transport name", () => {
    const config = loadConfig({ ...BASE, MAIMEMO_MCP_TRANSPORT: "sse" });
    assert.equal(config.transport, "http");
  });
});

describe("version consistency", () => {
  it("keeps the advertised server version in sync with package.json", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8"));
    assert.equal(SERVER_VERSION, pkg.version);
  });
});
