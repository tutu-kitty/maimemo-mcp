import assert from "node:assert/strict";
import { describe, it, after } from "node:test";

import { loadConfig } from "../dist/config.js";
import { startHttpServer } from "../dist/http.js";
import { tokenFingerprint } from "../dist/client.js";

/**
 * Maimemo enforces its quota per API token. A server that shares one sliding
 * window across every caller lets a single burst from one person starve the
 * rest, so each token must get its own window.
 */

const servers = [];

after(() => {
  for (const server of servers) server.close();
});

function startServer(overrides = {}) {
  const config = loadConfig({
    MAIMEMO_MCP_TRANSPORT: "http",
    HOST: "127.0.0.1",
    PORT: "0",
    MAIMEMO_REQUIRE_CLIENT_TOKEN: "true",
    ...overrides,
  });
  const server = startHttpServer(config);
  servers.push(server);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, port: server.address().port });
    });
  });
}

async function initialize(port, token) {
  const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test", version: "1.0" },
      },
    }),
  });
  return res.headers.get("mcp-session-id");
}

describe("per-token rate limiting", () => {
  it("fingerprinting a token is stable and does not reveal it", () => {
    const first = tokenFingerprint("secret-token-value");
    assert.equal(first, tokenFingerprint("secret-token-value"));
    assert.notEqual(first, tokenFingerprint("another-token-value"));
    assert.equal(first.length, 16);
    assert.ok(!first.includes("secret"));
  });

  it("gives each distinct token its own window", async () => {
    const { port } = await startServer();

    assert.ok(await initialize(port, "token-a"));
    assert.ok(await initialize(port, "token-b"));
    assert.ok(await initialize(port, "token-a"));

    const health = await (await fetch(`http://127.0.0.1:${port}/healthz`)).json();

    // Two fingerprints, not three: the repeated token reuses its window.
    assert.equal(health.rateLimitTokens, 2);
  });

  it("does not require a server-wide token", async () => {
    const { port } = await startServer();

    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0" },
        },
      }),
    });

    assert.equal(res.status, 401);
  });
});
