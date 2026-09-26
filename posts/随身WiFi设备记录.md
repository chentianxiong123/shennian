---
title: 'ZTE 4G LTE 随身 WiFi 探索记录'
date: 2026-06-30
---

# ZTE 4G LTE 随身 WiFi 探索记录

> 设备标识: Punguin_Uz901  
> 硬件: 展讯 TSP ZX297520V3  
> CPU: ARMv7 Cortex-A53 (单核)  
> RAM: 21MB (+ 12MB zram)  
> Flash: 8MB (6个 MTD 分区)  
> 系统: 精简嵌入式 Linux (Linux 3.4.110 RT)  
> 连接方式: ADB (USB)

---

## 设备定位

这是一台 **ZTE 4G LTE WiFi 热点棒**（随身 WiFi / MIFI），不是 Android 设备。拆开就是一个小 U 盘大小的 4G 上网卡 + WiFi 热点。

### 运行中的服务

| 进程 | 用途 |
|---|---|
| `zte_ufi` | 4G 拨号主程序 |
| `goahead` | Web 管理界面 (端口 80) |
| `hostapd` | WiFi 热点 |
| `dnsmasq` | DHCP + DNS (端口 53) |
| `udhcpd` | DHCP 服务器 |
| `at_server` | AT 指令服务 (端口 9090) |
| `adbd` | ADB 调试接口 (端口 5037) |
| `/bin/qrzl_app` | 未知应用 |

### 分区布局

| 分区 | 大小 | 用途 |
|---|---|---|
| mtd0 (zloader) | 32KB | 引导加载器 |
| mtd1 (nvrofs) | 224KB | 网络配置 (只读) |
| mtd2 (uboot) | 160KB | U-Boot |
| mtd3 (imagefs) | 4.2MB | 固件镜像 (只读 jffs2) |
| mtd4 (rootfs) | 3.1MB | 根文件系统 (只读 squashfs) |
| mtd5 (userdata) | 384KB | 用户数据 (jffs2, 240KB 空闲) |

### 网络

- 4G 网: `wan1` — IP 10.124.131.241 (运营商 CGNAT，非公网)
- WiFi 网: `br0` — IP 192.168.100.1/24 (热点局域网)

---

## 能力评估

### 能做

- 通过 ADB 推送文件到 `/tmp` 或 `/mnt/userdata`
- 运行静态编译的 ARMv7 二进制文件
- 可安装一个纯 HTTP 转发代理（C + musl 编译，~15-30KB）
- 可建立出站连接（TCP/UDP）

### 不能做

- 没有 ARM 交叉编译器（需要自行搭建）
- 不支持 TLS/SSL（openssl 太大，装不下）
- 没有 USB gadget 驱动，无法改变 USB 模式
- 不支持 Python/Lua/PHP 等脚本语言
- 无法直接暴露端口到公网（CGNAT）
- 运行中内容无法持久化到重启后（/tmp 是 tmpfs）

### 限制

| 项目 | 值 |
|---|---|
| 空闲 RAM | ~6MB |
| 持久化空间 | 240KB (jffs2) |
| CPU | 单核 Cortex-A53，无 FPU |
| Libc | uclibc (非 glibc) |
| Shell | busybox ash (功能有限) |

---

## 结论

用来跑一个小型 HTTP 转发代理理论上可行（编译一个 15-30KB 的纯静态二进制），但有 TLS 指纹识别的方案塞不下（最低 500KB+）。由于无公网 IP，只能做出站连接，适合 tunnel/frp 类工具，不适合直接对外提供服务。