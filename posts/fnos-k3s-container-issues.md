---
title: 'fnOS 内核 Bug 导致 k3s 容器问题分析报告'
date: 2026-09-01
---

# fnOS 内核 Bug 导致 k3s 容器问题分析报告

## 日期
2026-09-01

## 环境

| 节点 | IP | 内核 | k3s | containerd |
|------|----|------|-----|------------|
| fnos | 192.168.31.182 | 6.18.18.c952-**trim** (fnOS 自定义) | v1.36.4+k3s1 | 2.3.4-k3s1.36 |
| laptop | 192.168.31.204 | 6.12.95+deb13-amd64 (标准 Debian) | v1.36.4+k3s1 | 2.3.4-k3s1.36 |

**两个节点 containerd 版本完全一致**，问题出在 fnOS 自定义内核。

---

## Bug 1: containerd sandbox resolv.conf 权限被锁为 0700

### 现象
k3s 在 fnOS 上创建的 containerd sandbox `resolv.conf` 权限为 `0700`（仅 root 可读），标准 Debian 上正常为 `0644`。

```
# fnOS 节点
-rwx------ 1 root root 110 .../sandboxes/<id>/resolv.conf

# 标准 Debian 节点
-rw-r--r-- 1 root root 107 .../sandboxes/<id>/resolv.conf
```

### 影响
- 所有以非 root 用户运行的 Go 服务（`CGO_ENABLED=0`）DNS 解析失败
- Go 内置 DNS 解析器读 `/etc/resolv.conf` → Permission denied → 回退到 `[::1]:53`
- 数据库连接失败 → 服务 CrashLoopBackOff
- **注意：admin 是 nginx 静态前端，不连数据库，所以不崩溃**

### 排除过程
1. ❌ kubelet umask 设置 → 设为 0022 后无效
2. ❌ containerd 1.7.29 CVE-2024-25621 → 两个节点都是 containerd 2.3.4，排除
3. ❌ containerd CRI 源码 → 源码中 resolv.conf 用 0644 创建，排除代码问题
4. ❌ k3s umask wrapper → 改 umask 后无效，containerd 显式 chmod
5. ✅ **根因确认：fnOS 自定义内核修改了文件创建后的权限位**

### 临时修复
定时任务每 5 秒 chmod 644 所有 sandbox resolv.conf：
```bash
# /usr/local/bin/fix-vol1-perms.sh 中新增
find /var/lib/rancher/k3s/agent/containerd/io.containerd.grpc.v1.cri/sandboxes \
  -name "resolv.conf" -perm 0700 -exec chmod 644 {} \; 2>/dev/null
```

---

## Bug 2: redis 容器 CreateContainerError（system.trim_acl xattr）

### 现象
redis pod 无法启动：
```
Error: failed to create containerd container: taking runtime copy of volume:
failed to copy xattrs: failed to get xattr "system.trim_acl"
on /tmp/ctd-volume*/data: operation not supported
```

### 分析
- 根分区 `/dev/sda2`（ext4）**没有** `trimacl` 挂载选项
- `/vol1` 分区（ext4）**有** `trimacl` 挂载选项
- containerd 使用 `/tmp`（根分区）作为临时 volume 存储
- 创建容器时复制 xattr，内核在不支持 trimacl 的分区上尝试操作 `system.trim_acl` → 失败

### 临时修复
等待飞牛内核修复，或尝试：
```bash
mount -o remount,trimacl /   # 给根分区加上 trimacl 支持
```

---

## Bug 3: /vol1 权限被内核置 000（已知问题）

### 现象
容器操作（k3s 调度）触发内核 umount 冲突检测后，`/vol1` 权限被锁为 `000`，k3s 节点 NotReady。

### 临时修复
```bash
chmod 644 /vol1
# 或通过 systemd timer 持续修复
```

---

## 根因总结

fnOS 自定义内核 `6.18.18.c952-trim` 的 ext4 补丁存在以下问题：

1. **文件权限锁死**：容器操作触发 umount 冲突检测后，内核错误地修改新建文件的权限位（resolv.conf → 0700，/vol1 → 000）
2. **trimacl xattr 不完整**：内核的 trimacl 补丁在不支持 trimacl 的文件系统上仍尝试操作 `system.trim_acl` xattr

对比：标准 Debian 内核（laptop 节点）无此问题，两个节点 containerd 版本完全一致。

---

## 提交的 Issue

| 项目 | Issue | 状态 |
|------|-------|------|
| k3s | [#14563](https://github.com/k3s-io/k3s/issues/14563) | open |
| containerd | [#14078](https://github.com/containerd/containerd/issues/14078) | **已关闭**（确认不是 containerd 问题） |
| fnOS | [ophub/fnnas#649](https://github.com/ophub/fnnas/issues/649) | open |
| 飞牛论坛 | [club.fnnas.com #42361](https://club.fnnas.com/forum.php?mod=viewthread&tid=42361) | open |

---

## 当前状态（2026-09-01）

| 服务 | 状态 |
|------|------|
| k3s 两个节点 | ✅ Ready |
| 所有 Go 后端服务 | ✅ Running（initContainer 兜底 resolv.conf） |
| redis | ❌ CreateContainerError（xattr 问题） |
| 飞牛 nginx 管理面板 | ✅ 正常 |
| resolv.conf 修复 | ✅ timer 持续修复 |

## 待办

1. 等待飞牛发布修复内核
2. 修复 redis xattr 问题（需要 `mount -o remount,trimacl /` 或等内核修复）
3. 内核修复后移除 initContainer workaround 和 timer
