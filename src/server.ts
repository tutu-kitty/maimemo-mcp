import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import type { MaimemoClient } from "./client.js";
import { formatError } from "./errors.js";
import { handleToolCall } from "./handlers.js";
import { TOOLS } from "./tools.js";

export const SERVER_NAME = "maimemo";
/** Kept in sync with package.json — test/config.test.mjs guards the two. */
export const SERVER_VERSION = "2.1.0";

/** Builds a fresh MCP server bound to one user's Maimemo client. */
export function createMcpServer(client: MaimemoClient): Server {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: { listChanged: false } } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
    const { name, arguments: args } = request.params;
    try {
      const result = await handleToolCall(client, name, args);
      const structured = isRecord(result) ? result : { result };
      return {
        content: [{ type: "text", text: JSON.stringify(result ?? {}, null, 2) }],
        structuredContent: structured,
      };
    } catch (error) {
      // Returning isError keeps the conversation alive so the model can retry
      // with corrected arguments rather than tearing down the session.
      return {
        content: [{ type: "text", text: formatError(error) }],
        isError: true,
      };
    }
  });

  return server;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
