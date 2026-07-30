# mcp-server-maimemo

A Model Context Protocol (MCP) server for the 墨墨背单词 (Maimemo) Open API. It exposes every documented API capability as an MCP tool, so AI assistants can query words, manage notes/interpretations/phrases, browse notepads, and read study data.

## Features

All official Maimemo Open API endpoints are covered:

- **Vocabulary**: `get_vocabulary`, `query_vocabularies`
- **Notes** (助记): `list_notes`, `create_note`, `update_note`, `delete_note`
- **Interpretations** (释义): `list_interpretations`, `create_interpretation`, `update_interpretation`, `delete_interpretation`
- **Phrases** (例句): `list_phrases`, `create_phrase`, `update_phrase`, `delete_phrase`
- **Notepads** (云词本): `list_notepads`, `get_notepad`, `create_notepad`, `update_notepad`, `delete_notepad`
- **Study data** (学习数据): `get_study_progress`, `get_today_items`, `query_study_records`, `add_words`, `advance_study`

## Requirements

- Node.js >= 18
- A Maimemo Open API token

## Get a token

Open the Maimemo app and go to:  
**我的 → 更多设置 → 实验功能 → 开放 API**  
Or visit `https://open.maimemo.com/open/api/v1/tokens/openapi`.

## Install & build

```bash
git clone https://github.com/Mrquj/mcp-server-maimemo.git
cd mcp-server-maimemo
npm install
npm run build
```

## Configure

Copy `.env.example` to `.env` and fill in your token:

```bash
cp .env.example .env
```

```env
MAIMEMO_API_TOKEN=your_token_here
MAIMEMO_MCP_TRANSPORT=sse
PORT=3000
```

## Run

### SSE mode (for Notion / remote MCP clients)

```bash
npm start
```

SSE endpoint: `http://localhost:3000/sse`

When connecting to Notion, use the SSE URL as the MCP server URL.

### stdio mode (for local MCP clients like Claude Desktop)

```bash
MAIMEMO_MCP_TRANSPORT=stdio npm start
```

## Usage in Notion

1. Deploy the server (e.g. on a VPS, Render, Railway, or fly.io) so it has a public HTTPS URL.
2. In Notion, add an MCP server connection with the HTTPS URL ending in `/sse`.
3. The server will authenticate with the `MAIMEMO_API_TOKEN` environment variable.

## Example tool calls

```json
{ "name": "get_vocabulary", "arguments": { "word": "apple" } }
{ "name": "create_note", "arguments": { "word": "apple", "note_type": "谐音", "note": "苹果的谐音" } }
{ "name": "add_words", "arguments": { "spellings": ["apple", "banana"], "advance": true } }
{ "name": "get_study_progress" }
```

## License

MIT
