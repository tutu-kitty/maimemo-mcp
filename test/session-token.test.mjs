import assert from "node:assert/strict";
import http from "node:http";
import { describe, it, after } from "node:test";

import { loadConfig } from "../dist/config.js";
import { startHttpServer } from "../dist/http.js";
import { tokenFingerprint } from "../dist/client.js";

/**
 * A session must not pin the token it was opened with.
 *
 * Maimemo tokens expire after roughly seven days. The client (a phone app)
 * then sends a fresh token on the *same* MCP session. If the server keeps
 * using the token captured at initialize time, every call 401s forever and
 * nothing the user does can fix it short of rebuilding the session — which
 * is exactly the bug this test guards against.
 */

const servers = [];

after(() => {
  for (const server of servers) server.close();
});

/** A stand-in for the Maimemo API that rejects every token. */
function startStubApi() {
  const server = http.createServer((req, res) => {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        errors: [{ code: "common_unauthorized", msg: "Authorization failed", info: "" }],
        success: false,
      }),
    );
  });
  servers.push(server);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function startServer(apiPort) {
  const config = loadConfig({
    MAIMEMO_MCP_TRANSPORT: "http",
    HOST: "127.0.0.1",
    PORT: "0",
    MAIMEMO_REQUIRE_CLIENT_TOKEN: "true",
    MAIMEMO_API_BASE_URL: `http://127.0.0.1:${apiPort}/open/`,
  });
  const server = startHttpServer(config);
  servers.push(server);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

async function post(port, body, { token, sessionId }) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (sessionId) headers["mcp-session-id"] = sessionId;
  const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return {
    status: res.status,
    sessionId: res.headers.get("mcp-session-id"),
    payload: parsePayload(text),
  };
}

/** The MCP transport answers with SSE frames; pull the JSON-RPC payload out. */
function parsePayload(text) {
  const line = text.split("\n").find((entry) => entry.startsWith("data: "));
  if (!line) return undefined;
  try {
    return JSON.parse(line.slice("data: ".length));
  } catch {
    return undefined;
  }
}

const initializeBody = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "test", version: "1.0" },
  },
};

const tokenStatusBody = {
  jsonrpc: "2.0",
  id: 2,
  method: "tools/call",
  params: { name: "get_token_status", arguments: {} },
};

function fingerprintOf(payload) {
  const text = payload.result.content[0].text;
  return JSON.parse(text).token_fingerprint;
}

describe("session token rotation", () => {
  it("uses the token from the request header, not the one from initialize", async () => {
    const apiPort = await startStubApi();
    const port = await startServer(apiPort);
    const tokenA = "token-a-".padEnd(40, "a");
    const tokenB = "token-b-".padEnd(40, "b");

    const opened = await post(port, initializeBody, { token: tokenA });
    assert.ok(opened.sessionId, "expected an mcp-session-id");

    const first = await post(port, tokenStatusBody, {
      token: tokenA,
      sessionId: opened.sessionId,
    });
    assert.equal(fingerprintOf(first.payload), tokenFingerprint(tokenA));

    // The client rotated its token but kept the session.
    const rotated = await post(port, tokenStatusBody, {
      token: tokenB,
      sessionId: opened.sessionId,
    });
    assert.equal(
      fingerprintOf(rotated.payload),
      tokenFingerprint(tokenB),
      "the session should follow the token in the request header",
    );
  });

  it("keeps one session when the token rotates", async () => {
    const apiPort = await startStubApi();
    const port = await startServer(apiPort);
    const tokenA = "token-a-".padEnd(40, "a");
    const tokenB = "token-b-".padEnd(40, "b");

    const opened = await post(port, initializeBody, { token: tokenA });
    await post(port, tokenStatusBody, { token: tokenA, sessionId: opened.sessionId });
    await post(port, tokenStatusBody, { token: tokenB, sessionId: opened.sessionId });

    const health = await fetch(`http://127.0.0.1:${port}/healthz`).then((r) => r.json());
    assert.equal(health.sessions, 1);
  });

  it("reports the Maimemo error code instead of a bare status", async () => {
    const apiPort = await startStubApi();
    const port = await startServer(apiPort);
    const token = "token-a-".padEnd(40, "a");

    const opened = await post(port, initializeBody, { token });
    const status = await post(port, tokenStatusBody, { token, sessionId: opened.sessionId });
    const text = status.payload.result.content[0].text;
    assert.equal(JSON.parse(text).status, "expired_or_invalid");
  });
});
