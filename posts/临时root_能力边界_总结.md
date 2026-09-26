---
title: '临时 root (Temproot) 能力边界分析'
date: 2026-08-12
---

# 临时 root (Temproot) 能力边界分析

## 什么是临时 root

临时 root 指通过内核漏洞（如 CVE-2019-2215）在不解锁 bootloader、不刷机、不修改系统分区的情况下，**在当前运行会话中**获得 root 权限。重启后恢复原状，不留持久痕迹。

## 已获得的能力

### 1. DAC 层面（Linux 传统权限）✅ 完全控制

| 能力 | 说明 |
|------|------|
| uid=0 (root) | 所有进程的 root 用户身份 |
| gid=0 | root 组 |
| 全部 38 种 capabilities | `CAP_DAC_OVERRIDE`, `CAP_SYS_ADMIN`, `CAP_NET_ADMIN` 等全部设置 |
| 任意进程操控 | 可通过 `ptrace` 附加任何进程（需 SELinux 允许） |
| 系统调用 | 所有系统调用均可执行（seccomp 已禁用） |

### 2. 内核层面（Kernel R/W）✅ 部分控制

| 能力 | 说明 |
|------|------|
| 任意内核内存读 | 通过 `addr_limit` 覆盖 + pipe 技巧，可读任意内核地址 |
| 任意内核内存写 | 同原理，可写任意内核地址（但受 hypervisor 保护的区域除外） |
| 修改进程 cred | 已实现：uid=0, gid=0, 所有 capabilities |
| 禁用 seccomp | 已实现 |
| 读 kallsyms 符号表 | 已实现（通过地址表直接读取） |
| 修改页表 | 理论上可行，但复杂高风险 |

### 3. 用户态权限 ✅ 有限

| 操作 | 能/不能 | 说明 |
|------|---------|------|
| 读 `/proc/` | ✅ | 大部分可读 |
| 读 `/sys/` | ✅ | 大部分可读 |
| 写 `/proc/sys/` | ❌ | SELinux 阻止 |
| 写 `/sys/fs/selinux/` | ❌ | SELinux 阻止 |
| 读 `/data/data/` | ❌ | SELinux 阻止 |
| 读 `/data/local/tmp/` | ❌ | 华为策略锁死 |
| 执行 `su` | ❌ | 无 su 二进制 |
| 执行 `chroot` | ⚠️ 可运行但无效 | 见下文 |
| 执行 `mount` | ⚠️ 部分受限 | SELinux 阻止重新挂载 |
| 加载内核模块 | ❌ | SELinux 阻止 |
| 持久化 root | ❌ | 重启后恢复 |

## 为什么 uid=0 + 所有 caps 还不够？

**SELinux 是 Mandatory Access Control (MAC)，与 DAC 是正交的。**

- DAC（Linux 传统权限）：基于 uid/gid，root 不受限
- MAC（SELinux）：基于安全上下文，**root 也受限制**

即使 uid=0 + 所有 capabilities，SELinux 仍然检查每个操作的权限。华为的 SELinux 策略对 `shell` 域（`u:r:shell:s0`）的限制极严，几乎所有敏感操作都拒绝。

## Chroot 为什么没用

### Chroot 的原理
`chroot` 改变当前进程的根目录（`/`），使进程无法访问新根以外的路径。

### 为什么对绕过 SELinux 无效
```
chroot /data/local/tmp/myroot /bin/sh
```

1. **SELinux 检查基于 inode，不基于路径**：即使换了根目录，文件系统仍然是同一个，inode 不变，安全上下文不变
2. **权限不继承**：新根里的文件依然有原来的 SELinux 标签（`u:object_r:app_data_file:s0`），`shell` 域依然没有权限
3. **`chroot` 需要的 /data 访问本身就被 SELinux 阻止**：连 `chroot` 的目标目录 `/data/local/tmp/` 都访问不了

### 唯一可能有用的场景
如果目标是**在一个不受 SELinux 限制的目录中运行程序**（比如 `/dev/` 下的 tmpfs），`chroot` 可以创建一个隔离环境，但在这个环境中也无法访问微信数据。

## 这个临时 root 能做什么有意义的事

### ✅ 可以做的
| 操作 | 说明 |
|------|------|
| 读 `/proc/` 内核信息 | 看进程列表、内存映射、内核符号等 |
| 读 `/sys/` 设备信息 | 看硬件信息、驱动状态 |
| 内核调试 | 通过 kallsyms 读取内核符号、dump 内核内存 |
| 修改进程权限 | 改任意进程的 uid/caps（但 SELinux 限制仍存在） |
| 部分硬件操作 | GPIO、I2C 等（需 SELinux 允许） |
| 内存取证 | 读取物理内存、进程内存 |

### ❌ 不能做的
| 操作 | 为什么 |
|------|--------|
| 读微信数据库 | SELinux 阻止 `/data/data/` 访问 |
| 提取应用数据 | 同上 |
| 永久 root | 重启后消失 |
| 解锁 bootloader | 需要 fastboot 模式，不受理 |
| 刷写系统 | 需要解锁 BL |
| 绕过 SELinux | 6 种方法均失败 |
| 加载内核模块 | SELinux 阻止 |
| 修改系统分区 | 只读挂载 + dm-verity |

## 技术原理：为什么华为的 SELinux 这么难绕

### 华为 HKIP（Hypervisor Kernel Integrity Protection）
- 在 EL2（超管理器）层面保护内核内存
- 关键 SELinux 数据结构（`selinux_pool`、`avc_node`、`ss_initialized`、`cred->security`）的页面通过**第二级页表**设为只读
- CPU 侧的写操作无法绕过，**只有 GPU DMA 写入可以绕过**（太复杂，未实现）

### 宏定义硬编码
- `selinux_enforcing` 是 `#define selinux_enforcing 1`（非变量），无法通过写内存禁用
- 这是 `CONFIG_SECURITY_SELINUX_DEVELOP` 未设置的结果

### 重启后随机化
- KASLR 每次重启改变内核基址
- 不能硬编码任何地址

## 结论

**临时 root 能提供 uid=0 + 所有 capabilities + 内核读写能力，但无法绕过华为设备的 SELinux 保护。** 在 SELinux 为 enforcing 且 `shell` 域被锁死的情况下，无法访问 `/data/data/` 下的应用数据。

**Chroot 等技术无法绕过 SELinux，因为 SELinux 基于 inode 标签，不基于路径。**

---

*文档编写日期：2026-08-12*
*设备：Huawei WAS-AL00 (Android 8.0.0)*
*漏洞：CVE-2019-2215 (binder UAF)*
