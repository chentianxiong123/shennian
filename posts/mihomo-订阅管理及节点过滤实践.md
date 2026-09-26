---
title: 'Mihomo 订阅管理及节点过滤实践'
date: 2026-07-22
---

# Mihomo 订阅管理及节点过滤实践

## 环境

- 设备：hi3798mv100（ARMv7，969MB RAM）
- 系统：Linux 4.4.35，Debian-based
- 内核：mihomo v1.19.3（systemd 管理）
- Web 面板：metacubexd

## 订阅管理方案

### 多配置切换

创建 `/usr/local/bin/proxy-switch`，管理两套配置：

```bash
proxy-switch lite   # 猎户座 + Pokemon66，78节点，~49MB
proxy-switch full   # 加 CHY 订阅（filter 后 ~200节点，~80MB）
```

原理：`cp` 对应配置到 `/etc/mihomo/config.yaml` 后 `systemctl restart mihomo`。

### 配置结构

```
/etc/mihomo/
├── config.yaml       # 当前激活配置
├── config-lite.yaml  # 精简版（仅两个主力订阅）
├── config-full.yaml  # 全量版（含 CHY）
├── proxies/          # 订阅节点缓存
├── ui/               # Web 面板
├── geoip.metadb      # GeoIP 数据库
└── GeoSite.dat       # GeoSite 数据库
```

## 订阅节点膨胀问题

### 现象

CHY 订阅返回 6133 个节点，其中：
- 精品节点（有解锁/受限标注）：**122 个**
- 免费公开节点（clashnodefree.com dump）：**5971 个**

免费 dump 节点来自公开代理聚合站，每天数千个，量大质杂。

### 分析：122 个精品节点构成

按服务器 IP 去重后：
- 120 台独立服务器
- 其中 37 台有"全能"节点（G+O 全解锁，出口含 AE/TW/JP/KR/SG/US/ID/RO）
- 83 台为受限节点（G 受限但 O 解锁）
- 仅 2 台服务器有重复端口，且无全能/受限混合情况

## 解决方案：mihomo 内置 filter

无需第三方工具，直接在 `proxy-provider` 配置中添加过滤规则：

```yaml
proxy-providers:
  CHY:
    type: http
    url: "https://example.com/sub"
    interval: 86400
    filter: "解锁|受限"           # 只保留带标注的精品节点
    exclude-filter: "clashnodefree"  # 排除免费 dump
```

mihomo 拉取订阅后自动按节点名过滤，**5971 个垃圾节点直接丢弃**，更新时自动重新过滤。

### filter 机制说明

- `filter`：保留节点名匹配正则的节点
- `exclude-filter`：排除节点名匹配正则的节点
- 两者可同时使用
- 支持 `|` 分隔多个正则

## 性能参考

| 模式 | 节点数 | mihomo RSS | 说明 |
|------|--------|-----------|------|
| lite | 78 | ~49MB | 猎户座+Pokemon66 |
| full（无 filter） | 6133 | ~193MB | 含免费 dump |
| full（有 filter） | ~200 | ~80MB | 仅精品节点 |

mihomo 内存大头在 Go runtime + geoip 数据库，节点本身开销约 250KB/个。

## 资源优化技巧

```yaml
find-process-mode: off      # 关掉进程发现，省 CPU
disable-keep-alive: true    # 关 keepalive，省连接
sniffer:
  enable: false             # 关嗅探，省资源
log-level: silent           # 关日志
```

## 其他踩坑

### HiSilicon BSP 日志风暴

HiSilicon 芯片驱动在内核态写日志到 USB 磁盘，导致 D 状态线程堆积、load average 高达 6.x。

禁用方法（已写入 `/etc/rc.local`）：

```bash
echo 'storepath=' > /proc/hisi/msp/log  # 清空存储路径
# 所有模块设 FATAL 级别
cat /proc/hisi/msp/log | grep -E '^HI_|^jpeg|^ca|VSYNC|ASYNC' | \
  awk '{print $1}' | while read mod; do
    echo "${mod}=0" > /proc/hisi/msp/log 2>/dev/null
done
echo "0 4 1 7" > /proc/sys/kernel/printk  # 内核日志最小化
```

### 日志全面禁用

```bash
systemctl mask rsyslog
systemctl mask systemd-journald
```

## 相关文件

| 文件 | 用途 |
|------|------|
| `/etc/mihomo/config-full.yaml` | 全量配置（CHY 已配 filter） |
| `/etc/mihomo/config-lite.yaml` | 精简配置 |
| `/usr/local/bin/proxy-switch` | 配置切换脚本 |
| `/etc/rc.local` | 启动时禁用 BSP 日志 |
