# 在手机上跑 maimemo-mcp（不需要 VPS）

> 没有服务器？没关系。这个 MCP server 完全可以跑在你自己手机上，
> 数据只从你的手机出去，不经过任何第三方机器。
>
> No server? This MCP server runs entirely on your own phone. Your data leaves
> the phone only to reach the official Maimemo API.

---

## 三条路，先选一条

| | 适合谁 | 手机上装什么 | 数据流向 | 难度 |
|---|---|---|---|---|
| **A. 全本地** | Android | Termux + Node | 手机 → 墨墨 | ★☆☆ |
| **B. 共享实例** | 任意（含 iOS） | 无 | 手机 → 公共实例 → 墨墨 | ★☆☆ |
| **C. 免服务器** | 任意 | 无 | 手机 → Cloudflare 边缘 → 墨墨 | ★★☆ |

先讲 A（最常见、最私密），B 和 C 在最后一节。

---

## A. Android 全本地

### 它长什么样

```
┌───────────── 手机 ─────────────┐
│                               │
│  Termux ──► maimemo-mcp       │
│  127.0.0.1:9103      ▲        │
│                      │ http   │
│               橘瓣 / RikkaHub ─┘
│                      │        │
└──────────────────────┼────────┘
                       │ https
                       ▼
              open.maimemo.com
```

服务只监听 `127.0.0.1`，**只有这台手机能连**，不暴露到公网。

### 三条前提（都查证过）

1. **橘瓣（RikkaHub）只支持 SSE 和 Streamable HTTP，不支持 stdio。**
   它的 `McpConfig.kt` 里只有 `SseTransportServer` 和 `StreamableHTTPServer`
   两个传输类型。所以手机上的 server 必须是个**监听端口的 HTTP 服务**，
   客户端拿 URL 去连 —— 这正好符合上面的图。
2. **橘瓣允许明文 HTTP。** 它的 `AndroidManifest.xml` 里有
   `android:usesCleartextTraffic="true"`，URL 字段也不校验 https，
   所以 `http://127.0.0.1:9103/mcp` 直接能填。
3. **Android 上两个 App 之间走 127.0.0.1 是通的。** 所有 App 共享同一个
   网络栈，loopback 是设备级的，不是 App 级的。

### 步骤

**1. 装 Termux**

从 **F-Droid** 或 **GitHub Releases** 装。Play 商店上那个是很多年前的僵尸包。

**2. 一条命令装好**

```bash
curl -fsSL https://raw.githubusercontent.com/tutu-kitty/maimemo-mcp/main/deploy/install-termux.sh | bash
```

脚本会：装 Node（没有的话）→ 下载单文件构建 → 问你要墨墨 token →
写 `~/.maimemo-mcp/.env`（权限 600）→ 用 tmux 把它跑起来。

也可以手动来：

```bash
pkg install nodejs-lts
mkdir -p ~/.maimemo-mcp && cd ~/.maimemo-mcp
curl -fLO https://github.com/tutu-kitty/maimemo-mcp/releases/latest/download/maimemo-mcp.cjs
```

**3. 拿墨墨 token**

App 里：**我的 → 更多设置 → 实验功能 → 开放 API**

**4. 起服务**

```bash
cd ~/.maimemo-mcp
cat > .env <<'EOF'
MAIMEMO_API_TOKEN=你的token
MAIMEMO_MCP_TRANSPORT=http
HOST=127.0.0.1
PORT=9103
MAIMEMO_TOKEN_STATE_DIR=/data/data/com.termux/files/home/.maimemo-mcp/state
EOF

termux-wake-lock          # 别让 Android 把 Termux 杀了
node maimemo-mcp.cjs
```

看到这行就成了：

```
[maimemo] v2.1.0 listening on 127.0.0.1:9103
```

**5. 客户端里连上**

橘瓣：设置 → MCP → **+** → 类型选 **Streamable HTTP** →

| 字段 | 值 |
| --- | --- |
| 名称 | `maimemo (墨墨背单词)` |
| URL | `http://127.0.0.1:9103/mcp` ← **无尾斜杠** |
| 请求头 | `Authorization` / `Bearer 你的token` |

或者直接导入 JSON：

```json
{
  "mcpServers": {
    "maimemo (墨墨背单词)": {
      "type": "streamable_http",
      "url": "http://127.0.0.1:9103/mcp",
      "headers": { "Authorization": "Bearer 你的token" }
    }
  }
}
```

**6. 验证**

问一句「我的 token 还剩几天过期？」，能答就说明链路全通。

### 为什么给你一个单文件

`maimemo-mcp.cjs` 是把整个 server 打成的一个文件（1.3 MB，零依赖）。

手机上有 `npm install` 的话当然也能 `git clone && npm ci && npm run build`
（依赖全是纯 JS，99 个包，没有原生编译，手机上实测 5 秒），但单文件省事得多：
下载 → `node` → 跑完。

> ⚠️ 打包**必须用 CJS 格式**。ESM 会炸
> `Dynamic require of "path" is not supported`（依赖链里 `depd` 用了 dynamic require）。

### 保活（Android 唯一真正的麻烦）

Android 会杀后台进程。对策：

```bash
termux-wake-lock                     # 防止 Doze 休眠
pkg install tmux
tmux new -s maimemo                  # 在里面起服务
# Ctrl+B 然后 D 脱离, 界面关了进程还在
tmux attach -t maimemo              # 回头看日志
```

还要去 **设置 → 应用 → Termux → 电池 → 不受限制**。
开机自启需要另外装 **Termux:Boot**，把启动脚本放进 `~/.termux/boot/`。

### token 7 天过期

墨墨的 token 官方有效期 7 天。过期后调用会 401。两个选择：

- 改 `.env` 里的 `MAIMEMO_API_TOKEN` → 重启进程
- 或者**只把 token 放在客户端**（服务端不设 `MAIMEMO_API_TOKEN`，
  改设 `MAIMEMO_REQUIRE_CLIENT_TOKEN=*** → **只改客户端那一处，不用重启服务**

第 25 个工具 `get_token_status` 就是干这个的：告诉你还剩几天、什么时候该换。

---

## B. 共享实例（iOS 的人走这条）

服务端**不持有任何人的凭据**：

```bash
MAIMEMO_REQUIRE_CLIENT_TOKEN=***   # 强制客户端带 token
# 不设 MAIMEMO_API_TOKEN           # 服务端零凭据
```

每个人在客户端填自己的墨墨 token 就能用，服务端只做转发。

```json
{
  "mcpServers": {
    "maimemo (墨墨背单词)": {
      "type": "streamable_http",
      "url": "https://<你的实例>/mcp",
      "headers": { "Authorization": "Bearer <你自己的墨墨token>" }
    }
  }
}
```

服务端会**按 token 指纹分桶限流**（每个 token 一个独立滑动窗口），
所以一个人连发不会吃掉别人的额度。

---

## C. 免服务器（Cloudflare Workers）

Cloudflare Workers 免费额度够个人用，全球边缘延迟低，完全不需要服务器。

代价：本仓库的 `src/http.ts` 用的是 `node:http` + `node:fs`，
Workers 都不支持，要换成 SDK 自带的 `WebStandardStreamableHTTPServerTransport`
（`@modelcontextprotocol/sdk@1.32.2` 里已有），token 记账从本地文件搬到 KV。
工作量约等于重写一遍 http 层。

---

## 坑清单（都是实测出来的）

| 症状 | 原因 | 怎么办 |
| --- | --- | --- |
| 客户端连上但一调用就 401 | token 填错了 —— **initialize 不校验 token 有效性**，只校验"有没有带"，所以照样显示「已连接」 | 检查 token；用 `get_token_status` 验 |
| 404 | URL 多了尾斜杠（`/mcp/`） | 精确写 `/mcp` |
| 客户端一直「重连中」，最后变 Error | Termux 被 Android 杀了（重连退避 1s→30s，5 次失败后彻底放弃，要手动重连） | `termux-wake-lock` + 电池优化设「不受限制」+ tmux |
| Termux 装不上 / 装崩 | 装的是 Play 商店的僵尸包 | 从 F-Droid 或 GitHub Releases 装 |
| `npm ci` 很慢 | 国内 npm 源 | `npm config set registry https://registry.npmmirror.com` |
| esbuild 打包报 `Dynamic require of "path"` | 用了 ESM 格式 | 改 `--format=cjs` |
| state 目录写不进去 | 没显式指定 `MAIMEMO_TOKEN_STATE_DIR` | 指到 Termux 家目录下的路径 |

---

## 顺便：本地跑也能给别的设备用

服务默认只监听 `127.0.0.1`（安全）。想让它在同一 Wi-Fi 下的别的设备也能连：

```bash
HOST=0.0.0.0
```

⚠️ 这样一来同网段任何人都能调你的工具。**请务必同时设**
`MAIMEMO_REQUIRE_CLIENT_TOKEN=*** 让每个人带自己的 token，
并且别在公共 Wi-Fi 下这么做。

---

## 相关文件

- `deploy/install-termux.sh` —— 一键安装脚本
- `deploy/maimemo-mcp.service` —— systemd 单元（Linux 机器上跑）
- `DEPLOY.md` —— 服务器 / Docker 部署
- `README.md` —— 工具列表与配置项
