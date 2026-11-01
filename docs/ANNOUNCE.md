# 宣传文案 / Announcement copy

给这个项目写介绍时，可以直接抄下面的段落。**数字都是从上游真身核出来的，别改，也别加没验证过的说法。**

仓库：<https://github.com/tutu-kitty/maimemo-mcp>
对比上游：<https://github.com/Mrquj/mcp-server-maimemo/compare/main...tutu-kitty:main>

---

## 一句话版（最短）

墨墨背单词的 MCP server —— 比上游多了 25 个工具、按 token 分桶限流、36 个单元测试，手机上也能跑。

## 三行版

> **maimemo-mcp** —— 把墨墨背单词的开放 API 接成 MCP 工具，让你的 AI 助手能真的替你查词典、写助记、管云词本。
> 上游只有 24 个工具、零测试；这个 fork 加了 token 健康检查、按 token 分桶限流、36 个单元测试、单文件构建和手机一键安装。
> <https://github.com/tutu-kitty/maimemo-mcp>

## 完整版（发小红书 / 论坛 / X 都够用）

**给你的 AI 助手装一个墨墨背单词**

跟 AI 聊天的時候，你可能想过：它要是不只会说话，还能真的翻我的词典、替我写助记就好了。

`maimemo-mcp` 就是干这个的 —— 把墨墨背单词的开放 API 接成 MCP 工具。接上之后，你在对话里说一句「帮我给这批词编个谐音」，它就真的写进你的墨墨账号里；「把今天的生词加进考研核心」，它就真的整理好云词本。

**它不是换皮。** 上游是 <https://github.com/Mrquj/mcp-server-maimemo>（MIT），这个是 fork，改动都能看：
[26 个 commit、28 个文件、+2477 行 diff](https://github.com/Mrquj/mcp-server-maimemo/compare/main...tutu-kitty:main)

比上游多出来的：

- **25 个工具**（上游 24 个）—— 多一个 `get_token_status`，墨墨不给 token 自省接口，这个工具靠探测 + 本地记账告诉你还剩几天过期
- **按 token 分桶限流** —— 上游是整个进程共用一个滑动窗口；墨墨的配额按 token 记，这个 fork 分桶，一个人连发不会吃掉别人的额度
- **36 个单元测试**（上游零测试，连 `npm test` 都没有）
- **单文件构建** —— 一个 1.4 MB 的 `.cjs`，`node maimemo-mcp.cjs` 就跑起来，手机上不用 `npm install`
- **手机一键安装** —— `deploy/install-termux.sh`，装 Termux 的朋友直接跑
- **macOS 开机自启** —— `deploy/maimemo-mcp.plist`
- **两份中文部署文档** —— `docs/PHONE.md`（手机 / 共享实例）、`docs/SELF-HOST.md`（自己的电脑）
- **token 放客户端的模式** —— 服务端可以一份凭据都不留，token 过期只改客户端，不用重启机器

仓库：<https://github.com/tutu-kitty/maimemo-mcp>

## English version

**Give your AI assistant the 墨墨背单词 (Maimemo) API.**

`maimemo-mcp` exposes the Maimemo Open API as MCP tools, so an assistant can look up
words, write your mnemonics and interpretations, manage your cloud notepads, and read
your study plan — on your own account, with your own token.

**It is not a reskin.** This is a fork of
<https://github.com/Mrquj/mcp-server-maimemo> (MIT) with
[26 commits and 2477 lines of changes](https://github.com/Mrquj/mcp-server-maimemo/compare/main...tutu-kitty:main)
on top:

- **25 tools** instead of 24 — the extra one, `get_token_status`, tells you how many days
  your token has left (Maimemo has no introspection endpoint, so it probes and keeps
  local bookkeeping)
- **Rate limits bucketed per token** — upstream shares one sliding window across the whole
  process, but Maimemo's quota is per token
- **36 unit tests** — upstream had none
- **A single-file build** — one 1.4 MB `.cjs`, no `npm install`, runs on a phone
- **One-command Android install**, a **macOS launchd job**, and **two Chinese deployment guides**
- **Server-side zero-credential mode** — the token can live on the client, so expiry means
  editing one header instead of restarting a machine

Repo: <https://github.com/tutu-kitty/maimemo-mcp>

---

## 可引用的事实（别写错）

| 事实 | 数字 | 来源 |
|---|---|---|
| 上游工具数 | 24 | 上游 README 工具表 |
| 本 fork 工具数 | 25（多 `get_token_status`） | `tools/list` 实跑 |
| 上游限流 | 全进程共用一个窗口 | 上游 `src/http.ts` 注释 + 单个 `const limiter` |
| 本 fork 限流 | 按 token 指纹分桶 | 本 fork `src/http.ts` 的 `Map` |
| 上游测试 | 0（无 `test/` 目录、无 `npm test` 脚本） | 上游 `git tree` |
| 本 fork 测试 | 36 | `npm test` |
| 领先上游 | 26 commit / 28 文件 / +2477 行（不含 lockfile） | `git diff upstream/main` |
| 单文件体积 | 1.4 MB（1,400,309 B） | release 资产 |
| 本 fork 版本 | 2.1.0 | `package.json` |
| 上游版本 | 2.0.0 | 上游 `package.json` |

**不要说**：
- 「完全重写」 —— 是 fork，MIT 同条款，LICENSE 逐字节未改
- 「比上游快 N 倍」 —— 没测过这种数，别编
- 「官方推荐」 —— 不是
