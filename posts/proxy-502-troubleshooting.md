---
title: '局域网代理 502 问题排查文档'
date: 2026-08-14
---

# 局域网代理 502 问题排查文档

> 日期：2026-08-14
> 环境：a1（Debian 13）+ hi-box（192.168.31.82，mihomo + cpa）
> 涉及组件：pi（coding-agent）、opencode、mihomo（7890）、cli-proxy-api / cpa（8317）

---

## 问题现象

opencode 通过 cpa（http://192.168.31.82:8317）连接时报：
```
AI_APICallError: Bad Gateway
Bad Gateway [retrying in 2s attempt #2]
```

## 排查经过

### 第一层排查：cpa 本身是否正常

- `ssh hi-box "curl http://127.0.0.1:8317/v1/models"` → **HTTP 200**，cpa 自身正常
- cpa 配置中 `deepseek-v4-flash` 映射了 4 个上游，round-robin 轮询
  - `sensenova` / `api.pie-xian.com` / `opencode.ai` / **`yjjhwjw.com`**
- `yjjhwjw.com` **完全不可达**，cpa `request-retry: 2` + `max-retry-interval: 30`，
  每次轮询到它卡 30 秒 × 3 次 = 90 秒 → 超时 → opencode 报 502

**阶段方案**：禁用 yjjhwjw（已解决）

### 第二层排查：opencode 配置字段名错误

- opencode 配置文件写的是 `"provider"`（单数），但实际读的是 `"providers"`（复数）
- 导致 `opencode debug config` 输出 providers 为空 `{}`
- 但 opencode 运行时仍然尝试用 cpa，因为运行时可能从其他路径加载

**修正**：改为 `"provider"`（查了 JSON Schema 后确认 opencode 1.18.16 用的是单数 `provider`）

### 第三层排查：Node.js 不支持 CIDR 格式的 NO_PROXY

这是**根本原因**。

- `~/.bashrc` 和 `~/.profile` 中设置了 `NO_PROXY="192.168.0.0/16"`
- **curl 8.14 支持 CIDR** → curl 能绕过代理直连 → HTTP 200
- **Node.js/undici 不支持 CIDR** → Node.js 认为 192.168.31.82 不在 NO_PROXY 中 → 流量被发到代理 7890
- 但代理 7890 此时已挂 → 连接失败 → **HTTP 000 / 502**

这就是为什么 curl 通了但 opencode（Node.js 应用）不通。

**阶段方案**：把 `NO_PROXY` 改成精确 IP `192.168.31.82`

### 第四层排查：systemd 用户会话固化了旧环境变量

- 改了 `.bashrc`/`.profile` 后仍然不通，因为 systemd user manager 在登录时就固化了环境变量
- `systemctl --user show-environment` 仍显示旧的 `NO_PROXY=192.168.0.0/16`
- 所有新进程（包括 pi agent、opencode）都继承这个固化环境

**修正**：
```bash
systemctl --user set-environment NO_PROXY="..."
```

### 第五层排查：gsettings 代理模式

- `gsettings get org.gnome.system.proxy mode` 返回 `'manual'`
- 某些图形应用可能从这里读取代理配置
- 虽然 opencode 是 TUI 不读这个，但保持环境一致是必要的

---

## 最终一劳永逸方案

**核心思路：让 mihomo 代理自己负责路由判断，客户端不用管 NO_PROXY。**

在 hi-box 的 mihomo 配置中，在 rules 最前面加局域网直连规则：

```yaml
rules:
  - 'IP-CIDR,192.168.0.0/16,DIRECT,no-resolve'
  - 'IP-CIDR,10.0.0.0/8,DIRECT,no-resolve'
  - 'IP-CIDR,172.16.0.0/12,DIRECT,no-resolve'
  - 'IP-CIDR,127.0.0.0/8,DIRECT,no-resolve'
  - 'GEOIP,CN,DIRECT'
  - ...
  - 'MATCH,ALL'
```

这样：
1. 客户端（pi/opencode）**所有流量都发代理 7890**
2. mihomo 收到请求后检查目标 IP
3. 是局域网 → **DIRECT 直连**（不走 VPN，不绕圈）
4. 是外网 → 走代理

**好处**：
- 客户端 NO_PROXY 只写 `localhost,127.0.0.1` 即可
- 不再受 Node.js 不支持 CIDR 的限制
- 即使代理重启了，局域网流量仍然能被代理正确路由

---

## 最终文件清单

| 文件 | 关键内容 |
|------|----------|
| `/etc/mihomo/config.yaml`（hi-box） | rules 顶部加了 4 条 IP-CIDR 直连规则 |
| `~/.bashrc` | `NO_PROXY="localhost,127.0.0.1,192.168.*,10.*,172.16.*,*.cn"` |
| `~/.profile` | 同上 |
| `/mnt/shared/.opencode/opencode.json` | `provider.cpa` + `provider.sensenova-*` |
| `/mnt/shared/.pi/agent/models.json` | `cpa-001` provider + `sensenova` provider |
| `/mnt/shared/CPA/config.yaml`（hi-box） | `yjjhwjw` 已 `disabled: true` |

## 环境变量（systemd user）

```
http_proxy=http://192.168.31.82:7890
https_proxy=http://192.168.31.82:7890
ALL_PROXY=http://192.168.31.82:7890
NO_PROXY=localhost,127.0.0.1
```

## 故障快速恢复命令

```bash
# hi-box 重启 mihomo
ssh hi-box "systemctl restart mihomo"
# hi-box 重启 cpa
ssh hi-box "kill \$(pgrep cli-proxy-api); sleep 1; /usr/local/bin/cli-proxy-api -config /mnt/shared/CPA/config.yaml &"
# a1 更新 systemd 环境
systemctl --user set-environment http_proxy=http://192.168.31.82:7890 https_proxy=http://192.168.31.82:7890 ALL_PROXY=http://192.168.31.82:7890 NO_PROXY=localhost,127.0.0.1
# a1 清当前 shell
unset http_proxy https_proxy ALL_PROXY all_proxy NO_PROXY no_proxy
```

---

## 经验教训

1. **curl 通 ≠ Node.js 通**。Node.js 的 proxy/undici 实现与 curl 对 `NO_PROXY` 的解析规则不同（不支持 CIDR）
2. **systemd 用户会话固化环境变量**。改 `.bashrc` 不够，必须用 `systemctl --user set-environment`
3. **代理挂了的表象是 502**，不是 connection refused，容易误判为上游问题
4. **一劳永逸 = 让代理层做路由决策**，不要让客户端猜