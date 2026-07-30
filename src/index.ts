import http from "node:http";
import { URL } from "node:url";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MaimemoClient } from "./client.js";
import { createMcpServer } from "./server.js";

const token = process.env.MAIMEMO_API_TOKEN;
if (!token) {
  console.error("MAIMEMO_API_TOKEN environment variable is required");
  process.exit(1);
}

const client = new MaimemoClient(token);
const transportType = process.env.MAIMEMO_MCP_TRANSPORT ?? "sse";

if (transportType === "stdio") {
  const server = createMcpServer(client);
  const transport = new StdioServerTransport();
  await server.connect(transport);
} else {
  const port = parseInt(process.env.PORT ?? "3000", 10);
  const transports = new Map<string, SSEServerTransport>();

  const httpServer = http.createServer(async (req, res) => {
    try {
      if (req.url === "/sse") {
        const transport = new SSEServerTransport("/messages", res);
        const server = createMcpServer(client);
        transports.set(transport.sessionId, transport);
        await server.connect(transport);
        req.on("close", () => {
          transports.delete(transport.sessionId);
        });
        return;
      }

      if (req.url?.startsWith("/messages")) {
        const url = new URL(req.url, `http://localhost:${port}`);
        const sessionId = url.searchParams.get("sessionId");
        const transport = sessionId ? transports.get(sessionId) : undefined;
        if (!transport) {
          res.writeHead(404);
          res.end("Session not found");
          return;
        }
        await transport.handlePostMessage(req, res);
        return;
      }

      res.writeHead(404);
      res.end("Not found");
    } catch (err) {
      console.error("Error handling request:", err);
      if (!res.headersSent) {
        res.writeHead(500);
        res.end("Internal server error");
      }
    }
  });

  httpServer.listen(port, () => {
    console.log(`Maimemo MCP server listening on port ${port}`);
    console.log(`SSE endpoint: http://localhost:${port}/sse`);
  });
}
