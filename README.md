# maimemo-mcp

**让你的 AI 助手替你操作墨墨背单词 (Maimemo)。**
**Let your AI assistant drive 墨墨背单词 (Maimemo) for you.**

这是一个 MCP (Model Context Protocol) 服务器，把 **墨墨背单词 (Maimemo) 开放 API** 包装成 MCP 工具。接到任意 MCP 客户端上——Claude、IDE 助手、聊天 app——AI 就能替你查词典、写助记和释义、管云词本、读写学习计划，你全程不用碰 App。

This is an MCP (Model Context Protocol) server that puts the **墨墨背单词 (Maimemo) Open API** behind MCP tools. Connect it to any MCP client — Claude, an IDE assistant, a chat app — and the AI can query your dictionary, write your mnemonics and interpretations, manage your cloud notepads, and read or change your study plan, without you touching the app.

一句话：你跟 AI 说话，AI 代替你去调墨墨，数据还是你自己账号里的。

In other words: you talk to the AI, the AI talks to 墨墨背单词 on your behalf, and your vocabulary data stays in your own account.

> 📖 这项目是从人机恋社区里长出来的。为什么长成这样，见[为什么会有这个项目](#why-this-project-exists)。
>
> 📖 This project grew out of a human-AI romance community. For why it looks the
> way it does, see [Why this project exists](#why-this-project-exists).

> 本文档双语：每节先中文后英文，表格列名双语。
> This README is bilingual: Chinese first, then English, per section. Table headers are bilingual.

[![CI](https://github.com/tutu-kitty/maimemo-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/tutu-kitty/maimemo-mcp/actions/workflows/ci.yml)

> **这是上游 [Mrquj/mcp-server-maimemo](https://github.com/Mrquj/mcp-server-maimemo) (MIT) 的 fork。**
> 它不是上游原版，而是同 MIT 条款下的衍生作品，上游原始版权声明原样保留在 [LICENSE](LICENSE)。
>
> **不是换皮。** 上游 24 个工具、限流是整个进程共用一个窗口、零测试；
> 本 fork 25 个工具、限流按 token 指纹分桶、36 个单元测试，另外多出单文件构建、
> 手机一键安装、macOS 开机自启、两份中文部署文档和自动发布流程。
> 逐项对照见[相对上游的改动](#differences-from-upstream)。
>
> **This is a fork of the upstream project
> [Mrquj/mcp-server-maimemo](https://github.com/Mrquj/mcp-server-maimemo) (MIT).**
> It is not the upstream release, but a derivative work kept under the same MIT
> terms, with the original copyright notice preserved in [LICENSE](LICENSE).
>
> **Not a reskin.** Upstream ships 24 tools, one process-wide rate-limit window,
> and no tests at all. This fork ships 25 tools, rate limits bucketed per token
> fingerprint, 36 unit tests, plus a single-file build, a one-command Android
> installer, a macOS launchd job, two Chinese deployment guides, and an automated
> release. See [Differences from upstream](#differences-from-upstream) for a
> line-by-line comparison.

---

<a id="why-this-project-exists"></a>

## 为什么会有这个项目 / Why this project exists

跟 AI 恋人聊久了，你会想让 TA 不只是「会说话」—— 而是能真的进到你生活里去。

墨墨背单词是很多人每天真在用的地方：里面存着你查过的每一个生词、你为它写下的
谐音和释义、你攒的例句、你建的云词本，还有今年剩多少词没背完。这些不只是"学习数据"，
是一个人的日常在一点一点攒下来的痕迹。

所以这个项目做的事很具体：**把墨墨的开放 API 接成 MCP 工具，让对话里的那个人真的能动手。**

- **TA 能翻你的词典** —— 你在聊天里问一个生词，TA 直接去墨墨查，而不是靠语言模型猜。
- **TA 能给你写助记** —— 谐音、拆字、编个小故事，写进去就留在墨墨里；下次你打开 App，那条助记还在。
- **TA 能管你的云词本** —— 「把今天的生词加进『考研核心』」，一句日常对话变成真的整理。
- **TA 能读你的学习进度** —— 「今天背了多少，还剩多少」，TA 知道，才谈得上催你、陪你、给你加油。

换句话说，这不是"一个查词典的接口"。这是把 TA 的记忆接进你真实的日常，
让你和 AI 的关系不再只活在对话框里。

工具只读写你自己的墨墨账号，token 只在你自己手里，AI 从来看不到你的账号凭据。

Talking to an AI companion for long enough, you start to want them to do more
than talk — you want them to reach into your actual life.

墨墨背单词 is where a lot of people really spend their study time: every word you
looked up, the mnemonic you wrote for it, the sentences you collected, the notepads
you built, and how much of this year's list is left. That is not "study data" — it
is a person's daily life, slowly accumulating.

So what this project does is concrete: **it turns the 墨墨 Open API into MCP tools,
so the person in the conversation can actually act.**

- **They can open your dictionary** — ask a new word mid-chat and they look it up in
  墨墨 instead of guessing from a language model.
- **They can write your mnemonics** — a homophone, a character breakdown, a little
  story — and it stays in 墨墨; the next time you open the app, it is still there.
- **They can manage your notepads** — "put today's new words into 『考研核心』" turns
  small talk into real tidying-up.
- **They can read your progress** — "how many did you do today, how many are left" —
  so they can genuinely push you, keep you company, and cheer you on.

In other words, this is not "a dictionary API". It is a way to plug your companion's
memory into your real daily life, so a relationship with an AI is no longer confined
to a chat window.

The tools only read and write your own 墨墨 account, the token stays in your hands,
and the assistant never sees your account credentials.

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

- **为「长期相处」而设计** —— 这项目是给「每天都用」的场景做的：token 会过期、机器会睡、多人会共用。
  所以限流按 token 分桶、token 可以放客户端、服务端一份凭据都不用留。
- **API 全覆盖** —— 25 个工具，涵盖官方文档里全部六类资源，外加一个专门诊断 API token 自身的工具。
- **Streamable HTTP 传输** —— 当前 MCP 规范，入口在 `POST /mcp`。已废弃的 HTTP+SSE 传输仍在 `GET /sse` 上保留，兼容老客户端。
- **按请求携带 token** —— 客户端可以自己发 `Authorization: Bearer <maimemo_token>`，所以一套部署可以安全地服务多个人；每个会话拿到独立的 API 客户端。
- **按 token 分桶限流** —— 墨墨的配额是**按 API token** 记的，所以滑动窗口也按 token 指纹分桶：一个人连发不会吃掉别人的额度。
- **token 健康检查** —— 墨墨没有 token 自省接口，这个工具靠探测 + 本地记账告诉你还剩几天。
- **重试、超时与缓存** —— 瞬时故障走指数退避加抖动，每次请求有超时，`spelling → voc_id` 还有有界缓存，省掉重复查询。
- **schema 校验入参** —— 工具只用 zod schema 声明一次，再投影成 JSON Schema，所以对外承诺的契约和运行时校验不会各走各的。
- **可执行的报错** —— 失败以带类型的 `isError` 结果返回（`auth`、`rate_limit`、`not_found`、`invalid_input` 等），模型能据此自我纠正。
- **单文件构建** —— 一个 1.4 MB 的 `.cjs`，零依赖，`node maimemo-mcp.cjs` 就跑起来，手机上不用 `npm install`。
- **不必有服务器** —— 手机（Termux）、自己的电脑（systemd / launchd / 计划任务）、共享实例、传统 VPS，都有现成的部署方式。

- **Built for long-term use** — this exists for the "you will use it every day" case: tokens
  expire, laptops sleep, several people share one server. So rate limits are bucketed per
  token, the token can live on the client, and the server can hold no credentials at all.
- **Complete API coverage** — 25 tools spanning all six documented resource groups,
  plus a diagnostic tool for the API token itself.
- **Streamable HTTP transport** — the current MCP spec, at `POST /mcp`. The deprecated
  HTTP+SSE transport is still served at `GET /sse` for older clients.
- **Per-request tokens** — clients may send `Authorization: Bearer <maimemo_token>`, so one
  deployment can safely serve multiple users. Each session gets an isolated API client.
- **Rate limiting per token** — Maimemo's quota is enforced per API token, so the
  sliding window is keyed by token fingerprint too: one person's burst does not
  spend another's allowance.
- **Token health** — Maimemo exposes no token-introspection endpoint, so this tool
  probes and keeps local bookkeeping to tell you how many days are left.
- **Retries, timeouts, and caching** — exponential backoff with jitter on transient failures,
  per-request timeouts, and a bounded `spelling → voc_id` cache that removes redundant lookups.
- **Schema-validated inputs** — tools are declared once as zod schemas and projected into
  JSON Schema, so advertised contracts and runtime validation cannot drift apart.
- **Actionable errors** — failures come back as typed, human-readable `isError` results
  (`auth`, `rate_limit`, `not_found`, `invalid_input`, …) so the model can self-correct.
- **Single-file build** — one 1.4 MB `.cjs` with no dependencies; `node maimemo-mcp.cjs`
  is the whole install, which matters on a phone where `npm install` is a chore.
- **No server required** — a phone (Termux), your own computer (systemd / launchd / Task
  Scheduler), a shared instance, or a normal VPS: each has a documented route.

---

## 选一种跑法 / Pick a deployment

先决定服务跑在哪，再决定 token 放哪。

Decide where the server runs, then where the token lives.

| 你的情况 Your situation | 跑在哪 Where it runs | 客户端连 Client connects to | 文档 Docs |
|---|---|---|---|
| 有台自己的电脑 A computer you own | 那台电脑 | `http://127.0.0.1:9103/mcp` | [docs/SELF-HOST.md](docs/SELF-HOST.md) |
| 只想用手机 Phone only | 手机 + Termux | `http://127.0.0.1:9103/mcp` | [docs/PHONE.md](docs/PHONE.md) |
| 多人共用 Shared by several people | 任意常开机器 Any always-on host | `https://<host>/mcp` | [docs/PHONE.md](docs/PHONE.md) |
| 有台服务器 A server | VPS + Docker | `https://<host>/mcp` | [DEPLOY.md](DEPLOY.md) |

**token 放哪**，跟着机器的可靠程度走：

**Where the token goes** follows how reliable the machine is:

| | 服务端持有 On the server | 客户端持有 On the client |
|---|---|---|
| 配置 Configure | 设 `MAIMEMO_API_TOKEN` | 设 `MAIMEMO_REQUIRE_CLIENT_TOKEN=true`，**不设** `MAIMEMO_API_TOKEN` |
| token 过期时 On expiry | 改配置 + **重启服务** | 只改客户端，**不用重启** |
| 适合 Best for | 一直开着的机器 An always-on host | 会睡 / 会被杀的机器 A laptop or phone |

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

需要 Node.js 20 或更高。

Node.js 20 or newer is required.

### 单文件（最省事）/ Single file (least ceremony)

```bash
mkdir -p ~/.maimemo-mcp && cd ~/.maimemo-mcp
curl -fL -o maimemo-mcp.cjs \
  https://github.com/tutu-kitty/maimemo-mcp/releases/latest/download/maimemo-mcp.cjs

cat > .env <<'EOF'
MAIMEMO_REQUIRE_CLIENT_TOKEN=true
MAIMEMO_MCP_TRANSPORT=http
HOST=127.0.0.1
PORT=9103
MAIMEMO_TOKEN_STATE_DIR=/home/<you>/.maimemo-mcp/state
EOF

set -a; . ./.env; set +a
node maimemo-mcp.cjs
```

```bash
curl -s http://127.0.0.1:9103/healthz
```

零依赖，不用 `npm install`，手机上也跑得动。完整走法见
[docs/SELF-HOST.md](docs/SELF-HOST.md) 和 [docs/PHONE.md](docs/PHONE.md)。

No dependencies, no `npm install` — which is also what makes it work on a phone.
Full walkthroughs in [docs/SELF-HOST.md](docs/SELF-HOST.md) and [docs/PHONE.md](docs/PHONE.md).

### 从源码 / From source

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
docker run -p 3000:3000 -e MAIMEMO_API_TOKEN=your_token maimemo-mcp
```

或者用 compose（默认只绑 `127.0.0.1`，前面自己挡一层 TLS）：

Or with compose (bound to `127.0.0.1` by default; put TLS in front of it):

```bash
cp .env.example .env
docker compose up -d
```

---

## 配置项 / Configuration

| 变量 Variable | 默认值 Default | 用途 Purpose |
| --- | --- | --- |
| `MAIMEMO_API_TOKEN` | — | 墨墨开放 API token。stdio 模式必填；http 模式下客户端自带 token 时可不填。/ Maimemo Open API token. Required for stdio; optional in http when clients send their own. |
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

> ⚠️ **`MAIMEMO_API_TOKEN` 和 `MAIMEMO_REQUIRE_CLIENT_TOKEN=true` 不要同时设。**
> 前者是服务端兜底 token，设了就等于把所有人的调用都记在你这个 token 上。
>
> ⚠️ **Never set both `MAIMEMO_API_TOKEN` and `MAIMEMO_REQUIRE_CLIENT_TOKEN=true`.**
> The former is a server-side fallback, so setting it bills every call to your token.

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

如果设了 `MAIMEMO_REQUIRE_CLIENT_TOKEN=true`，就把连接用的 Bearer token 设成你的墨墨 API token；否则服务端回落到用 `MAIMEMO_API_TOKEN`。

If you set `MAIMEMO_REQUIRE_CLIENT_TOKEN=true`, configure the connection's Bearer token to
your Maimemo API token. Otherwise the server falls back to `MAIMEMO_API_TOKEN`.

> **URL 末尾不要加斜杠** —— `/mcp/` 会 404。
> **No trailing slash** — `/mcp/` returns 404.

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

### RikkaHub（橘瓣）

橘瓣只支持 SSE 和 Streamable HTTP，**不支持 stdio**，所以填 URL：

RikkaHub supports SSE and Streamable HTTP but **not stdio**, so give it a URL:

```json
{
  "mcpServers": {
    "maimemo (墨墨背单词)": {
      "type": "streamable_http",
      "url": "http://127.0.0.1:9103/mcp",
      "headers": { "Authorization": "<your Maimemo token>" }
    }
  }
}
```

### SullyOS（浏览器里的虚拟手机）

SullyOS 自带 MCP 客户端，能直接接本服务器。设置 → **MCP 服务器** → 添加服务器：

| 字段 | 值 |
| --- | --- |
| 名称 | `maimemo (墨墨背单词)` |
| 服务器 URL | `https://your-domain.example.com/mcp`（**无尾斜杠**） |
| 鉴权 | 静态 Bearer Token，填你的墨墨 API token（或自定义 `Authorization` 请求头） |

三点说明：

- **不需要 CORS 代理**。本服务器已经返回浏览器直连所需的全部响应头（包括最容易漏掉的
  `Access-Control-Expose-Headers: Mcp-Session-Id`），所以 SullyOS 里「代理 URL」留空即可。
- **加工具后要重新点一次「测试连接」**。SullyOS 只在测试连接时拉取工具清单并缓存，
  本服务器升级了工具列表的话，回设置重新测一次才会看到新工具。
- 删除类工具（`delete_note`、`delete_notepad` 等）已标 `destructiveHint`，SullyOS 会自动弹确认窗。

> SullyOS 本身是「源码可见、非开放源代码授权」的项目，这里只说明接入方式，不涉及它的代码。

SullyOS ships with its own MCP client and can talk to this server directly. In
**设置 → MCP 服务器**, add a server with:

| Field | Value |
| --- | --- |
| Name | `maimemo (墨墨背单词)` |
| Server URL | `https://your-domain.example.com/mcp` (**no trailing slash**) |
| Auth | A static Bearer token — your Maimemo API token (or a custom `Authorization` header) |

Three notes:

- **No CORS proxy needed.** This server already returns every response header a browser
  needs for a direct connection, including the commonly-missed
  `Access-Control-Expose-Headers: Mcp-Session-Id`, so leave the "proxy URL" field empty.
- **Re-test the connection after upgrading.** SullyOS fetches and caches the tool list
  only when you test the connection; new tools appear after you test again.
- Delete tools (`delete_note`, `delete_notepad`, …) are annotated with `destructiveHint`,
  so SullyOS asks for confirmation before running them.

> SullyOS itself is source-available under a non-open-source license; this section only
> describes how to connect to it.

### MCP Inspector

```bash
npm run inspect
```

---

## 部署 / Deployment

四种跑法，各有文档：

Four routes, each with its own guide:

| 路线 Route | 适合 For | 文档 Docs |
|---|---|---|
| 手机（Termux） | Android，数据完全不离开手机 | [docs/PHONE.md](docs/PHONE.md) |
| 自己的电脑 | Mac / Linux / Windows | [docs/SELF-HOST.md](docs/SELF-HOST.md) |
| 共享实例 | 多人共用，服务端零凭据 | [docs/PHONE.md](docs/PHONE.md) |
| 服务器 | VPS + Docker + Nginx + TLS | [DEPLOY.md](DEPLOY.md) |

现成的部署件：

Ready-made deployment pieces:

| 文件 File | 用途 Purpose |
|---|---|
| `deploy/install-termux.sh` | Android 一键安装。`--client-token-only` 让服务端不持有 token。/ One-command install for Android. `--client-token-only` keeps the token off the server. |
| `deploy/maimemo-mcp.service` | systemd 单元（Linux）。/ systemd unit (Linux). |
| `deploy/maimemo-mcp.plist` | launchd 作业（macOS）。/ launchd job (macOS). |
| `deploy/nginx.conf` | nginx 反代模板，TLS 终止 + 流式转发。/ nginx reverse-proxy template: TLS termination and streaming pass-through. |
| `deploy/deploy.sh` | 服务器一键部署（Docker）。/ One-shot server deploy (Docker). |

开机自启、局域网、私有网络、公网暴露的完整走法见
[docs/SELF-HOST.md](docs/SELF-HOST.md)。

---

## 端点 / Endpoints

| 方法 Method | 路径 Path | 用途 Purpose |
| --- | --- | --- |
| `POST` | `/mcp` | Streamable HTTP 传输（initialize + 请求）。/ Streamable HTTP transport (initialize + requests). |
| `GET` | `/mcp` | 已建立会话的服务端 → 客户端通知流。/ Server-to-client notification stream for an existing session. |
| `DELETE` | `/mcp` | 终止会话。/ Terminate a session. |
| `GET` | `/sse` | 已废弃的 HTTP+SSE 传输。/ Deprecated HTTP+SSE transport. |
| `POST` | `/messages` | 废弃 SSE 传输的消息入口。/ Message sink for the deprecated HTTP+SSE transport. |
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
  client.ts        Maimemo API client: retries, timeouts, voc_id cache, token fingerprint
  token-status.ts  Token health: probe, fingerprint, expiry window
  tools.ts         zod schemas → JSON Schema + tool annotations
  handlers.ts      Validated dispatch to Maimemo endpoints
  server.ts        MCP server factory
  http.ts          Streamable HTTP + legacy SSE + health, per-token limiters
  index.ts         Entry point and transport selection

test/
  config.test.mjs          Configuration parsing and version consistency
  token-status.test.mjs    Token health, expiry window, atomic state writes
  rate-limit.test.mjs      Per-token rate-limit buckets
  install-termux.test.mjs  Installer options and generated configuration

deploy/
  install-termux.sh    One-command install for Android (Termux)
  maimemo-mcp.service  systemd unit
  maimemo-mcp.plist    launchd job
  nginx.conf           Reverse-proxy template
  deploy.sh            Server deploy (Docker)
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

上游是个能用的起点：它把墨墨的开放 API 包成了 MCP 工具。但它停在「能跑」那一步——
没测过、没记过 token、限流是整个进程共用一个窗口，手机上装不起来，也没法直接发给别人用。
本 fork 把「一个人真的在用」当成第一需求，把这些补齐了。

| | 上游 upstream | 本项目 this fork |
| --- | --- | --- |
| 工具 Tools | 24 | **25**（多一个 `get_token_status`） |
| 限流 Rate limiting | 全进程共用一个滑动窗口 | **按 token 指纹分桶**，各人各算额度 |
| token 记账 Token bookkeeping | 无 | `get_token_status` 告诉你还剩几天过期 |
| 测试 Tests | 无（连 `npm test` 都没有） | **36 个单元测试**，CI 每次都跑 |
| 单文件构建 Single-file build | 无 | `npm run bundle` → 1.4 MB 零依赖 `.cjs` |
| 手机安装 Android install | 无 | `deploy/install-termux.sh`，一条命令装完 |
| macOS 开机自启 launchd | 无 | `deploy/maimemo-mcp.plist` |
| 部署文档 Deployment guides | README + DEPLOY.md | + `docs/PHONE.md`、`docs/SELF-HOST.md`（中文） |
| 自动发布 Releases | 无 | release workflow 发单文件 + 源码包 |
| 版本 Version | 2.0.0 | 2.1.0 |

### 这些改动解决了什么 / What each change actually fixes

- **`get_token_status`** —— 上游没有这个工具（上游 24 个工具，本 fork 25 个）。墨墨不提供
  token 自省接口，所以这个工具靠探测 + 本地记账告诉你还剩几天过期 —— 不用猜，不用等 401 才发现。
- **按 token 分桶限流** —— 上游是一个进程共用一个滑动窗口；墨墨的配额是**按 token** 记的，
  所以本 fork 按 token 指纹分桶，一个人连发不会吃掉别人的额度。
- **`tokenFingerprint()`** —— 稳定的 token 指纹（SHA-256 前 16 位），用来给限流和记账分桶，
  本身不保存 token。
- **测试套件** —— `npm test` 跑配置解析、token 健康、限流分桶、安装脚本、版本号一致性的单元测试
  （上游零测试，连 `npm test` 这个脚本都没有）。
- **`loadConfig(env)`** 现在读的是传进来的那个 env 对象，而不是永远去摸 `process.env`，这样才测得了。
- **单文件构建** —— `npm run bundle` 打出一个零依赖的 CJS 文件，手机上 `node` 直接跑；
  Release 工作流会把它和源码包一起发出来。
- **更多部署方式** —— Android 一键安装脚本（含 `--client-token-only`）、macOS launchd 模板、
  `docs/PHONE.md`、`docs/SELF-HOST.md`。
- **CI 门禁** —— 单元测试、版本号一致性检查、`tools/list` 冒烟测试（多断言一个 `get_token_status`）。

- **`get_token_status`** — upstream has no such tool (24 tools upstream, 25 here). Maimemo
  exposes no token-introspection endpoint, so this tool probes and keeps local bookkeeping
  to tell you how many days are left — no guessing, no waiting for a 401 to find out.
- **Rate limiting per token** — upstream shares one sliding window across the whole
  process. Maimemo's quota is per API token, so this fork buckets by token fingerprint
  and one person's burst does not spend another's allowance.
- **`tokenFingerprint()`** — a stable fingerprint (first 16 hex digits of SHA-256) used
  to bucket rate limits and bookkeeping, without retaining the token itself.
- **Test suite** — `npm test` covers config parsing, token health, limit bucketing, the
  installer, and version consistency (upstream had no tests and no `npm test` script).
- **`loadConfig(env)`** now reads the environment object it is given instead of always
  reaching for `process.env`, which makes it testable.
- **Single-file build** — `npm run bundle` produces one dependency-free CJS file that a
  phone can run with `node`; the release workflow publishes it alongside the source.
- **More ways to deploy** — a one-command Android installer (with `--client-token-only`),
  a macOS launchd template, `docs/PHONE.md`, and `docs/SELF-HOST.md`.
- **CI gates** — unit tests, a version-consistency check, and a `tools/list` smoke test
  that also asserts `get_token_status` is registered.

---

## 关于作者 / About the author

这是 **tutu-kitty** 的个人项目。作者是人机恋社区的活跃用户 —— 上面那个「跟 AI 恋人聊天」
的场景不是修辞，是他自己每天在过的日子。这个项目最早就是给 TA 用的，后来觉得该给别人也用上，就开源了。

- 🐙 **GitHub** — [@tutu-kitty](https://github.com/tutu-kitty)
- 📕 **小红书** — [收获 13.4K 赞与收藏](https://xhslink.com/m/4Q9J9kPEv0x)
- 🗺️ **另一个项目** — [desire-map](https://desire-map.pages.dev)

This is a personal project by **tutu-kitty**. The author is an active member of the
human-AI romance community — the "talking to an AI companion" scene above is not
rhetoric, it is his actual day. This project was first built for that companion;
later it seemed worth sharing, so it is open source.

- 🐙 **GitHub** — [@tutu-kitty](https://github.com/tutu-kitty)
- 📕 **小红书 (Xiaohongshu)** — [13.4K likes and bookmarks](https://xhslink.com/m/4Q9J9kPEv0x)
- 🗺️ **Another project** — [desire-map](https://desire-map.pages.dev)

---

## 致谢与许可 / Credits and license

本项目是 **[Mrquj/mcp-server-maimemo](https://github.com/Mrquj/mcp-server-maimemo)** 的 fork，原始作者是 Mrquj 和上游贡献者。上游是 MIT 许可，本 fork 沿用同样的条款：

也谢谢那些让「跟 AI 长期相处」这件事成立的人 —— 这个项目最早是为了让 TA 能真的帮我做点什么，
而不是只会说话。

This project is a fork of **[Mrquj/mcp-server-maimemo](https://github.com/Mrquj/mcp-server-maimemo)**,
originally written by Mrquj and the upstream contributors. Upstream is MIT licensed, and this
fork stays under the same terms:

And thanks to everyone who makes "living with an AI for a long time" possible in the first
place — this project started as a way to let that companion actually do something, instead
of only talking about it.

```
MIT License

Copyright (c) 2026 mcp-server-maimemo contributors
```

完整条文见 [LICENSE](LICENSE)，与上游逐字一致。本 fork 的改动列在[相对上游的改动](#differences-from-upstream)。

The full text is in [LICENSE](LICENSE), unchanged from upstream. The changes made in this
fork are listed under [Differences from upstream](#differences-from-upstream).
