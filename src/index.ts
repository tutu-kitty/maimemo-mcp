#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MaimemoClient } from "./client.js";
import { loadConfig } from "./config.js";
import { startHttpServer } from "./http.js";
import { createMcpServer, SERVER_NAME, SERVER_VERSION } from "./server.js";

async function main(): Promise<void> {
  const config = loadConfig();

  if (config.transport === "stdio") {
    // stdout is reserved for the JSON-RPC stream; all logs go to stderr.
    const client = new MaimemoClient(config.token!, {
      baseUrl: config.baseUrl,
      timeoutMs: config.requestTimeoutMs,
      maxRetries: config.maxRetries,
      rateLimits: config.rateLimits,
    });
    const server = createMcpServer(client);
    await server.connect(new StdioServerTransport());
    console.error(`[${SERVER_NAME}] v${SERVER_VERSION} ready on stdio`);

    const shutdown = async () => {
      await server.close().catch(() => undefined);
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    return;
  }

  startHttpServer(config);
}

main().catch((error) => {
  console.error(`[${SERVER_NAME}] fatal:`, error instanceof Error ? error.message : error);
  process.exit(1);
});
