# maimemo-mcp

An MCP (Model Context Protocol) server for the **墨墨背单词 (Maimemo) Open API**.
It exposes every documented API capability as a typed MCP tool, so AI assistants can
look up words, manage mnemonics / interpretations / example sentences, maintain cloud
notepads, and read or modify study plans.

[![CI](https://github.com/tutu-kitty/maimemo-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/tutu-kitty/maimemo-mcp/actions/workflows/ci.yml)

> **This is a fork of the upstream project
> [Mrquj/mcp-server-maimemo](https://github.com/Mrquj/mcp-server-maimemo) (MIT).**
> It is not the upstream release; it is a derivative work kept under the same MIT
> terms, with the original copyright notice preserved in [LICENSE](LICENSE).
> Adds a token-health tool, a test suite, and a few deployment fixes — see
> [Differences from upstream](#differences-from-upstream).

---

## Highlights

- **Complete API coverage** — 25 tools spanning all six documented resource groups,
  plus a diagnostic tool for the API token itself.
- **Streamable HTTP transport** — the current MCP spec, at `POST /mcp`. The deprecated
  HTTP+SSE transport is still served at `GET /sse` for older clients.
- **Per-request tokens** — clients may send `Authorization: Bearer <maimemo_token>`, so one
  deployment can safely serve multiple users. Each session gets an isolated API client.
- **Built-in rate limiting** — a multi-window sliding log shapes traffic to Maimemo's quotas
  (10s/20, 60s/40, 5h/2000 by default) instead of letting the model hit random 429s.
- **Retries, timeouts, and caching** — exponential backoff with jitter on transient failures,
  per-request timeouts, and a bounded `spelling → voc_id` cache that removes redundant lookups.
- **Schema-validated inputs** — tools are declared once as zod schemas and projected into
  JSON Schema, so advertised contracts and runtime validation cannot drift apart.
- **Actionable errors** — failures come back as typed, human-readable `isError` results
  (`auth`, `rate_limit`, `not_found`, `invalid_input`, …) so the model can self-correct.

---

## Tools

| Group | Tools |
| --- | --- |
| Vocabulary 单词 | `get_vocabulary`, `query_vocabularies` |
| Notes 助记 | `list_notes`, `create_note`, `update_note`, `delete_note` |
| Interpretations 释义 | `list_interpretations`, `create_interpretation`, `update_interpretation`, `delete_interpretation` |
| Phrases 例句 | `list_phrases`, `create_phrase`, `update_phrase`, `delete_phrase` |
| Notepads 云词本 | `list_notepads`, `get_notepad`, `create_notepad`, `update_notepad`, `delete_notepad` |
| Study 学习数据 | `get_study_progress`, `get_today_items`, `query_study_records`, `add_words`, `advance_study` |
| Diagnostics 诊断 | `get_token_status` |

Word-scoped tools accept either `word` (a spelling, resolved automatically and cached) or a
raw `voc_id`. Read-only tools are annotated with `readOnlyHint`, and delete tools with
`destructiveHint`, so clients can gate them appropriately.

---

## Getting a token

In the Maimemo app: **我的 → 更多设置 → 实验功能 → 开放 API**

---

## Quick start

```bash
git clone https://github.com/tutu-kitty/maimemo-mcp.git
cd maimemo-mcp
npm install
npm run build

cp .env.example .env   # then fill in MAIMEMO_API_TOKEN
npm start
```

Verify it is up:

```bash
curl http://localhost:3000/healthz
```

### Docker

```bash
docker build -t maimemo-mcp .
docker run -p 3000:3000 -e MAIMEMO_API_TOKEN=your_token maimemo-mcp
```

---

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `MAIMEMO_API_TOKEN` | — | Maimemo Open API token. Required for stdio; optional for http when clients send their own. |
| `MAIMEMO_REQUIRE_CLIENT_TOKEN` | `true` if no token is set | Force every client to send `Authorization: Bearer`. |
| `MAIMEMO_MCP_TRANSPORT` | `http` | `http` or `stdio`. |
| `PORT` / `HOST` | `3000` / `0.0.0.0` | HTTP listener. |
| `MAIMEMO_REQUEST_TIMEOUT_MS` | `20000` | Per-request timeout. |
| `MAIMEMO_MAX_RETRIES` | `3` | Retry attempts for transient failures. |
| `MAIMEMO_RATE_LIMITS` | `10s:20,60s:40,5h:2000` | Client-side throttling windows. |
| `MAIMEMO_API_BASE_URL` | `https://open.maimemo.com/open/` | Override the API base. |
| `MAIMEMO_TOKEN_STATE_DIR` | `$XDG_STATE_HOME/maimemo-mcp` | Where token-health bookkeeping is written. |
| `MAIMEMO_TOKEN_TTL_DAYS` | `7` | Assumed token lifetime, used to estimate expiry. |

Invalid configuration fails fast at startup with an explicit message.

---

## Connecting clients

### Remote clients (Notion, and other hosted MCP clients)

Deploy behind HTTPS, then register the MCP server URL:

```
https://your-domain.example.com/mcp
```

If you set `MAIMEMO_REQUIRE_CLIENT_TOKEN=true`, configure the connection's Bearer token to
your Maimemo API token. Otherwise the server falls back to `MAIMEMO_API_TOKEN`.

### Local clients (Claude Desktop, and similar)

```json
{
  "mcpServers": {
    "maimemo": {
      "command": "node",
      "args": ["/absolute/path/to/maimemo-mcp/dist/index.js"],
      "env": {
        "MAIMEMO_MCP_TRANSPORT": "stdio",
        "MAIMEMO_API_TOKEN": "your_token_here"
      }
    }
  }
}
```

### MCP Inspector

```bash
npm run inspect
```

---

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/mcp` | Streamable HTTP transport (initialize + requests). |
| `GET` | `/mcp` | Server-to-client notification stream for an existing session. |
| `DELETE` | `/mcp` | Terminate a session. |
| `GET` | `/sse` | Deprecated HTTP+SSE transport. |
| `POST` | `/messages` | Message sink for the deprecated SSE transport. |
| `GET` | `/healthz` | Liveness, version, session count, rate-limit usage. |

---

## Example calls

```json
{ "name": "get_vocabulary", "arguments": { "word": "apple" } }
{ "name": "create_note", "arguments": { "word": "apple", "note_type": "谐音", "note": "阿派" } }
{ "name": "add_words", "arguments": { "spellings": ["apple", "banana"], "advance": true } }
{ "name": "get_study_progress", "arguments": {} }
```

Notepad content uses Maimemo's markup:

```
#DESC
Words from this week's reading
#LIST
apple
banana
cherry
```

---

## Architecture

```
src/
  config.ts        Environment parsing and fail-fast validation
  errors.ts        Typed error hierarchy and HTTP status mapping
  rate-limiter.ts  Multi-window sliding-log throttle
  client.ts        Maimemo API client: retries, timeouts, voc_id cache
  token-status.ts  Token health: probe, fingerprint, expiry window
  tools.ts         zod schemas → JSON Schema + tool annotations
  handlers.ts      Validated dispatch to Maimemo endpoints
  server.ts        MCP server factory
  http.ts          Streamable HTTP + legacy SSE + health, graceful shutdown
  index.ts         Entry point and transport selection

test/
  config.test.mjs        Configuration parsing and version consistency
  token-status.test.mjs  Token health, expiry window, atomic state writes
```

---

## Token health

Maimemo issues Open API tokens with a documented 7-day lifetime and exposes **no
token-introspection endpoint** — `GET /tokens` returns 503 and the token page is an
interactive web login, so there is nothing to query programmatically.

`get_token_status` fills that gap:

```json
{ "name": "get_token_status", "arguments": { "probe": true } }
```

It probes a cheap authenticated endpoint and reports:

| Field | Meaning |
| --- | --- |
| `status` | `valid`, `expired_or_invalid`, or `unknown`. |
| `token_fingerprint` | First 16 hex digits of the token's SHA-256 — never the token. |
| `first_seen_valid_at` | When this token was first observed working. |
| `expires_at_earliest` / `expires_at_latest` | The window the expiry falls into. |
| `days_remaining_max` | Days left if the token expires at the latest possible moment. |
| `expires_soon` | True when even the latest-possible expiry is within two days. |

Two deliberate choices:

- **Expiry is reported as a window, not a date.** The token's issue time is never
  observable. If it was first seen working at `F` and lives for `TTL` days, the
  expiry lies in `[F, F + TTL]` — so that is what the tool returns, rather than a
  confident date that could be wrong by days.
- **Only an explicit auth failure counts as expired.** Network trouble is reported
  as `unknown`, so nobody is told to rotate a working token because the network
  blipped.

State is keyed by token fingerprint and written atomically, so rotating the token
starts a fresh baseline and a crash mid-write cannot corrupt the record.

---

## Differences from upstream

- **`get_token_status`** — the token-health tool described above.
- **Test suite** — `npm test` runs unit tests over config parsing and token health.
- **`loadConfig(env)`** now reads the environment object it is given instead of
  always reaching for `process.env`, which makes it testable.
- **Version consistency** — the advertised server version is checked against
  `package.json` in CI.
- **Deployment scripts** point at this fork's raw URLs.

---

## Credits and license

This project is a fork of **[Mrquj/mcp-server-maimemo](https://github.com/Mrquj/mcp-server-maimemo)**,
originally written by Mrquj and the upstream contributors. Upstream is MIT licensed, and this
fork stays under the same terms:

```
MIT License

Copyright (c) 2026 mcp-server-maimemo contributors
```

The full text is in [LICENSE](LICENSE), unchanged from upstream. The changes made in this
fork are listed under [Differences from upstream](#differences-from-upstream).

MIT
