# Deploying to a Tencent Cloud CVM

This walks through a production deployment on a Tencent Cloud server: Docker for
the app, Nginx for TLS termination, and Let's Encrypt for the certificate.

A 1 vCPU / 1 GB instance is more than enough. The container is capped at 256 MB.

---

## 0. Before you start

You need:

- A Tencent Cloud CVM running **Ubuntu 22.04+** or **Debian 12+**
- Your Maimemo API token (app: 我的 → 更多设置 → 实验功能 → 开放 API)
- A domain name if you want remote MCP clients to connect — **HTTPS is required**,
  and Let's Encrypt will not issue a certificate for a bare IP address

> **Domain registered in mainland China?** A domain pointing at a mainland CVM must
> complete ICP filing (备案) before ports 80/443 will serve traffic. If you have not
> filed, either use a Hong Kong / overseas CVM, or skip the domain and use the SSH
> tunnel approach in the appendix.

---

## 1. Open the firewall

In the Tencent Cloud console: **云服务器 → 安全组 → 配置规则 → 入站规则**

Allow inbound TCP on:

| Port | Purpose |
| --- | --- |
| `22` | SSH |
| `80` | HTTP (certificate issuance + redirect) |
| `443` | HTTPS |

**Do not open port 3000.** The app binds to `127.0.0.1` and is reached only through Nginx.

---

## 2. Run the deploy script

SSH in, then:

```bash
curl -fsSL https://raw.githubusercontent.com/tutu-kitty/mcp-server-maimemo/main/deploy/deploy.sh -o deploy.sh
chmod +x deploy.sh
sudo ./deploy.sh
```

It installs Docker if missing, clones the repo to `/opt/mcp-server-maimemo`, prompts
for your token, builds the image, and starts the container.

Expected output ends with a healthy JSON response from `/healthz`.

> If GitHub is slow or blocked from your CVM, clone through a mirror instead:
> `git clone --depth 1 https://gitclone.com/github.com/tutu-kitty/mcp-server-maimemo.git /opt/mcp-server-maimemo`
> then `cd /opt/mcp-server-maimemo && cp .env.example .env`, edit `.env`, and run
> `docker compose up -d --build`.

---

## 3. Point your domain at the server

Add an **A record** for `mcp.yourdomain.com` pointing to your CVM's public IP.

Confirm it resolves before continuing:

```bash
dig +short mcp.yourdomain.com
```

---

## 4. Install Nginx and TLS

```bash
sudo apt-get update && sudo apt-get install -y nginx certbot python3-certbot-nginx

# Install the site config
sudo cp /opt/mcp-server-maimemo/deploy/nginx.conf /etc/nginx/sites-available/maimemo-mcp
sudo sed -i 's/mcp.example.com/mcp.yourdomain.com/g' /etc/nginx/sites-available/maimemo-mcp
sudo ln -sf /etc/nginx/sites-available/maimemo-mcp /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

sudo nginx -t && sudo systemctl reload nginx

# Issue the certificate
sudo certbot --nginx -d mcp.yourdomain.com
```

Certbot rewrites the config for TLS and installs an auto-renewal timer.

The supplied Nginx config disables proxy buffering and raises read timeouts to one
hour. Both are **required** — MCP holds long-lived streaming connections, and default
Nginx settings will cut them off mid-session.

---

## 5. Verify

```bash
curl https://mcp.yourdomain.com/healthz
```

You should see `{"status":"ok", ...}`.

Then exercise the MCP endpoint itself:

```bash
curl -X POST https://mcp.yourdomain.com/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"curl","version":"1.0"}}}'
```

A JSON-RPC result containing `serverInfo` means you are done.

---

## 6. Connect your MCP client

Use this URL:

```
https://mcp.yourdomain.com/mcp
```

If you set `MAIMEMO_REQUIRE_CLIENT_TOKEN=true` in `.env`, also configure the
connection's Bearer token to your Maimemo API token. Otherwise the server uses the
token baked into `.env`.

---

## Operations

```bash
cd /opt/mcp-server-maimemo

docker compose logs -f          # tail logs
docker compose restart          # restart
docker compose down             # stop
sudo ./deploy/deploy.sh         # pull latest + rebuild
```

Edit configuration in `/opt/mcp-server-maimemo/.env`, then `docker compose up -d`.

---

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `curl: connection refused` on `/healthz` | Container not running — check `docker compose logs` |
| 502 from Nginx | App is down, or Nginx is proxying to the wrong port |
| Session drops after ~60s | `proxy_buffering off` / `proxy_read_timeout` missing from Nginx |
| `[auth]` errors in tool results | Bad or expired `MAIMEMO_API_TOKEN` |
| `[rate_limit]` errors | Maimemo quota exhausted — wait, or lower `MAIMEMO_RATE_LIMITS` |
| Certbot fails | DNS not propagated, or port 80 blocked by the security group |
| Domain returns nothing at all | ICP filing (备案) incomplete for a mainland CVM |

---

## Appendix: no domain / no ICP filing

Run the container as above, skip Nginx entirely, and reach it over an SSH tunnel from
your local machine:

```bash
ssh -N -L 3000:127.0.0.1:3000 root@YOUR_CVM_IP
```

The server is then available locally at `http://localhost:3000/mcp`. This works for
local MCP clients, but **not** for hosted clients — those need a public HTTPS URL.

---

## Appendix: running without Docker

```bash
sudo useradd -r -s /bin/false maimemo
sudo git clone --depth 1 https://github.com/tutu-kitty/mcp-server-maimemo.git /opt/mcp-server-maimemo
cd /opt/mcp-server-maimemo

curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

sudo npm install && sudo npm run build
sudo cp .env.example .env && sudo nano .env       # set MAIMEMO_API_TOKEN
sudo chown -R maimemo:maimemo /opt/mcp-server-maimemo
sudo chmod 600 .env

sudo cp deploy/maimemo-mcp.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now maimemo-mcp
sudo systemctl status maimemo-mcp
```
