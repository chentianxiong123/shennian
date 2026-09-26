---
title: 'Android 手机跑 Linux 服务折腾记录'
date: 2026-06-28
---

# Android 手机跑 Linux 服务折腾记录

## 背景
- 手机：运行随身WiFi（Symmetric NAT），只能 Relay
- 电脑：家宽（192.168.31.x）
- 无 Root
- 手机流量有限
- 目标：手机作为分布式微服务的一个节点，跑 AI API 中转站

---

## 网络方案：EasyTier

### 安装
- Windows 端：`D:\devtools\easytier-gui\easytier-gui.exe` v2.6.4
- 网络名：`daqingda` / 密码：`daqingda`
- 虚拟 IP：`192.168.123.1/24`，MTU 1360
- 虚拟网卡：`et_4_pdoc`

### 公共服务器
`public.easytier.top` / `public.easytier.cn` DNS 解析失败，改用社区服务器：
- `et.gbc.moe:11010`
- `easytier.weiai.org.cn:11010`
- `boi.de5.net:11010`
- `ros.scpsl.com.cn:11010`

### 相遇
- 电脑 DHCP：`192.168.123.1`
- 手机 IP：`192.168.123.2`
- 延时：128-150ms（Relay），8ms（同局域网）
- 手机 Symmetric NAT → 只能 Relay，无法 P2P

### 已知问题
- **SOCKS5 无TUN模式在 Android 上不工作**（v2.6.4，Issue #1825）
- 单VPN槽冲突：EasyTier 占VPN位，Clash不能同时用

---

## 手机容器方案对比

| 方案 | 原理 | Docker? | Root? | 体积 | 性能 | 管理 |
|------|------|---------|-------|------|------|------|
| **❶ Termux + proot-distro** | ptrace 模拟 chroot | ❌ | ❌ | ~200MB | 好（~5%开销） | PM2 / 手动 |
| **❷ Termux 直接跑** | 原生编译 | ❌ | ❌ | 最小 | 最好 | 手动 |
| **❸ Podroid** | QEMU 虚拟机 | ✅ | ❌ | ~314MB APK | 中等（虚拟化） | Docker + Portainer |
| **❹ Termux + chroot** | 内核 chroot | ❌ | ✅ | ~200MB | 好 | 手动 |
| **❺ Linux Deploy** | chroot 自动化 | ❌ | ✅ | ~200MB | 好 | Web |
| **❻ VMOS Pro / 光速** | 闭源容器 | ❌ | ✅ | 1GB+ | 中等 | 有UI |

### 最终选择：方案❶ proot-distro
- 不需要 Root
- 最轻量
- 跑轻量服务足够
- glibc 兼容

---

## 最终部署方案

```
手机
└── Termux（安卓终端模拟器）
    └── proot-distro（非Root Linux 容器管理器）
        └── Ubuntu 26.04 LTS（完整 Linux 环境）
            └── One API v0.0.0（AI API 中转站）
                └── PM2（进程守护管理）
```

### 部署命令

```bash
# 1. 安装 Termux（F-Droid 或 GitHub）
# https://f-droid.org/packages/com.termux/

# 2. 装 proot-distro 和 Ubuntu
pkg update && pkg upgrade -y
pkg install proot-distro -y
proot-distro install ubuntu

# 3. 进 Ubuntu，下载 One API
proot-distro login ubuntu
apt update && apt install curl -y
curl -L -o ~/one-api https://github.com/songquanpeng/one-api/releases/download/v0.6.10/one-api-arm64
chmod +x ~/one-api

# 4. 装 PM2 管理进程
apt install npm -y
npm i -g pm2
pm2 start ~/one-api --name one-api -- --port 3000
pm2 save

# 5. 测试访问
# http://192.168.123.2:3000
# 默认账号/密码：root / 123456
```

### 常用命令

```bash
# 进 Ubuntu
proot-distro login ubuntu

# 回 Termux
exit

# 看服务日志
pm2 logs

# 重启服务
pm2 restart one-api

# 看进程
pm2 list 或 pm2 monit
```

---

## 反思

1. **手机不擅长重型服务** — 分布式微服务的重型组件（DB、消息队列）放VPS或PC
2. **随身WiFi网络不稳定** — 手机适合跑轻量、可中断、非核心服务
3. **管理体验** — proot-distro 没有 systemd，没有 Docker，管理靠 PM2，够用但不优雅
4. **如果需要更强** — 换 Podroid，Docker + Portainer 和服务器一样
5. **SSH 超时会断** — 必须用 PM2 或 nohup 保持后台运行