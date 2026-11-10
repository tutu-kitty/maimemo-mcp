import http from "node:http";
import { randomUUID } from "node:crypto";
import { URL } from "node:url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { MaimemoClient, tokenFingerprint } from "./client.js";
import { SlidingWindowRateLimiter } from "./rate-limiter.js";
import { createMcpServer, SERVER_NAME, SERVER_VERSION } from "./server.js";
import { log } from "./logger.js";
import type { AppConfig } from "./config.js";

type Session = {
  server: Server;
  transport: StreamableHTTPServerTransport;
  client: MaimemoClient;
  createdAt: number;
  lastSeenAt: number;
  token: string;
};
type SseSession = { server: Server; transport: SSEServerTransport };

const MAX_BODY_BYTES = 4 * 1024 * 1024;
const HTTP_SCHEME = "http" + "://";

/**
 * Shape of a Maimemo account token (64 hex characters in practice).
 * Used to recognise a token that arrives without a "Bearer " prefix.
 */
const MAIMEMO_TOKEN_SHAPE = /^[A-Za-z0-9_-]{32,128}$/;

/**
 * Sessions are only released when the client sends DELETE or the transport
 * closes. Mobile clients that get killed by the OS never do either, so the
 * session map used to grow without bound (73 sessions after nine days).
 * These bounds keep the map small without cutting a live session short.
 */
const SESSION_IDLE_MS = 2 * 60 * 60 * 1000;
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SESSION_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const MAX_SESSIONS = 200;

/**
 * Serves MCP over Streamable HTTP (the current spec) at /mcp, keeping the
 * deprecated HTTP+SSE transport at /sse so older clients keep working.
 *
 * Each request may carry its own Maimemo token via `Authorization: Bearer`,
 * which makes a single deployment safely usable by more than one person.
 */
export function startHttpServer(config: AppConfig): http.Server {
  // One sliding window per token, not one per process: Maimemo enforces its
  // quota per API token, so a single shared window would let one person's
  // burst starve everybody else on a shared deployment.
  const limiters = new Map<string, SlidingWindowRateLimiter>();
  const limiterFor = (token: string): SlidingWindowRateLimiter => {
    const key = tokenFingerprint(token);
    let limiter = limiters.get(key);
    if (!limiter) {
      limiter = new SlidingWindowRateLimiter(config.rateLimits);
      limiters.set(key, limiter);
    }
    return limiter;
  };
  const sessions = new Map<string, Session>();
  const sseSessions = new Map<string, SseSession>();

  /**
   * Drop sessions that outlived their welcome or push the map over the cap.
   * Without this the map only ever grows: a mobile client that is killed
   * without closing its stream never triggers `transport.onclose`.
   */
  const sweepSessions = (): void => {
    const now = Date.now();
    let removed = 0;
    for (const [id, session] of sessions) {
      const idle = now - session.lastSeenAt;
      const age = now - session.createdAt;
      if (idle > SESSION_IDLE_MS || age > SESSION_MAX_AGE_MS) {
        sessions.delete(id);
        void session.server.close().catch(() => undefined);
        removed += 1;
      }
    }
    while (sessions.size > MAX_SESSIONS) {
      const oldest = [...sessions.entries()].sort((a, b) => a[1].lastSeenAt - b[1].lastSeenAt)[0];
      if (!oldest) break;
      sessions.delete(oldest[0]);
      void oldest[1].server.close().catch(() => undefined);
      removed += 1;
    }
    if (removed > 0) log.info("session sweep", { removed, remaining: sessions.size });
  };
  const sweepTimer = setInterval(sweepSessions, SESSION_SWEEP_INTERVAL_MS);
  sweepTimer.unref();

  const buildClient = (token: string) =>
    new MaimemoClient(token, {
      baseUrl: config.baseUrl,
      timeoutMs: config.requestTimeoutMs,
      maxRetries: config.maxRetries,
      rateLimiter: limiterFor(token),
      tokenSource: config.requireClientToken ? "per-request" : "server",
    });

  const httpServer = http.createServer(async (req, res) => {
    const startedAt = Date.now();
    // Only ever a fingerprint — the raw token never reaches the log.
    const authHeader = req.headers.authorization;
    const rawToken = authHeader?.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : "";
    let tokenFp = rawToken ? tokenFingerprint(rawToken) : "-";
    let route = req.url ?? "/";
    res.on("finish", () => {
      log.info("http", {
        method: req.method,
        route,
        status: res.statusCode,
        ms: Date.now() - startedAt,
        token: tokenFp,
        session: (req.headers["mcp-session-id"] as string | undefined) ?? "-",
      });
    });
    try {
      applyCors(res);
      if (req.method === "OPTIONS") return end(res, 204, "");

      const origin = HTTP_SCHEME + (req.headers.host ?? "localhost");
      const url = new URL(req.url ?? "/", origin);
      route = url.pathname;

      if (url.pathname === "/healthz" || url.pathname === "/") {
        return json(res, 200, {
          status: "ok",
          server: SERVER_NAME,
          version: SERVER_VERSION,
          transport: "streamable-http",
          endpoints: { mcp: "/mcp", legacySse: "/sse" },
          sessions: sessions.size + sseSessions.size,
          rateLimit: aggregateUsage(limiters, config.rateLimits),
          rateLimitTokens: limiters.size,
        });
      }

      if (url.pathname === "/mcp") {
        return await handleMcp(req, res, url);
      }

      // ---- Deprecated HTTP+SSE transport ----------------------------------
      if (url.pathname === "/sse" && req.method === "GET") {
        const token = resolveToken(req, url, config);
        if (!token) {
          tokenFp = "-";
          log.warn("sse rejected: missing Maimemo token", { route, token: tokenFp });
          return json(res, 401, { error: "Missing Maimemo API token." });
        }
        tokenFp = tokenFingerprint(token);
        const transport = new SSEServerTransport("/messages", res);
        const server = createMcpServer(buildClient(token));
        sseSessions.set(transport.sessionId, { server, transport });
        res.on("close", () => {
          sseSessions.delete(transport.sessionId);
          void server.close().catch(() => undefined);
        });
        await server.connect(transport);
        return;
      }

      if (url.pathname === "/messages" && req.method === "POST") {
        const sessionId = url.searchParams.get("sessionId") ?? "";
        const session = sseSessions.get(sessionId);
        if (!session) return json(res, 404, { error: "Unknown sessionId." });
        await session.transport.handlePostMessage(req, res);
        return;
      }

      return json(res, 404, { error: `No route for ${req.method} ${url.pathname}` });
    } catch (error) {
      console.error("[http] unhandled error", error);
      if (!res.headersSent) json(res, 500, { error: "Internal server error" });
      else res.end();
    }
  });

  async function handleMcp(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    url: URL,
  ): Promise<void> {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    const existing = sessionId ? sessions.get(sessionId) : undefined;

    if (existing) {
      existing.lastSeenAt = Date.now();
      // A client that rotated its Maimemo token keeps talking on the same MCP
      // session. Follow the request header instead of pinning the token that
      // happened to be current when the session was opened — otherwise the
      // server keeps calling Maimemo with a dead token and every call 401s.
      const headerToken = resolveToken(req, url, config);
      if (headerToken) {
        const fingerprint = tokenFingerprint(headerToken);
        if (fingerprint !== existing.token) {
          existing.client.setToken(headerToken, { rateLimiter: limiterFor(headerToken) });
          existing.token = fingerprint;
          log.info("session token rotated", { session: sessionId, token: fingerprint });
        }
      }
      if (req.method === "GET" || req.method === "DELETE") {
        await existing.transport.handleRequest(req, res);
        return;
      }
      if (req.method !== "POST") {
        return json(res, 405, { error: "Method not allowed." });
      }
      let existingBody: unknown;
      try {
        existingBody = await readJsonBody(req);
      } catch (error) {
        return json(res, 400, { error: (error as Error).message });
      }
      await existing.transport.handleRequest(req, res, existingBody);
      return;
    }

    let body: unknown;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      return json(res, 400, { error: (error as Error).message });
    }

    if (!isInitializeRequest(body)) {
      return json(res, 400, {
        error: "Missing mcp-session-id header and the request is not an initialize request.",
      });
    }

    const token = resolveToken(req, url, config);
    if (!token) {
      log.warn("initialize rejected: missing Maimemo token", { route: "/mcp" });
      return json(res, 401, {
        error:
          "Missing Maimemo API token. Send it as `Authorization: Bearer <token>` or configure MAIMEMO_API_TOKEN on the server.",
      });
    }

    // One client, shared by the server and the session entry: the session
    // needs a handle on it so it can swap in a rotated token later.
    const client = buildClient(token);
    const server = createMcpServer(client);
    let transport: StreamableHTTPServerTransport;
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id: string): void => {
        sessions.set(id, {
          server,
          transport,
          client,
          createdAt: Date.now(),
          lastSeenAt: Date.now(),
          token: tokenFingerprint(token),
        });
        log.info("session opened", { session: id, token: tokenFingerprint(token) });
      },
      onsessionclosed: (id: string): void => {
        sessions.delete(id);
        log.info("session closed", { session: id });
      },
    });

    transport.onclose = () => {
      if (transport.sessionId) sessions.delete(transport.sessionId);
      void server.close().catch(() => undefined);
    };

    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  }

  httpServer.listen(config.port, config.host, () => {
    const banner = (msg: string) => console.error(`[${SERVER_NAME}] ${msg}`);
    banner(`v${SERVER_VERSION} listening on ${config.host}:${config.port}`);
    banner("Streamable HTTP endpoint: POST /mcp");
    banner("Legacy SSE endpoint:      GET  /sse");
    banner("Health check:             GET  /healthz");
    banner(
      `Token source: ${
        config.requireClientToken ? "per-request Authorization header" : "MAIMEMO_API_TOKEN env"
      }`,
    );
  });

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(sweepTimer);
    console.error(`[${SERVER_NAME}] shutting down...`);
    for (const { server } of [...sessions.values(), ...sseSessions.values()]) {
      await server.close().catch(() => undefined);
    }
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5_000).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  return httpServer;
}

/**
 * Worst-case usage per window across every token bucket.
 *
 * The health check used to report a hardcoded zero, so it kept saying
 * "plenty of quota left" while the quota was actually spent.
 */
function aggregateUsage(
  limiters: Map<string, SlidingWindowRateLimiter>,
  windows: AppConfig["rateLimits"],
): Array<AppConfig["rateLimits"][number] & { used: number }> {
  const snapshots = [...limiters.values()].map((limiter) => limiter.snapshot());
  return windows.map((window, index) => ({
    ...window,
    used: snapshots.reduce((max, snapshot) => Math.max(max, snapshot[index]?.used ?? 0), 0),
  }));
}

/** Bearer header wins, then ?token=, then the server-wide fallback. */function resolveToken(
  req: http.IncomingMessage,
  url: URL,
  config: AppConfig,
): string | undefined {
  const header = req.headers.authorization;
  if (header?.toLowerCase().startsWith("bearer ")) {
    const value = header.slice(7).trim();
    if (value) return value;
  }
  // A bare token is accepted too, without the "Bearer " prefix.
  //
  // Some mobile clients cannot reliably send a header value that contains a
  // space: a stray line break right after "Bearer" makes the HTTP layer
  // reject the request before it ever leaves the phone, and the user gets a
  // stack trace instead of a status. Dropping the prefix takes every chance
  // of a mis-typed one off the table.
  const bare = header?.trim();
  if (bare && MAIMEMO_TOKEN_SHAPE.test(bare)) return bare;
  const queryToken = url.searchParams.get("token")?.trim();
  if (queryToken) return queryToken;
  return config.requireClientToken ? undefined : config.token;
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new Error("Request body too large.");
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Request body is not valid JSON.");
  }
}

function applyCors(res: http.ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, mcp-session-id, mcp-protocol-version, last-event-id",
  );
  res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");
}

function json(res: http.ServerResponse, status: number, payload: unknown): void {
  end(res, status, JSON.stringify(payload), "application/json");
}

function end(
  res: http.ServerResponse,
  status: number,
  body: string,
  contentType = "text/plain",
): void {
  if (res.headersSent) return void res.end();
  res.writeHead(status, { "Content-Type": contentType });
  res.end(body);
}
