# 在自己的电脑上跑 maimemo-mcp（不需要 VPS）

> 想把服务跑在自己手上的电脑（Mac / Linux / Windows）上？
> 这个 server 就是一个 Node 进程，放哪都能跑。你的数据只从这台机器出去，
> 不经过任何第三方服务器。
>
> Want to run the server on your own computer (Mac / Linux / Windows)?
> It is a plain Node process — it runs anywhere. Your data leaves your machine
> only to reach the official Maimemo API.

---

## 目录 / Contents

- [0. 先选一件事：token 放哪](#0-先选一件事token-放哪)
- [1. 跑起来（三种系统）](#1-跑起来三种系统)
  - [1.1 Linux：systemd](#11-linuxsystemd)
  - [1.2 macOS：launchd](#12-macoslaunchd)
  - [1.3 Windows：任务计划程序](#13-windows任务计划程序)
- [2. 客户端怎么连](#2-客户端怎么连)
- [3. 让别的设备也能连](#3-让别的设备也能连)
  - [3.1 同一局域网](#31-同一局域网)
  - [3.2 私有网络（Tailscale / WireGuard）](#32-私有网络tailscale--wireguard)
  - [3.3 公开到互联网](#33-公开到互联网)
- [4. 开机自启](#4-开机自启)
- [5. 常见问题](#5-常见问题)

---

## 0. 先选一件事：token 放哪

这是唯一一个需要你先想清楚的决定。两种都支持，选哪种都行。

| | 服务端持有 token | 客户端持有 token |
|---|---|---|
| 配置 | 设 `MAIMEMO_API_TOKEN` | 设 `MAIMEMO_REQUIRE_CLIENT_TOKEN=true`，**不设** `MAIMEMO_API_TOKEN` |
| token 过期时 | 改服务端配置 + **重启服务** | 只改客户端，**不用重启** |
| 谁能看到 token | 机器上的人 / 拿到机器的人 | 只有客户端的人 |
| 多个人共用一台机器 | 不行（大家的调用都记在你头上） | 行，每人带自己的 |
| 适合 | 一台永远开着的服务器 | 自己的电脑 / 手机 |

**判断标准很简单：这台机器你不在的时候，它还能不能自己处理 token 过期？**

- 能（比如一台 VPS、或者一台从不关机的机器）→ 服务端持有更省事
- 不能（电脑会睡眠、手机会被系统杀）→ 客户端持有，过期只改客户端

> ⚠️ 两种模式**不要同时设**。`MAIMEMO_API_TOKEN` 是服务端兜底，
> 设了它就等于把所有调用都记在这个 token 上。

---

## 1. 跑起来（三种系统）

三步都是一样的：**装 Node → 拿到单文件 → 写配置 → 起进程**。

### 1.0 准备

**Node.js 20 或更高**（`node -v` 查看）。

```bash
# macOS
brew install node

# Debian / Ubuntu
sudo apt-get install -y nodejs npm

# Windows
winget install OpenJS.NodeJS.LTS
```

**下载单文件构建**（1.4 MB，零依赖，不需要 `npm install`）：

```bash
# macOS / Linux
mkdir -p ~/.maimemo-mcp && cd ~/.maimemo-mcp
curl -fL -o maimemo-mcp.cjs \
  https://github.com/tutu-kitty/maimemo-mcp/releases/latest/download/maimemo-mcp.cjs
```

```powershell
# Windows (PowerShell)
New-Item -ItemType Directory -Force $HOME\.maimemo-mcp | Out-Null
cd $HOME\.maimemo-mcp
Invoke-WebRequest -Uri "https://github.com/tutu-kitty/maimemo-mcp/releases/latest/download/maimemo-mcp.cjs" -OutFile maimemo-mcp.cjs
```

**拿 token**：墨墨 App → 我的 → 更多设置 → 实验功能 → 开放 API

**写配置** `~/.maimemo-mcp/.env`（Windows 是 `$HOME\.maimemo-mcp\.env`）：

客户端持有 token（推荐给会睡的机器）：

```ini
MAIMEMO_REQUIRE_CLIENT_TOKEN=true
MAIMEMO_MCP_TRANSPORT=http
HOST=127.0.0.1
PORT=9103
MAIMEMO_TOKEN_STATE_DIR=/home/<you>/.maimemo-mcp/state
```

服务端持有 token（给不会关机的机器）：

```ini
MAIMEMO_API_TOKEN=<your token>
MAIMEMO_MCP_TRANSPORT=http
HOST=127.0.0.1
PORT=9103
MAIMEMO_TOKEN_STATE_DIR=/home/<you>/.maimemo-mcp/state
```

> `MAIMEMO_TOKEN_STATE_DIR` 必须指向一个**可写**目录 —— token 健康检查的记账写在那里。
> 指向项目目录之外的路径最省事。

**起进程**：

```bash
cd ~/.maimemo-mcp
set -a; . ./.env; set +a
node maimemo-mcp.cjs
```

看到这行就成了：

```
[maimemo] v2.1.0 listening on 127.0.0.1:9103
```

验一下：

```bash
curl -s http://127.0.0.1:9103/healthz
```

### 1.1 Linux：systemd

仓库里有一个现成的单元文件：

```bash
sudo cp deploy/maimemo-mcp.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now maimemo-mcp
sudo systemctl status maimemo-mcp
journalctl -u maimemo-mcp -f
```

它默认读 `/opt/maimemo-mcp/.env`、跑 `/opt/maimemo-mcp/dist/index.js`。
如果你用的是上面的单文件方式，改这两个路径：

```ini
WorkingDirectory=/home/<you>/.maimemo-mcp
EnvironmentFile=/home/<you>/.maimemo-mcp/.env
ExecStart=/usr/bin/node /home/<you>/.maimemo-mcp/maimemo-mcp.cjs
```

### 1.2 macOS：launchd

macOS 用 launchd 管后台服务。模板在 `deploy/maimemo-mcp.plist`，
改三处路径再装上：

```bash
# 1. 复制并编辑
cp deploy/maimemo-mcp.plist ~/Library/LaunchAgents/com.example.maimemo-mcp.plist
$EDITOR ~/Library/LaunchAgents/com.example.maimemo-mcp.plist
#    改 Label、ProgramArguments 里的 node 路径和脚本路径、StandardOutPath

# 2. 装上并启动
launchctl load ~/Library/LaunchAgents/com.example.maimemo-mcp.plist
launchctl list | grep maimemo

# 3. 看日志
tail -f ~/.maimemo-mcp/server.log
```

`~/Library/LaunchAgents/` 下的 plist 只在**你登录时**启动。
要开机就跑（不登录也起），放到 `/Library/LaunchDaemons/` 并需要 root 权限。

### 1.3 Windows：任务计划程序

最省事的做法是注册一个计划任务，触发器选「登录时」，动作是运行
`node.exe <路径>\maimemo-mcp.cjs`：

```powershell
$action = New-ScheduledTaskAction -Execute "node.exe" `
  -Argument "$HOME\.maimemo-mcp\maimemo-mcp.cjs" `
  -WorkingDirectory "$HOME\.maimemo-mcp"
$trigger = New-ScheduledTaskTrigger -AtLogOn
Register-ScheduledTask -TaskName "maimemo-mcp" -Action $action -Trigger $trigger `
  -Description "Maimemo MCP server"
Start-ScheduledTask -TaskName "maimemo-mcp"
```

环境变量用任务计划的「操作 → 编辑」界面加，或者在 `.env` 之外用
`setx MAIMEMO_MCP_TRANSPORT http` 之类的方式设成系统级变量。

---

## 2. 客户端怎么连

不管跑在哪，客户端填的东西都一样，只有 URL 变：

| 字段 | 值 |
|---|---|
| 传输类型 / Type | Streamable HTTP |
| URL | `http://127.0.0.1:9103/mcp` ← **无尾斜杠** |
| 请求头 / Header | `Authorization` / `Bearer <你的墨墨 token>` |

> **URL 末尾不要加斜杠。** `/mcp/` 会 404 —— 实测过的坑。

RikkaHub（橘瓣）可以直接导入这段 JSON：

```json
{
  "mcpServers": {
    "maimemo (墨墨背单词)": {
      "type": "streamable_http",
      "url": "http://127.0.0.1:9103/mcp",
      "headers": { "Authorization": "Bearer <your Maimemo token>" }
    }
  }
}
```

**验一下链路通不通**：问一句「我的 token 还剩几天过期？」
`get_token_status` 能答，就说明客户端 → 服务 → 墨墨官方整条都通了。

> ⚠️ **显示「已连接」不等于能用。** `initialize` 只检查「有没有带 token」，
> 不检查 token 对不对。填错了照样显示已连接，一调用才 401。
> 用 `get_token_status` 验，别信连接状态。

---

## 3. 让别的设备也能连

默认服务只听 `127.0.0.1`，**只有这台机器能连** —— 这是最安全的默认值。
要让别的设备连上，按暴露面从小到大选：

### 3.1 同一局域网

改 `HOST=0.0.0.0`，重启服务，然后客户端填这台机器的局域网 IP：

```ini
HOST=0.0.0.0
```

```bash
# 查本机局域网 IP
ip addr | grep "inet "        # Linux
ipconfig getifaddr en0        # macOS
ipconfig                       # Windows
```

客户端填 `http://192.168.x.x:9103/mcp`。

> ⚠️ 同一个 Wi-Fi 下的**任何人**都能连到这个端口。
> 服务端零凭据的话他们碰不到你的墨墨账号（token 在客户端手里），
> 但端口是敞着的。**公共 Wi-Fi 下别这么开。**

### 3.2 私有网络（Tailscale / WireGuard）

你已经有 Tailscale 的话，这是最舒服的方案：**不占公网端口，只有你网络里的设备能连**。

```bash
# 装 Tailscale 之后，确认自己在这个网络里
tailscale status
tailscale ip -4
```

服务保持 `HOST=127.0.0.1`，另外用 Tailscale 的 Serve 做一层 HTTPS 反代：

```bash
tailscale serve --bg --https=443 http://127.0.0.1:9103
```

客户端填 `https://<你的机器名>.<tailnet>.ts.net/mcp`。

> ⚠️ **Serve 必须挂在根路径。** `--set-path=/mcp` 会把挂载点之后的路径剥掉，
> `/mcp` 被送到上游根路径 → 404。
>
> ⚠️ **Serve 是整份替换语义**，不是追加 —— 重复执行会覆盖已有的配置。
> 改之前先 `tailscale serve status` 看看现状。

不需要装 Tailscale 的话，任何私有网络方案（WireGuard、ZeroTier）
都是同一个思路：先建私有网络，再让客户端填那台机器的私网地址。

### 3.3 公开到互联网

**这条路要慎重。** 服务一旦在公网可达，URL 泄露就等于把你的工具挂在外面。

如果要公开，至少要做到这三条：

1. **HTTPS**。用 Tailscale Serve / Funnel、Caddy、nginx + certbot 都行。
2. **一层门禁**。在服务前面挡一个校验 `Authorization` 的反代
   （仓库里的 `deploy/nginx.conf` 是现成的 nginx 模板）。
   ⚠️ 注意：如果服务本身用的是「客户端持有 token」模式，
   `Authorization` 头已经被墨墨 token 占了，门禁要换个头名。
3. **限流**。服务内置的限流是**按 token 指纹分桶**的（墨墨按 token 记配额），
   所以一个人连发不会吃掉别人的额度 —— 但这台机器本身的 CPU 和连接数仍然要看着点。

公开到公网之后，这件事就**不再是「本地部署」**了：数据会经过中间那台机器。
如果你的目标是不让数据经过第三方，公网这条路跟目标是矛盾的。

---

## 4. 开机自启

| 系统 | 方式 | 模板 |
|---|---|---|
| Linux | systemd unit | `deploy/maimemo-mcp.service` |
| macOS | launchd plist | `deploy/maimemo-mcp.plist` |
| Windows | 任务计划程序 | 见 [1.3](#13-windows任务计划程序) |

三个模板都是**通用路径**，装之前改成本机的实际路径。

---

## 5. 常见问题

| 症状 | 原因 | 怎么办 |
|---|---|---|
| 连上但一调用就 401 | token 填错了（`initialize` 不校验 token 有效性） | 用 `get_token_status` 验 |
| 404 | URL 多了尾斜杠 | 精确写 `/mcp` |
| 服务起不来，报 `Invalid MAIMEMO_REQUIRE_CLIENT_TOKEN` | 值不是 `true` / `1` / `yes` / `on` | 改成 `true` |
| `get_token_status` 报 `unknown` | 网络问题，或者探针没走到墨墨 | 看日志；探针端点固定是云词本列表，不是查词典 |
| 记账写不进去 / 每次启动都重新计时 | `MAIMEMO_TOKEN_STATE_DIR` 指向了不可写目录 | 指到项目目录之外的路径 |
| 端口被占 | 9103 已经有东西了 | `.env` 里改 `PORT` |
| 电脑合盖就断 | 系统休眠 | 改电源设置，或用 `caffeinate -i` 之类保持唤醒 |

---

## 相关文件 / Related files

- `deploy/maimemo-mcp.service` —— systemd 单元（Linux）
- `deploy/maimemo-mcp.plist` —— launchd 作业（macOS）
- `deploy/nginx.conf` —— nginx 反代模板（TLS 终止）
- `deploy/install-termux.sh` —— Android 手机上的一键安装
- `docs/PHONE.md` —— 手机上的完整走法
- `DEPLOY.md` —— 服务器部署（Docker + Nginx + Let's Encrypt）
