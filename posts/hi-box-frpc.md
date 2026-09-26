---
title: 'hi-box frpc 部署记录'
date: 2026-08-14
---

# hi-box frpc 部署记录

## 环境

| 项目 | 值 |
|------|-----|
| 设备 | Hi3798MV100 ARMv7 盒子 |
| 系统 | Linux 4.4.35_ecoo_81082668 |
| 架构 | armv7l |
| 内存 | 969MB |
| SSH | 192.168.31.82:10022 root |

## 最终方案

- **frpc 版本**：`v0.51.0`（fatedier/frp 原版）
- **下载**：`https://github.com/fatedier/frp/releases/download/v0.51.0/frp_0.51.0_linux_arm.tar.gz`
- **路径**：`/usr/local/bin/frpc`
- **配置**：`/etc/frp/frpc.ini`

## 配置文件 /etc/frp/frpc.ini

```ini
[common]
user = s-01ogflx98b77n6
token = x98bh84xjgvq492tsphxzpkn3nq777n6

tls_enable = false
disable_custom_tls_first_byte = false

server_addr = frp-oil.com
server_port = 8088

[mcserver]
type = tcp
local_ip = 127.0.0.1
local_port = 25565
remote_port = 13027
```

## 系统服务

`/etc/systemd/system/frpc.service`：

```ini
[Unit]
Description=frpc client
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/frpc -c /etc/frp/frpc.ini
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

## 踩坑记录

### 坑 1：frp-oil.com 是 SakuraFrp 服务器，标准 frp 能用

之前误以为 frp-oil.com 用自定义协议，标准 frpc 连不上。实际 SakuraFrp 是基于原版 frp v0.51.0 改的，保留了 `token` 字段的兼容性。

### 坑 2：字段名用错

| 错误写法 | 正确写法 |
|----------|----------|
| `auth.token` | `token` |
| `authentication_token` | `token` |

frp v0.51.0 和 SakuraFrp 服务器都认 `token`。`authentication_token` 是后来 frp 改的字段名，SakuraFrp 服务器不认。

### 坑 3：SakuraFrp 定制 frpc 不需要

`v0.51.0-sakura-14` 的定制 frpc 在盒子上跑不了（内核 4.4.35 带下划线，Go runtime 崩溃）。但原版 `frp v0.51.0` 的 frpc 可以跑，而且配置 `token` 字段也能连上 frp-oil.com。

### 坑 4：下载

从盒子 curl 下载 GitHub 超时。最终方案：
- 本地电脑挂代理下载：`curl -x http://192.168.31.82:7890`
- `scp` 传到盒子
- 解包取 `frpc`

## 验证

```bash
frpc -v          # 应输出 0.51.0
systemctl status frpc  # 应 active (running)
```

连接验证：从外网访问 `frp-oil.com:13027` 应能到盒子的 `127.0.0.1:25565`（Minecraft）。