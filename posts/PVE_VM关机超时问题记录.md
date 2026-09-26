---
title: 'PVE VM 关机超时问题记录'
date: 2026-09-03
---

# PVE VM 关机超时问题记录

## 现象

在 Proxmox VE (PVE) 上对 VM 执行 `qm shutdown` 或 `qm reboot` 时，长时间等待后报错：

```
TASK ERROR: VM quit/powerdown failed - got timeout
```

## 根本原因

### 1. 关机原理

- `qm shutdown` 是通过 ACPI 信号通知 Guest 操作系统优雅关机
- 如果 VM 没有安装/运行 `qemu-guest-agent`，则依赖 Guest 内部的 ACPI 处理
- 对于 **Ventoy 启动菜单** 或 **ISO 引导界面**，Guest 操作系统尚未加载，没有 ACPI 响应能力
- PVE 默认等待 **10 分钟** 后超时，返回上述错误

### 2. 相关配置

```
-qm shutdown 流程：
  1. 发送 ACPI 信号给 QEMU
  2. QEMU 尝试通过 virtio-guest-agent 或直接 ACPI 通知 Guest
  3. Guest OS 响应并执行关机
  4. 超时（默认 10 分钟）则报 "got timeout"
```

## 解决方案

| 场景 | 命令 | 说明 |
|------|------|------|
| VM 在 Ventoy/ISO 启动菜单（未装系统） | `qm stop 100` | 强制断电，等同拔电源 |
| VM 在重装系统过程中 | `qm stop 100` | 同上 |
| VM 已装好系统且已登录 | `qm shutdown 100` | 优雅关机，正常流程 |
| 需要强制重启 | `qm reset 100` | 等同于硬件复位 |

### 装好系统后补充

进入已安装的操作系统后，安装 `qemu-guest-agent`：

```bash
# Debian/Ubuntu
apt install qemu-guest-agent
systemctl enable --now qemu-guest-agent

# 配置 PVE VM 启用 agent
qm set <vmid> --agent enabled=1
```

安装后 `qm shutdown` 会通过 guest-agent 触发系统级关机，速度更快、更安全。

## 与停服操作无关

此问题与之前禁用 `corosync`、`pve-firewall` 等服务无关，是 PVE 的标准行为。

## 时间线

- 2026-09-03：重装 PVE 后多次触发此问题
- 根因：VM 在 Ventoy 引导界面执行 `qm shutdown`，Guest 无法响应
- 解决：改用 `qm stop` 强制断电

---
*记录日期：2026-09-03*
*PVE 版本：9.2.2 / Debian 13 (trixie)*
