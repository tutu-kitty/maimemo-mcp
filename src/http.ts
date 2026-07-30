import http from "node:http";
import { randomUUID } from "node:crypto";
import { URL } from "node:url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { MaimemoClient } from "./client.js";
import { SlidingWindowRateLimiter } from "./rate-limiter.js";
import { createMcpServer, SERVER_NAME, SERVER_VERSION } from "./server.js";
import type { AppConfig } from "./config.js";

type Session = { server: Server; transport: StreamableHTTPServerTransport };
type SseSession = { server: Server; transport: SSEServerTransport };

const MAX_BODY_BYTES = 4 * 1024 * 1024;
const HTTP_SCHEME = "http" + "://";

/**
 * Serves MCP over Streamable HTTP (the current spec) at /mcp, keeping the
 * deprecated HTTP+SSE transport at /sse so older clients keep working.
 *
 * Each request may carry its own Maimemo token via `Authorization: Bearer`,
 * which makes a single deployment safely usable by more than one person.
 */
export function startHttpServer(config: AppConfig): http.Server {
  // One limiter for the whole process: the quota is enforced by Maimemo per
  // token, but a shared limiter also protects us from self-inflicted bursts.
  const limiter = new SlidingWindowRateLimiter(config.rateLimits);
  const sessions = new Map<string, Session>();
  const sseSessions = new Map<string, SseSession>();

  const buildClient = (token: string) =>
    new MaimemoClient(token, {
      baseUrl: config.baseUrl,
      timeoutMs: config.requestTimeoutMs,
      maxRetries: config.maxRetries,
      rateLimiter: limiter,
    });

  const httpServer = http.createServer(async (req, res) => {
    try {
      applyCors(res);
      if (req.method === "OPTIONS") return end(res, 204, "");

      const origin = HTTP_SCHEME + (req.headers.host ?? "localhost");
      const url = new URL(req.url ?? "/", origin);

      if (url.pathname === "/healthz" || url.pathname === "/") {
        return json(res, 200, {
          status: "ok",
          server: SERVER_NAME,
          version: SERVER_VERSION,
          transport: "streamable-http",
          endpoints: { mcp: "/mcp", legacySse: "/sse" },
          sessions: sessions.size + sseSessions.size,
          rateLimit: limiter.snapshot(),
        });
      }

      if (url.pathname === "/mcp") {
        return await handleMcp(req, res, url);
      }

      // ---- Deprecated HTTP+SSE transport ----------------------------------
      if (url.pathname === "/sse" && req.method === "GET") {
        const token = resolveToken(req, url, config);
        if (!token) return json(res, 401, { error: "Missing Maimemo API token." });

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

    if (req.method === "GET" || req.method === "DELETE") {
      if (!existing) return json(res, 404, { error: "Unknown or expired MCP session." });
      await existing.transport.handleRequest(req, res);
      return;
    }

    if (req.method !== "POST") {
      return json(res, 405, { error: "Method not allowed." });
    }

    let body: unknown;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      return json(res, 400, { error: (error as Error).message });
    }

    if (existing) {
      await existing.transport.handleRequest(req, res, body);
      return;
    }

    if (!isInitializeRequest(body)) {
      return json(res, 400, {
        error: "Missing mcp-session-id header and the request is not an initialize request.",
      });
    }

    const token = resolveToken(req, url, config);
    if (!token) {
      return json(res, 401, {
        error:
          "Missing Maimemo API token. Send it as `Authorization: Bearer <token>` or configure MAIMEMO_API_TOKEN on the server.",
      });
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => sessions.set(id, { server, transport }),
    });
    const server = createMcpServer(buildClient(token));

    transport.onclose = () => {
      if (transport.sessionId) sessions.delete(transport.sessionId);
      void server.close().catch(() => undefined);
    };

    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  }

  httpServer.listen(config.port, config.host, () => {
    const log = (msg: string) => console.error(`[${SERVER_NAME}] ${msg}`);
    log(`v${SERVER_VERSION} listening on ${config.host}:${config.port}`);
    log("Streamable HTTP endpoint: POST /mcp");
    log("Legacy SSE endpoint:      GET  /sse");
    log("Health check:             GET  /healthz");
    log(
      `Token source: ${
        config.requireClientToken ? "per-request Authorization header" : "MAIMEMO_API_TOKEN env"
      }`,
    );
  });

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
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

/** Bearer header wins, then ?token=, then the server-wide fallback. */
function resolveToken(
  req: http.IncomingMessage,
  url: URL,
  config: AppConfig,
): string | undefined {
  const header = req.headers.authorization;
  if (header?.toLowerCase().startsWith("bearer ")) {
    const value = header.slice(7).trim();
    if (value) return value;
  }
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
