import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import type { MaimemoClient } from "./client.js";
import { formatError } from "./errors.js";
import { handleToolCall } from "./handlers.js";
import { log } from "./logger.js";
import { TOOLS } from "./tools.js";

export const SERVER_NAME = "maimemo";
/** Kept in sync with package.json — test/config.test.mjs guards the two. */
export const SERVER_VERSION = "2.1.0";

/**
 * Upper bound for one tool result.
 *
 * A 1000-word query serialises to ~100 KB of JSON, pretty-printed to ~195 KB,
 * and the same payload is sent twice (text + structuredContent) — nearly
 * 300 KB, about 75k tokens, in a single call on a phone. That does not fit
 * in a model context, and the call fails with an opaque error.
 */
const MAX_RESULT_BYTES = 64 * 1024;

/** Builds a fresh MCP server bound to one user's Maimemo client. */
export function createMcpServer(client: MaimemoClient): Server {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: { listChanged: false } } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
    const { name, arguments: args } = request.params;
    const startedAt = Date.now();
    try {
      const result = await handleToolCall(client, name, args);
      const payload = serializeResult(result);
      log.info("tool ok", {
        tool: name,
        ms: Date.now() - startedAt,
        token: client.tokenFingerprint(),
        bytes: payload.text.length,
        truncated: payload.truncated,
      });
      return {
        content: [{ type: "text", text: payload.text }],
        structuredContent: payload.structured,
      };
    } catch (error) {
      // Returning isError keeps the conversation alive so the model can retry
      // with corrected arguments rather than tearing down the session.
      const message = formatError(error);
      log.warn("tool failed", {
        tool: name,
        ms: Date.now() - startedAt,
        token: client.tokenFingerprint(),
        error: message,
      });
      return {
        content: [{ type: "text", text: message }],
        isError: true,
      };
    }
  });

  return server;
}

type SerializedResult = { text: string; structured: Record<string, unknown>; truncated: boolean };

/**
 * Serialises a tool result for the wire.
 *
 * Compact JSON (no pretty-printing) alone saves ~40% on large results.
 * Anything still over the budget is replaced by a notice that says what to
 * do next and carries the identifiers needed to narrow the query — a wall of
 * truncated text would be useless to the model and would still blow up.
 */
function serializeResult(result: unknown): SerializedResult {
  const text = JSON.stringify(result ?? {});
  if (text.length <= MAX_RESULT_BYTES) {
    return { text, structured: isRecord(result) ? result : { result }, truncated: false };
  }
  const ids = collectIds(result);
  const notice = {
    error: "result_too_large",
    bytes: text.length,
    limit_bytes: MAX_RESULT_BYTES,
    message:
      `The result is ${Math.round(text.length / 1024)} KB, over the ` +
      `${Math.round(MAX_RESULT_BYTES / 1024)} KB limit. Narrow the request — ` +
      `a smaller limit, one word at a time, or a single notepad — and call again.`,
    ids: ids.slice(0, 200),
    id_count: ids.length,
  };
  return { text: JSON.stringify(notice), structured: notice, truncated: true };
}

/** Collects the identifiers a caller would need to narrow a too-large result. */
function collectIds(value: unknown, out: string[] = [], depth = 0): string[] {
  if (out.length > 500 || depth > 4) return out;
  if (Array.isArray(value)) {
    for (const item of value) collectIds(item, out, depth + 1);
    return out;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["id", "voc_id", "spelling", "word"]) {
      const found = record[key];
      if (typeof found === "string" && found) out.push(found);
    }
    for (const nested of Object.values(record)) {
      if (nested && typeof nested === "object") collectIds(nested, out, depth + 1);
    }
  }
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
