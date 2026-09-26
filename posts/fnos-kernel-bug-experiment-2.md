---
title: 'fnOS 内核 Bug 补丁实验记录'
date: 2026-09-01
---

# fnOS 内核 Bug 补丁实验记录

## 日期
2026-09-01（第二轮）

## 实验：尝试修复 redis CreateContainerError

### 目标
修复 redis pod 的 `system.trim_acl` xattr 错误：
```
Error: failed to create containerd container: taking runtime copy of volume:
failed to copy xattrs: failed to get xattr "system.trim_acl"
on /tmp/ctd-volume*/data: operation not supported
```

### 尝试方案
执行 `mount -o remount,trimacl /` 给根分区加上 trimacl 支持。

### 结果
**立刻触发 fnOS 内核 bug，SSH 断连，系统权限被锁坏。**

时间线：
1. `ssh fnos "mount -o remount,trimacl /"` → 返回 exit:0（成功）
2. 同一 SSH 会话中后续命令 `/usr/bin/mount` 报 Permission denied
3. SSH 连接断开，无法重连
4. 重启 fnos 后恢复正常

### 结论
- `mount -o remount,trimacl /` 会触发 fnOS 内核的 umount 冲突检测
- 内核随即把关键文件权限锁死（/root/.ssh/、/vol1 等）
- **任何涉及 trimacl 的 mount 操作都可能触发此 bug**
- redis 的 `system.trim_acl` 问题**目前无法修复**，只能等飞牛内核补丁

---

## 已清理的修补脚本

重启 fnos 后，已全部撤回之前部署的临时修复：

| 文件 | 状态 |
|------|------|
| `/usr/local/bin/fix-vol1-perms.sh` | ✅ 已删除 |
| `/usr/local/bin/k3s-start.sh` | ✅ 已删除 |
| `/etc/systemd/system/fix-vol1-perms.service` | ✅ 已删除 |
| `/etc/systemd/system/fix-vol1-perms-oneshot.service` | ✅ 已删除 |
| `/etc/systemd/system/fix-vol1-perms.timer` | ✅ 已删除 |
| `/etc/systemd/system/k3s.service.d/override.conf` (UMask=0022) | ✅ 已删除 |
| `deploy/k3s/base/backend.yaml` initContainer (fix-resolv) | ✅ 已移除 |

---

## 当前状态

### 集群
- fnos: Ready (6.18.18.c952-trim)
- laptop: Ready (6.12.95+deb13-amd64)

### 服务
- 所有 Go 后端服务：Running（**无 initContainer，正常运行**）
- redis master：CreateContainerError（xattr 问题，无法修复）
- redis replica：Running
- 飞牛 nginx 管理面板：正常

### 关键发现
1. 重启后 resolv.conf 权限正常（0644），Go 服务不需要 initContainer 也能正常运行
2. 内核 bug 需要时间触发——重启后不会立刻出现
3. `mount -o remount,trimacl /` 会**立即**触发 bug
4. k3s 重启后不会自动拉起，需要手动 `systemctl start k3s`

---

## 待办
1. 等飞牛发布修复内核
2. redis 问题等内核修复后自然解决
3. 考虑给 k3s 配置 `Restart=always` + `RestartSec=5` 确保自动恢复
