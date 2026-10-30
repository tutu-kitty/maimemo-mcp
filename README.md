# maimemo-mcp

**让你的 AI 助手替你操作墨墨背单词 (Maimemo)。**
**Let your AI assistant drive 墨墨背单词 (Maimemo) for you.**

这是一个 MCP (Model Context Protocol) 服务器，把 **墨墨背单词 (Maimemo) 开放 API** 包装成 MCP 工具。接到任意 MCP 客户端上——Claude、IDE 助手、聊天 app——AI 就能替你查词典、写助记和释义、管云词本、读写学习计划，你全程不用碰 App。

This is an MCP (Model Context Protocol) server that puts the **墨墨背单词 (Maimemo) Open API** behind MCP tools. Connect it to any MCP client — Claude, an IDE assistant, a chat app — and the AI can query your dictionary, write your mnemonics and interpretations, manage your cloud notepads, and read or change your study plan, without you touching the app.

一句话：你跟 AI 说话，AI 代替你去调墨墨，数据还是你自己账号里的。

In other words: you talk to the AI, the AI talks to 墨墨背单词 on your behalf, and your vocabulary data stays in your own account.

> 本文档双语：每节先中文后英文，表格列名双语。
> This README is bilingual: Chinese first, then English, per section. Table headers are bilingual.

[![CI](https://github.com/tutu-kitty/maimemo-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/tutu-kitty/maimemo-mcp/actions/workflows/ci.yml)

> **这是上游 [Mrquj/mcp-server-maimemo](https://github.com/Mrquj/mcp-server-maimemo) (MIT) 的 fork。**
> 它不是上游原版，而是同 MIT 条款下的衍生作品，上游原始版权声明原样保留在 [LICENSE](LICENSE)。
> 相比上游多了 token 健康检查工具、测试套件和若干部署修复 —— 见[相对上游的改动](#differences-from-upstream)。
>
> **This is a fork of the upstream project
> [Mrquj/mcp-server-maimemo](https://github.com/Mrquj/mcp-server-maimemo) (MIT).**
> It is not the upstream release; it is a derivative work kept under the same MIT
> terms, with the original copyright notice preserved in [LICENSE](LICENSE).
> Adds a token-health tool, a test suite, and a few deployment fixes — see
> [Differences from upstream](#differences-from-upstream).

---

## 可以怎么问 AI / What you can ask your AI

接上之后，下面这种话直接问就行：

Once this server is connected, prompts like these work as-is:

- 「*apple* 在墨墨里是什么释义？」 → `get_vocabulary`
- 「帮我给这批词各编一个谐音」 → `create_note`
- 「把我今天的生词加进云词本『考研核心』」 → `add_words`, `update_notepad`
- 「今天背了多少个？还剩多少？」 → `get_study_progress`, `get_today_items`
- 「我的 token 还剩几天过期？」 → `get_token_status`

每次调用都走官方开放 API、用你自己的 token —— 助手看不到、也不会保存你的账号凭据。

Every call goes through the official Open API with your own token — the assistant
never sees or stores your account credentials.

---

## 亮点 / Highlights

- **API 全覆盖** —— 25 个工具，涵盖官方文档里全部六类资源，外加一个专门诊断 API token 自身的工具。
- **Streamable HTTP 传输** —— 当前 MCP 规范，入口在 `POST /mcp`。已废弃的 HTTP+SSE 传输仍在 `GET /sse` 上保留，兼容老客户端。
- **按请求携带 token** —— 客户端可以自己发 `Authorization: Bearer <maimemo_token>`，所以一套部署可以安全地服务多个人；每个会话拿到独立的 API 客户端。
- **内置限流** —— 多窗口滑动日志把流量整形成墨墨的配额形状（默认 10s/20、60s/40、5h/2000），而不是让模型随机撞 429。
- **重试、超时与缓存** —— 瞬时故障走指数退避加抖动，每次请求有超时，`spelling → voc_id` 还有有界缓存，省掉重复查询。
- **schema 校验入参** —— 工具只用 zod schema 声明一次，再投影成 JSON Schema，所以对外承诺的契约和运行时校验不会各走各的。
- **可执行的报错** —— 失败以带类型的 `isError` 结果返回（`auth`、`rate_limit`、`not_found`、`invalid_input` 等），模型能据此自我纠正。

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

## 工具 / Tools

| 分组 Group | 工具 Tools |
| --- | --- |
| 单词 Vocabulary | `get_vocabulary`, `query_vocabularies` |
| 助记 Notes | `list_notes`, `create_note`, `update_note`, `delete_note` |
| 释义 Interpretations | `list_interpretations`, `create_interpretation`, `update_interpretation`, `delete_interpretation` |
| 例句 Phrases | `list_phrases`, `create_phrase`, `update_phrase`, `delete_phrase` |
| 云词本 Notepads | `list_notepads`, `get_notepad`, `create_notepad`, `update_notepad`, `delete_notepad` |
| 学习数据 Study | `get_study_progress`, `get_today_items`, `query_study_records`, `add_words`, `advance_study` |
| 诊断 Diagnostics | `get_token_status` |

按词的工具两种入参都行：给 `word`（拼写，自动解析并缓存）或直接给 `voc_id`。只读工具标了 `readOnlyHint`，删除类工具标了 `destructiveHint`，客户端可以据此做权限把关。

Word-scoped tools accept either `word` (a spelling, resolved automatically and cached) or a
raw `voc_id`. Read-only tools are annotated with `readOnlyHint`, and delete tools with
`destructiveHint`, so clients can gate them appropriately.

---

## 获取 token / Getting a token

token 就是让 AI 动你墨墨账号的凭据 —— AI 拿着它调开放 API，读写的数据都是你的。

The token is what lets the AI act on your 墨墨背单词 account — the AI calls the Open API
with it, and the data it reads or writes is yours.

在墨墨 App 里：**我的 → 更多设置 → 实验功能 → 开放 API**

In the Maimemo app: **我的 → 更多设置 → 实验功能 → 开放 API**

---

## 快速开始 / Quick start

```bash
git clone https://github.com/tutu-kitty/maimemo-mcp.git
cd maimemo-mcp
npm install
npm run build

cp .env.example .env   # then fill in MAIMEMO_API_TOKEN
npm start
```

确认起来了：

Verify it is up:

```bash
curl http://localhost:3000/healthz
```

### Docker

```bash
docker build -t maimemo-mcp .
docker run -p 3000:3000 -e MAIMEMO_API_TOKEN=*** maimemo-mcp
```

---

## 配置项 / Configuration

| 变量 Variable | 默认值 Default | 用途 Purpose |
| --- | --- | --- |
| `MAIMEMO_API_TOKEN` | — | 墨墨开放 API token。stdio 模式必填；http 模式下客户端自带 token 时可不填。/ Maimemo Open API token. Required for stdio; optional for http when clients send their own. |
| `MAIMEMO_REQUIRE_CLIENT_TOKEN` | 没设 token 时为 `true` / `true` if no token is set | 强制每个客户端都自己带 `Authorization: Bearer`。/ Force every client to send `Authorization: Bearer`. |
| `MAIMEMO_MCP_TRANSPORT` | `http` | `http` 或 `stdio`。/ `http` or `stdio`. |
| `PORT` / `HOST` | `3000` / `0.0.0.0` | HTTP 监听地址。/ HTTP listener. |
| `MAIMEMO_REQUEST_TIMEOUT_MS` | `20000` | 单次请求超时（毫秒）。/ Per-request timeout. |
| `MAIMEMO_MAX_RETRIES` | `3` | 瞬时故障重试次数。/ Retry attempts for transient failures. |
| `MAIMEMO_RATE_LIMITS` | `10s:20,60s:40,5h:2000` | 客户端侧限流窗口。/ Client-side throttling windows. |
| `MAIMEMO_API_BASE_URL` | `https://open.maimemo.com/open/` | 覆盖 API 地址。/ Override the API base. |
| `MAIMEMO_TOKEN_STATE_DIR` | `$XDG_STATE_HOME/maimemo-mcp` | token 健康记账写在哪儿。/ Where token-health bookkeeping is written. |
| `MAIMEMO_TOKEN_TTL_DAYS` | `7` | 假设的 token 有效期，用于估算过期时间。/ Assumed token lifetime, used to estimate expiry. |

配置不合法会在启动时直接失败，并给出明确报错。

Invalid configuration fails fast at startup with an explicit message.

---

## 接入客户端 / Connecting clients

任意 MCP 客户端都行。链路是 client → 本服务器 → 墨墨，AI 不直接碰 API。

Any MCP client works. The client talks to this server; the server talks to 墨墨背单词;
the assistant never talks to the API directly.

### 远程客户端（Notion 等托管型 MCP 客户端）/ Remote clients (Notion, and other hosted MCP clients)

部署到 HTTPS 之后，把 MCP 服务器地址填进客户端：

Deploy behind HTTPS, then register the MCP server URL:

```
https://your-domain.example.com/mcp
```

如果设了 `MAIMEMO_REQUIRE_CLIENT_TOKEN=***`，就把连接用的 Bearer token 设成你的墨墨 API token；否则服务端回落到用 `MAIMEMO_API_TOKEN`。

If you set `MAIMEMO_REQUIRE_CLIENT_TOKEN=*** configure the connection's Bearer token to
your Maimemo API token. Otherwise the server falls back to `MAIMEMO_API_TOKEN`.

### 本地客户端（Claude Desktop 等）/ Local clients (Claude Desktop, and similar)

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

## 端点 / Endpoints

| 方法 Method | 路径 Path | 用途 Purpose |
| --- | --- | --- |
| `POST` | `/mcp` | Streamable HTTP 传输（initialize + 请求）。/ Streamable HTTP transport (initialize + requests). |
| `GET` | `/mcp` | 已建立会话的服务端 → 客户端通知流。/ Server-to-client notification stream for an existing session. |
| `DELETE` | `/mcp` | 终止会话。/ Terminate a session. |
| `GET` | `/sse` | 已废弃的 HTTP+SSE 传输。/ Deprecated HTTP+SSE transport. |
| `POST` | `/messages` | 废弃 SSE 传输的消息入口。/ Message sink for the deprecated SSE transport. |
| `GET` | `/healthz` | 存活检查、版本、会话数、限流用量。/ Liveness, version, session count, rate-limit usage. |

---

## 调用示例 / Example calls

```json
{ "name": "get_vocabulary", "arguments": { "word": "apple" } }
{ "name": "create_note", "arguments": { "word": "apple", "note_type": "谐音", "note": "阿派" } }
{ "name": "add_words", "arguments": { "spellings": ["apple", "banana"], "advance": true } }
{ "name": "get_study_progress", "arguments": {} }
```

云词本内容用墨墨的标记语法：

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

## 代码结构 / Architecture

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

## token 健康检查 / Token health

墨墨的开放 API token 官方标称 7 天有效，但**没有任何 token 自省接口** —— `GET /tokens` 返回 503，token 页面是个网页登录，程序里查不到。

Maimemo issues Open API tokens with a documented 7-day lifetime and exposes **no
token-introspection endpoint** — `GET /tokens` returns 503 and the token page is an
interactive web login, so there is nothing to query programmatically.

`get_token_status` 补的就是这个洞：

`get_token_status` fills that gap:

```json
{ "name": "get_token_status", "arguments": { "probe": true } }
```

它探一个便宜的鉴权接口，然后报告：

It probes a cheap authenticated endpoint and reports:

| 字段 Field | 含义 Meaning |
| --- | --- |
| `status` | `valid`、`expired_or_invalid` 或 `unknown`。/ `valid`, `expired_or_invalid`, or `unknown`. |
| `token_fingerprint` | token 的 SHA-256 前 16 位十六进制 —— 不是 token 本身。/ First 16 hex digits of the token's SHA-256 — never the token. |
| `first_seen_valid_at` | 第一次确认这个 token 可用的时间。/ When this token was first observed working. |
| `expires_at_earliest` / `expires_at_latest` | 过期时间落在哪个区间。/ The window the expiry falls into. |
| `days_remaining_max` | 按最晚可能过期算，还剩几天。/ Days left if the token expires at the latest possible moment. |
| `expires_soon` | 即使按最晚过期算也只剩两天以内时为真。/ True when even the latest-possible expiry is within two days. |

两个刻意的选择：

Two deliberate choices:

- **过期报区间，不报具体某天。** token 的签发时刻根本观察不到。如果它在 `F` 时刻第一次可用、有效期 `TTL` 天，那过期必然落在 `[F, F + TTL]` —— 所以工具报这个区间，而不是一个可能差好几天的自信日期。
- **只有明确的鉴权失败才算过期。** 网络抽风报成 `unknown`，免得网络抖一下就让人去换一个其实还能用的 token。

- **Expiry is reported as a window, not a date.** The token's issue time is never
  observable. If it was first seen working at `F` and lives for `TTL` days, the
  expiry lies in `[F, F + TTL]` — so that is what the tool returns, rather than a
  confident date that could be wrong by days.
- **Only an explicit auth failure counts as expired.** Network trouble is reported
  as `unknown`, so nobody is told to rotate a working token because the network
  blipped.

记账按 token 指纹分桶、原子写入，所以换 token 就是换一条新基线，写到一半崩了也不会损坏记录。

State is keyed by token fingerprint and written atomically, so rotating the token
starts a fresh baseline and a crash mid-write cannot corrupt the record.

---

<a id="differences-from-upstream"></a>

## 相对上游的改动 / Differences from upstream

- **`get_token_status`** —— 上面那个 token 健康检查工具。
- **测试套件** —— `npm test` 跑配置解析和 token 健康检查的单元测试。
- **`loadConfig(env)`** 现在读的是传进来的那个 env 对象，而不是永远去摸 `process.env`，这样才测得了。
- **版本号一致性** —— CI 会检查对外声明的版本跟 `package.json` 是否一致。
- **部署脚本** 指向本 fork 的 raw URL。

- **`get_token_status`** — the token-health tool described above.
- **Test suite** — `npm test` runs unit tests over config parsing and token health.
- **`loadConfig(env)`** now reads the environment object it is given instead of
  always reaching for `process.env`, which makes it testable.
- **Version consistency** — the advertised server version is checked against
  `package.json` in CI.
- **Deployment scripts** point at this fork's raw URLs.

---

## 致谢与许可 / Credits and license

本项目是 **[Mrquj/mcp-server-maimemo](https://github.com/Mrquj/mcp-server-maimemo)** 的 fork，原始作者是 Mrquj 和上游贡献者。上游是 MIT 许可，本 fork 沿用同样的条款：

This project is a fork of **[Mrquj/mcp-server-maimemo](https://github.com/Mrquj/mcp-server-maimemo)**,
originally written by Mrquj and the upstream contributors. Upstream is MIT licensed, and this
fork stays under the same terms:

```
MIT License

Copyright (c) 2026 mcp-server-maimemo contributors
```

完整条文见 [LICENSE](LICENSE)，与上游逐字一致。本 fork 的改动列在[相对上游的改动](#differences-from-upstream)。

The full text is in [LICENSE](LICENSE), unchanged from upstream. The changes made in this
fork are listed under [Differences from upstream](#differences-from-upstream).
