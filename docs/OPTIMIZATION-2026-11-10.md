# maimemo-mcp 优化清单（2026-11-10）

审查对象：`<repo-dir>`（分支 `main`，HEAD `b828b9f`）
审查方式：通读 `src/` 全部 10 个文件 + `test/` 4 个测试文件，对照官方 OpenAPI spec
（`https://open.maimemo.com/api_bundle.yaml`）、线上部署目录 `<deploy-dir>/`、
systemd unit `<systemd-unit>`、环境文件 `<config-file>`、
反代 `<reverse-proxy>/proxy.py` 与线上日志。**未修改任何代码。**
本机实测：`npm test` 36 个用例全绿。

> **基线说明**：本清单的所有行号基于 commit `b828b9f`（审查开始时的工作树是干净的）。
> 审查期间（2026-11-10 10:00 起）有**另一个执行者**在同一仓库并发修改了
> `src/client.ts`、`src/http.ts`、`src/server.ts`、`src/token-status.ts` 并新建了 `src/logger.ts`
> （内容涉及 session TTL/清扫、token 来源区分、日志模块），**这些改动不是本次审查所作，
> 也没有被本次审查评估**。对照本清单时请以 `b828b9f` 为准，落地前重新对一下行号。
>
> 另注：10:02-10:03 那个执行者**已经把改动 build 并同步到部署目录
> `<deploy-dir>/`，且重启了线上服务**（`ExecMainStartTimestamp` = 10:03:01，
> 重启后 `sessions` 归 0）。也就是说线上跑的不再是 `b828b9f` 的代码。
> 本次审查**没有**碰部署目录、**没有**重启任何服务。

---

## 结论

这套服务的**内核是扎实的**——zod schema 单源投影 JSON Schema、类型化错误、按 token 指纹分桶的
滑动窗口、原子写 token 记账、36 个单元测试 + CI 冒烟，墨墨背单词组的 24 个 API 操作**一个不漏**
全部覆盖。真正的短板不在工具层，而在**「零凭据模式」这个 2026-11-01 才换的新前提，把
「会话 / token / 错误文案 / 日志」这四件事留在了旧世界**：

1. **会话把 token 焊死了**：token 在 initialize 时被捕获进 session，之后请求头里换新 token
   服务端不认——墨墨 token 7 天一过期，这是**每 7 天必然复发**、且用户按提示做也没用的故障；
2. **会话永不回收**：线上 `sessions: 74`，9 天不降（客户端不发 DELETE），内存随会话数线性涨；
3. **错误文案在教用户改一个线上根本不存在的变量**（`MAIMEMO_API_TOKEN` 长度是 0，零凭据模式下
   token 在手机上）；LLM 会照着告诉 the user 去改服务器 env；
4. **日志基本是空白**（59 行全是启动横幅），加上 `LOG_LEVEL` 是死配置，出了事只能猜；
5. **墨墨的结构化错误码被整个丢掉**（`common_unauthorized` / `common_not_found` 这些官方码没用上），
   LLM 拿到的是一坨裸 JSON；
6. **工具输出零体积上限**，一次 1000 词查询会往模型上下文里灌 ~30 万字节。

所以下一步**不是加工具**，而是把「会话 ↔ token ↔ 错误文案 ↔ 日志」这条链补齐，
顺带把 schema 里对 LLM 不可见的约束显式化、把输出体积管起来。

---

## P0 必修

### P0-1 会话永不回收 → 状态与内存单调增长

- **位置**：`src/http.ts:40`（`const sessions = new Map<string, Session>()`）、
  `src/http.ts:161-164`（`transport.onclose` 是唯一的清理点）
- **现状**：session 只在客户端发 `DELETE /mcp`（`src/http.ts:135-138`）或进程退出时被删。
  线上实测：`/healthz` 报 `sessions: 74`，连续 3 次采样（间隔 3s）不降；进程已跑 9 天，
  RSS 83MB。the mobile client 不发 DELETE，所以这 74 个 session 一个都没回收过。
  每个 session 持有 `Server` + `StreamableHTTPServerTransport` + 一个 `MaimemoClient`，
  而 `MaimemoClient` 里还有一个上限 5000 条的 `vocIdCache`（`src/client.ts:57`）——
  session 数 × 缓存 = 内存线性涨。
- **建议**：
  1. 改用 SDK 提供的 `onsessionclosed` 选项（`webStandardStreamableHttp.js:77` 支持），
     不要只靠 `transport.onclose`；
  2. 加 session TTL：每条 session 记录 `lastSeenAt`，超过 N 分钟（建议 30 分钟）无请求就
     `server.close()` + 从 Map 删除；
  3. 加 `MAX_SESSIONS` 上限（建议 100），超了按 LRU 踢；
  4. `/healthz` 分开报 `sessions` / `sseSessions` / `sessionsIdle`（可回收数）。
- **工作量**：M　**破坏性风险**：低（回收后客户端需重连；MCP 客户端本来就带 session-id 重连）

### P0-2 会话把 token 焊死 → 客户端换了新 token 也不生效

- **位置**：`src/http.ts:43-49`（`buildClient(token)` 在 initialize 时捕获 token）、
  `src/http.ts:133-135`（命中已有 session 就直接复用，**请求头的 Authorization 被完全忽略**）
- **现状**（本机实测）：用 `Authorization: Bearer TOKEN-A` initialize 建会话后，
  后续所有请求即使把头换成 `TOKEN-B`，服务端仍然用 `TOKEN-A`——调 `get_token_status`
  返回的 `token_fingerprint` 依旧是 `TOKEN-A` 的 `6424914d66e29f1c`，不是 `TOKEN-B` 的
  `2489f73a3f883739`。代码注释 `src/http.ts:23-25` 写的是"Each request may carry its own
  Maimemo token"，**与实际行为不符**。
- **后果**：墨墨 token 约 7 天过期 → 用户在 the mobile client 里换了新 token，但只要 MCP 会话没重建，
  服务端还在拿旧 token 打墨墨 → **永远 401**，且没有任何提示说"要重建会话"。
  这是每 7 天必然复现的故障，而且用户按现有提示操作无效。
- **建议**：
  1. 把 `MaimemoClient` 的 token 改成可更新（`setToken()`），或在 `handleMcp` 里比较
     请求头 token 的指纹与会话绑定 token 的指纹，不同就更新；
  2. 指纹不同且旧 token 刚报过 401 时，返回一条**专门指向会话陈旧**的错误：
     "会话里的 token 已过期，客户端换了新 token 但会话没重建——请重新连接 MCP 服务"；
  3. 顺带修 `src/http.ts:23-25` 的注释。
- **工作量**：M　**破坏性风险**：中（改的是会话语义，但只在 token 变化的场景生效）

### P0-3 401/403 与 token 失效的文案，教用户去改一个不存在的变量

- **位置**：`src/errors.ts:48-53`（auth 分支）、
  `src/token-status.ts:199-204`（`remedy` 字符串）
- **现状**：线上 `<config-file>` 里 `MAIMEMO_API_TOKEN=` **长度为 0**，
  `MAIMEMO_REQUIRE_CLIENT_TOKEN=true`——零凭据模式是成立的。但：
  - auth 错误说 *"Check MAIMEMO_API_TOKEN, or the Bearer token sent by the MCP client."*
  - `get_token_status` 的 remedy 说 *"…then update MAIMEMO_API_TOKEN in the server
    environment and restart the server."*
  线上**根本没有这个变量**（改 env 也不会生效，因为它被 `requireClientToken` 完全屏蔽）。
  LLM 拿到这段文案会原样转告 the user「去服务器上改 MAIMEMO_API_TOKEN 并重启」——**这条建议是错的**。
- **建议**：错误文案按运行模式分支（`config.requireClientToken` 已经是现成的判据）：
  - 零凭据模式：`[auth] 墨墨拒绝了客户端带来的 token（common_unauthorized）。请在墨墨 App
    重新生成开放 API token → 更新 MCP 客户端配置里的 Authorization 头 → 重建 MCP 会话（重连或
    重新添加服务）。`
  - 服务端持 token 模式：保留现在的 `MAIMEMO_API_TOKEN` 说法。
  同时在 `remedy` 里补上**「重建会话」**这一步（配合 P0-2）。
- **工作量**：S　**破坏性风险**：无（纯文案）

### P0-4 墨墨的结构化错误码被整个丢掉，LLM 无法自我纠正

- **位置**：`src/errors.ts:41-79`（`errorFromStatus`）、`src/client.ts:144-149`
- **现状**：墨墨的错误体是有结构的（实测）：
  ```json
  {"errors":[{"code":"common_unauthorized","msg":"Authorization failed","info":""}],"success":false}
  ```
  404 时是 `common_not_found` / "Resource or Api not found"。
  现在代码只是把整个 body 当字符串截断 500 字符塞进 `message`，把解析结果塞进 `details`。
  LLM 实际看到的是（实测输出）：
  ```
  [auth] Maimemo rejected the API token (401/403). Check MAIMEMO_API_TOKEN, ...
  Details: { "errors": [ { "code": "common_unauthorized", "msg": "Authorization failed", "info": "" } ], "success": false }
  ```
  有用的信息（`common_unauthorized`）被埋在 Details 里，还混着无效的 `MAIMEMO_API_TOKEN` 建议。
- **建议**：
  1. 抽 `parseMaimemoErrors(text): {code, msg, info}[]`，从 body 里取 `errors[0]`；
  2. 消息格式改成 `[<code分类>] <官方code>: <官方msg> —— <给人/LLM 的下一步建议>`；
  3. 建一张 `官方code → 建议动作` 映射表（`common_unauthorized` → 换 token；
     `common_not_found` → 检查 id/拼写；参数类 → 改参数）；
  4. 顺带在 `src/client.ts:158-163` 区分「HTTP 200 但 body 带 errors」和「HTTP 4xx」两条路径。
- **工作量**：S-M　**破坏性风险**：无（只是消息变好看，且不破坏 MCP 结构）

### P0-5 schema 里「至少给一个」这类约束对 LLM 完全不可见

- **位置**：`src/tools.ts:20-24`（`requireWordRef`）、`src/tools.ts:166-182`
  三个 `.refine()`（`query_vocabularies` / `add_words` / `advance_study`）
- **现状**：zod 的 `.refine()` 在 `zodToJsonSchema`（`src/tools.ts:232-236`）里会被丢掉
  （effectStrategy 默认取 input），所以**运行时校验有、schema 里没有**。实测 `tools/list` 返回：
  - `list_notes` / `list_interpretations` / `list_phrases`：`required` **缺失**
    → LLM 不知道必须给 `word` 或 `voc_id`；
  - `query_vocabularies` / `add_words` / `advance_study`：`required` **缺失**
    → LLM 不知道至少要给一个。
  这 6 个工具只能靠"撞错 → 读错误文本 → 再试"来收敛，多烧一轮往返。
- **建议**：在 `toJsonSchema()`（`src/tools.ts:232`）里对这几个 schema 手工补
  `anyOf: [{required:["word"]},{required:["voc_id"]}]` /
  `anyOf: [{required:["spellings"]},{required:["ids"]}]`；
  （或改用 `zod-to-json-schema` 的 `pipe`/`override` 策略）。运行时 refine 保留，两边一致。
- **工作量**：S　**破坏性风险**：低（只会让 LLM 少撞错）

### P0-6 工具输出零体积上限，一次查询能灌 ~30 万字节进模型上下文

- **位置**：`src/server.ts:31-32`
- **现状**（实测，模拟 1000 条词汇的真实结构）：
  ```
  compact JSON      103,789 B
  content.text      194,797 B   ← JSON.stringify(result, null, 2) 的 pretty 打印，+88%
  structuredContent 103,789 B   ← 同一份 payload 又发一遍
  合计             298,586 B   ≈ 7.5 万 token，一次调用
  ```
  触发路径：`query_vocabularies`（最多 1000 个）、`get_today_items`（limit 最大 1000）、
  `query_study_records`（limit 最大 1000）、`list_notepads`（每个云词本还带整份词表）。
  手机端 the mobile client 基本必炸，上下文超限后 LLM 这一轮直接失败。
- **建议**：
  1. `content.text` 改用 compact JSON（去掉 `null, 2`），单这一项省 40%；
  2. 加输出预算：序列化后超过阈值（建议 64KB）就截断，并返回一条明确的
     `[invalid_input] 结果过大（xxx KB），请缩小范围：用 limit 分页 / 只取需要的字段`，
     同时保留被截断项的 id 列表方便续查；
  3. `structuredContent` 只在声明了 `outputSchema` 时才带（见 P1-8），或仅在结果小于阈值时带。
- **工作量**：M　**破坏性风险**：中（会改变返回结构，需要先确认 the mobile client 侧能接受截断结果）

---

## P1 该做

### P1-1 429 被当成可重试错误 → 白烧配额 + 误导文案

- **位置**：`src/errors.ts:61-65`（429 标 `retryable: true`）、
  `src/client.ts:36`（`RETRYABLE_STATUS` 含 429）、`src/client.ts:100-110`
- **现状**：墨墨 429 通常意味着某个配额窗口（多半是 5h/2000）见底，客户端却在
  500ms/1s/2s 内重试 3 次——这 3 次必然再 429，纯粹浪费配额和延迟（每次工具调用最多多耗 3.5s+）。
  文案还写着 *"The client throttles automatically; retry shortly"*——但客户端限流窗口**早就用完了**，
  它并没有在"自动节流"。另外 `Retry-After` 响应头从头到尾没人读（`src/client.ts:144` 只取了 `text`）。
- **建议**：429 不重试（或只重试 1 次且尊重 `Retry-After`）；读 `Retry-After` 并写进错误消息；
  文案改成"墨墨配额已耗尽（10s/20、60s/40、5h/2000），请 N 秒/分钟后再试"。
- **工作量**：S　**破坏性风险**：无

### P1-2 客户端限流贴着官方上限跑 → 边界上必然偶发 429

- **位置**：`src/rate-limiter.ts:17-21`（`DEFAULT_RATE_LIMITS`）、
  `src/config.ts:81-83`、`<config-file>` 的 `MAIMEMO_RATE_LIMITS=10s:20,60s:40,5h:2000`
- **现状**：这三个数字**就是**官方 spec 里的原值（`api_bundle.yaml` 说明段：
  10 秒 20 次 / 60 秒 40 次 / 5 小时 2000 次）。本地滑动窗口用同样的数 → 客户端会精确摸到
  官方上限，而官方的计数口径（是否含重试、滑动还是固定窗口）未知 → 边界必吃 429。
- **建议**：客户端窗口按官方的 ~80% 设（`16/32/1600`）留余量；或者保持数字但加"命中 429 后
  该 token 进入冷却期"。**这一项要改线上 env，属于行为变更，需要用户点头。**
- **工作量**：S　**破坏性风险**：低（只是变慢一点）

### P1-3 官方「每天最多新建 600 条内容」的限制完全没建模

- **位置**：官方 spec `api_bundle.yaml` 说明段："为了避免滥用和保证服务质量，每天最多创建 600 条
  内容（例句、助记、释义合并在内）"；对应代码 `src/handlers.ts` 的 `create_note` /
  `create_interpretation` / `create_phrase`，以及 `src/tools.ts:190-227` 里这三个工具的描述
- **现状**：代码里没有任何"创建类操作"的当日计数或提示，工具描述里也没提这个上限。
  LLM 批量写释义时会莫名其妙开始 4xx，而错误文本按 P0-4 修好之前只是一坨裸 JSON，
  模型无从判断"是我参数错了还是今天写太多了"。
- **建议**：
  1. 三个 create 工具的 description 里写明"墨墨限制每天最多新建 600 条内容（助记/释义/例句合计）"；
  2. 服务端按 token 指纹记当日创建量（跟 `token-status.ts` 同一套 state 文件即可），
     接近上限时提前返回可读提示；
  3. 至少把官方频控说明链接放进错误 `remedy`。
- **工作量**：M　**破坏性风险**：无

### P1-4 记忆卡（Markji）整组没接，README 的"完整覆盖"说过头了

- **现状**：官方 spec 共 27 条路径 / 38 个操作，分 7 组：
  - **墨墨背单词组 15 路径 / 24 操作 → 本服务 24 个工具，1:1 全覆盖，无缺口**（见"核实过没问题的部分"）
  - **记忆卡组（`/api/v1/markji/*`）12 路径 / 14 操作 → 一个都没有**
    （decks、folders、chapters、cards、files、文件查询）。
  上游 README 宣称 *"Complete API coverage — 24 tools spanning all six documented resource groups"*，
  相对**现在的**官方 spec 是不准确的（本 fork 的 README 也照抄了这句）。
- **建议**：两条路——(a) 补齐记忆卡组（新增约 8-10 个工具，工作量 L）；(b) 把 README/上游对比表里的
  "完整覆盖"改成"完整覆盖墨墨背单词组；记忆卡组暂未支持"。**(b) 成本极低，先做 (b)。**
- **工作量**：S（改文档）/ L（补工具）　**破坏性风险**：无

### P1-5 日志基本是空白，`LOG_LEVEL` 是死配置

- **位置**：`<log-dir>/maimemo-mcp.log`（59 行，全是启动横幅）、
  `src/config.ts:84`（`logLevel` 解析了但**全代码无人读取** —— 线上 `LOG_LEVEL=info` 完全是摆设）
- **现状**：没有请求日志、没有工具调用日志、没有错误日志。出 401/429 时，除了 systemd 重启横幅
  什么都查不到；`/healthz` 里 `rateLimit` 的 `used` 还被硬编码成 0（见 P1-6）。
- **建议**：加一行一事件的结构化日志：
  `ts level msg="tool_call" tool=list_notes token_fp=6424914d6 status=ok dur_ms=812`
  **脱敏清单（必须）**：Authorization 头、token 明文、`?token=`、请求体原文、墨墨返回里的用户数据
  （笔记/例句正文）一律不记；token 只记指纹前 8 位。同时让 `logLevel` 真的生效。
- **工作量**：S-M　**破坏性风险**：无（注意日志量，别把响应体写进去）

### P1-6 `/healthz` 的限流用量是假的（fork 引入的回归）

- **位置**：`src/http.ts:67`（`rateLimit: config.rateLimits.map((w) => ({ ...w, used: 0 }))`）
- **现状**：上游是 `limiter.snapshot()`（真数据）；本 fork 为了支持多 token 桶，改成了硬编码 0。
  线上 `/healthz` 一直在报 `used: 0`，**即使配额已经见底**。而 README:472 还写着
  "/healthz | 存活检查、版本、会话数、**限流用量**"。
- **建议**：改成聚合值（所有桶的 used 求和 / 最大值），或改成
  `rateLimit: { windows: [...], tokens: [{fp: "6424914d6", used: [...]}] }`（只暴露指纹，不暴露 token）。
  顺带修 README。
- **工作量**：S　**破坏性风险**：无

### P1-7 限流等待不可取消，能把一个 HTTP 请求挂几十分钟

- **位置**：`src/rate-limiter.ts:35-67`（`acquire`/`reserve`）、`src/client.ts:85`
- **现状**：
  - `acquire(options.signal)` 只在 handler 传了 signal 时才可能中止，而
    `src/handlers.ts` 里**所有 handler 都没传 signal** → 等待不可中断；
  - `reserve` 每 5 秒轮询一次（`src/rate-limiter.ts:65`），5h 窗口见底时会傻等几十分钟，
    而客户端早超时了，服务端还占着连接和配额；
  - `src/rate-limiter.ts:47` 抛的是**普通 `Error`**，会被 `src/client.ts:96-98` 当成
    `network` 错误并**继续重试**——对着一个已取消的请求继续打墨墨。
- **建议**：
  1. handlers 把请求级 `AbortSignal` 传到底层；
  2. `reserve` 先算出预计等待时间，超过 `MAIMEMO_REQUEST_TIMEOUT_MS` 就直接抛
     `MaimemoError(code="rate_limit", retryable=false, "配额已用尽，请 N 分钟后重试")`，不要傻等；
  3. abort 时抛 `MaimemoError` 而不是普通 `Error`，避免被当成网络错误重试。
- **工作量**：M　**破坏性风险**：低

### P1-8 响应体类型是"谎言"，工具没有 outputSchema

- **位置**：`src/client.ts:171`（`return (json.data as T) ?? (json as unknown as T)`）、
  `src/tools.ts:238-253`（`TOOLS` 只声明 `inputSchema`）
- **现状**：`T` 纯属占位——墨墨改个字段名，返回值就静默变成 `undefined` 一路传给 LLM，
  没有一处校验。工具也没声明 `outputSchema`，MCP 客户端无法校验结构。
- **建议**：给核心工具（`get_vocabulary` / `list_notes` / `get_today_items` /
  `list_notepads`）加 `outputSchema`（zod → JSON Schema，同 `inputSchema` 的做法），
  并对关键字段做运行时校验；至少在 `src/client.ts:151` 加一条
  "data 不是对象就抛 api_error"的断言。
- **工作量**：L　**破坏性风险**：中（一旦声明 outputSchema，客户端会强校验，不匹配直接报错）

### P1-9 部署同步全靠手工 cp，忘了同步不会报错

- **位置**：仓库 `dist/` 与 `src/` 都在 `.gitignore` 里；systemd 跑的是
  `<deploy-dir>/dist/index.js`（`<systemd-unit>`），
  与仓库之间**没有任何脚本**。
- **现状**：
  - 仓库的 `deploy/deploy.sh` 是给远程 Docker 机器用的（克隆到 `/opt/maimemo-mcp`），
    `DEPLOY.md` 的"无 Docker"附录也指向 `/opt/maimemo-mcp` —— **跟 the user 的实际部署路径
    （`<deploy-dir>` + `<config-file>`）对不上**；
  - 手工流程是：改仓库 `src/` → `npm run build` → `cp -r dist <deploy-dir>/` →
    `systemctl restart`。**漏掉 cp 的话线上跑的还是旧代码，而且 `/healthz` 版本号一样，看不出来。**
- **建议**：加 `deploy/deploy-local.sh`：`npm ci`(可选) → `npm run build` → 同步 `src/`+`dist/`
  → `systemctl restart maimemo-mcp` → 轮询 `/healthz` → 打印前后版本号；
  并在 `/healthz` 里加 `built_at`（build 时注入的常量）。
- **工作量**：S　**破坏性风险**：无

### P1-10 README / docs 与代码不一致的地方（清单）

| 位置 | 文档说 | 代码实际 |
|---|---|---|
| `README.md:472` | /healthz 返回"限流用量" | 硬编码 `used: 0`（P1-6） |
| `README.md:39-41`、`README.md:607` 附近 | "Complete API coverage" / 与上游对比 | 记忆卡组 14 个操作没接（P1-4） |
| `src/token-status.ts:199-204` | remedy 说改服务器 env | 线上该变量为空，改了没用（P0-3） |
| `README.md:633` 附近 | "CI 门禁：单元测试、版本号一致性、tools/list 冒烟" | 冒烟在 `.github/workflows/ci.yml` 里，**本地 `npm test` 不跑**，容易误以为"测试全绿=冒烟也过了" |
| `docs/PHONE.md:211` vs `docs/SELF-HOST.md` | 端口 3000 / 9103 混用 | 9103 是本项目默认，3000 是上游默认 |
| `src/http.ts:23-25` 注释 | "Each request may carry its own Maimemo token" | 只有 initialize 那次生效（P0-2） |

- **工作量**：S　**破坏性风险**：无

---

## P2 可选

| # | 项 | 位置 | 说明 | 工作量 |
|---|---|---|---|---|
| P2-1 | 无状态模式（stateless） | `src/http.ts:150-160` | SDK 支持 `sessionIdGenerator: undefined`。零凭据 + 每请求带 token 天然适合无状态：没有会话泄漏、没有 token 焊死。但无状态下每请求要重新 initialize，the mobile client 未必兼容 → 建议做成 `MAIMEMO_SESSION_MODE=stateful\|stateless`，默认保持 stateful。 | M |
| P2-2 | `limiters` Map 永不清理 | `src/http.ts:30` | token 每 7 天换一次 → 每次多一个桶。当前 3 个，微不足道；配合 P0-1 会更明显。建议加 TTL/LRU 清理。 | S |
| P2-3 | token 记账文件无锁 | `src/token-status.ts:168-176` | 读-改-写无锁，两个并发 `get_token_status` 会丢一条 baseline（`rename` 原子，文件不会坏）。影响很小。 | S |
| P2-4 | `get_token_status` 实际没人用 | `src/token-status.ts:147` | 线上记账文件里**只有 2026-10-29 的一条**（零凭据模式切换后一个都没记上）→ 说明切到零凭据后这个工具没被调用过。建议：401 时自动附带 token 状态快照，或在客户端侧加提示。 | S |
| P2-5 | CORS 全开 | `src/http.ts:234` | `Access-Control-Allow-Origin: *`。有反代 `X-Gate-Token` + 墨墨 token 双保险，风险有限，但浏览器任意站点都能打这个端点。建议收敛到 Funnel 域名。 | S |
| P2-6 | body 超限返回 400 而非 413 | `src/http.ts:221` | 小问题。 | S |
| P2-7 | JSON body 为 `null` 会崩 | `src/client.ts:151-163` | `JSON.parse("null")` → `null` → `json.errors` 抛 TypeError → 变成 `[unexpected] Cannot read properties of null`。加一句 `if (!json \|\| typeof json !== "object")` 即可。 | S |
| P2-8 | handler 派发的类型安全被两个 `as` 废掉 | `src/handlers.ts:236-239` | `handlers[toolName] as Handler<ToolName>` + `parsed.data as ToolArgs<ToolName>` —— schema 和 handler 对不上时编译器不报错，与 `src/tools.ts:5-8` 宣称的"单一真源"精神相悖。建议用 `satisfies` + 泛型映射让编译器检查。 | M |
| P2-9 | 拼写不做大小写归一 | `src/client.ts:180-205` | "Apple" 和 "apple" 各占一条缓存、各打一次 API。 | S |
| P2-10 | `vocIdCache` 是 per-session 的 | `src/client.ts:57` | 74 个 session = 74 份缓存。同 token 的会话本可像 limiter 一样按指纹共享；修完 P0-1 这项自动改善。 | S |

---

## 核实过没问题的部分

以下几条我逐项验证过，**不用重复排查**：

1. **「按 token 分桶限流」是真的，不是注释吹牛。**
   `src/http.ts:30-42` 用 `tokenFingerprint(token)`（`src/client.ts:43-45`，sha256 前 16 位）做 key，
   每个 token 一个 `SlidingWindowRateLimiter`；`src/http.ts:43-49` 保证同一 token 的所有会话共享同一个桶。
   `test/rate-limit.test.mjs` 还断言了"两个指纹而不是三个"。多客户端互不饿死对方 —— 成立。

2. **滑动窗口算法本身是对的。**
   `src/rate-limiter.ts:45-67` 的滑动日志 + "第 (n−limit) 个命中过期"的等待时间计算正确。
   实测：`limit=2/1s` 时第 3 次 `acquire` 恰好等 ~1000ms 放行；`limit=1` 时第 2 次确实被阻塞。

3. **服务端确实没留墨墨凭据。**
   `<config-file>` 里 `MAIMEMO_API_TOKEN` **长度 0**，`MAIMEMO_REQUIRE_CLIENT_TOKEN=true`。
   token 只活在内存里，只以 sha256 前 16 位出现在日志/记账/healthz。
   `test/token-status.test.mjs` 有"绝不回显 token 本身"的断言。

4. **API 路径是对的（两种写法都通，别去"修"）。**
   官方 spec 里写的是 `/api/v1/memo/...`，但官方 curl 示例和实测都是 `/api/v1/...`，
   两条路径都存在（认证先于路由，所以无 token 时两条都是 401）。当前 `src/handlers.ts` 用的
   `/api/v1/xxx` **没问题**。

5. **请求体形状与官方 spec 完全一致。**
   逐条比对 `api_bundle.yaml`：`add_words {words:[{id}], advance}` ✓、
   `advance_study {voc_ids}` ✓、`notes {note:{voc_id,note_type,note}}` ✓、
   `vocabulary/query {spellings, ids}` ✓、`query_study_records {next_study_date:{start,end}}` ✓、
   `notes/{id}` POST+DELETE ✓、`notepads/{id}` GET+POST+DELETE ✓（删除类工具不是臆想出来的）。

6. **墨墨背单词组 24 个 API 操作 → 24 个工具，1:1 全覆盖，无缺口。**
   （spec 15 条路径 / 24 个操作 vs 本服务 24 个对应工具 + 1 个自研 `get_token_status` = 25。）

7. **`DELETE /mcp` 能正常回收会话。** 实测返回 200，sessions 从 2 降到 1。
   SDK 用法没问题，缺的是 TTL / 上限（P0-1）。

8. **不会把 HTML 错误页当 JSON 崩掉。**
   `src/client.ts:151` 的 `tryParse` 失败会抛 "non-JSON response" 而不是 `JSON.parse` 异常。
   （唯一漏洞是 body 恰好是 `null` 的边界，见 P2-7。）

9. **配置解析 fail-fast 且有测试覆盖。**
   `src/config.ts` 对端口/布尔/限流格式/transport 都做校验并给出可读报错；
   `test/config.test.mjs` 12 个用例覆盖到位。`npm test` 本机实测 **36 个用例全绿**。

10. **CI 门禁齐全。**
    `.github/workflows/ci.yml`：typecheck → build → unit test → **tools/list 冒烟**
    （断言 `get_vocabulary` 和 `get_token_status` 都在）。`package.json` 的 `test` 脚本会先 build
    再跑 `node --test test/*.test.mjs`。

11. **限流默认值与官方一致。**
    `src/rate-limiter.ts:17-21` 的 `10s:20 / 60s:40 / 5h:2000` 与 `api_bundle.yaml` 一字不差
    （官方另有一档 5h/8000，那是给记忆卡的）。线上 env 也是这一组。

12. **token 记账写入是原子的。**
    `src/token-status.ts:114-131` 用 tmp + `rename`，崩溃不会留下截断文件；
    只读文件系统会降级（catch 掉）而不是让工具挂掉。`test/token-status.test.mjs` 有对应断言。

13. **墨墨 token 不会进日志。** 全代码只在 `Authorization` 头里用它，日志与 healthz 只有指纹。

---

## 给主 agent 的结论

1. **最该马上动手的 3 件事**（按性价比排序）：

   **① 会话 TTL + 上限回收（`src/http.ts:40/161`）** — 线上 74 个 session 9 天不降，
   内存单调涨。改成"30 分钟无请求即 close + 最多 100 个会话"，用 SDK 的 `onsessionclosed` 钩子。
   工作量 M，一次上线就止血。

   **② 401 文案 + remedy 按零凭据模式改写（`src/errors.ts:48`、`src/token-status.ts:199`）**
   —— 现在教用户去改一个线上长度为 0 的 `MAIMEMO_API_TOKEN`，LLM 会照着说，等于教错。
   顺带把墨墨的结构化错误码（`common_unauthorized` 等）提到消息最前面。工作量 S，收益立竿见影。

   **③ 会话不再焊死 token（`src/http.ts:43-49/133-135`）** —— 墨墨 token 7 天一过期，
   用户换了新 token 但会话没重建 → 永远 401。改成每请求比对指纹、变了就更新 client，
   并在错误里明确提示"请重建 MCP 会话"。这是每 7 天必然复现的故障。

2. **这三件做完，再按顺序做**：P0-5（schema 补 `anyOf`）→ P0-6（输出体积上限）→
   P1-5+P1-6（日志 + healthz 真数据）→ P1-9（本地部署脚本）。

3. **需要用户点头的两件事**：P1-2（限流降到官方上限的 80%，会变慢）、
   P1-4 的补齐记忆卡组（工作量大，先改文档口径）。

4. **不要重复排查**：按 token 分桶限流 ✓ 真、滑动窗口算法 ✓ 对、API 路径 ✓ 对、
   请求体形状 ✓ 对、墨墨组 24 个工具 ✓ 全覆盖、零凭据 ✓ 真落地、测试 ✓ 全绿。

5. **本次只读不改**，仓库只新增了本文件（`docs/OPTIMIZATION-2026-11-10.md`），
   未 commit、未改 `src/`、未动部署目录、未重启任何服务。
