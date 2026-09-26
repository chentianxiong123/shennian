---
title: '华为手机 Termux 开机自启动 sshd 记录'
date: 2026-08-01
---

# 华为手机 Termux 开机自启动 sshd 记录

> 2026-08-01 · 设备：POT-AL00a（EMUI 13 / Android 10 / 无 Root）
> 目标：手机重启后 `sshd` 自动监听 8022，`ssh huawei-phone` 即连即用

---

## 结论（可直接照做）

### 1. 安装
- Termux（F-Droid/GitHub 版）+ Termux:Boot 0.8.1，两个 APK 必须**同一签名**（termux-boot 才能执行脚本）

### 2. 华为设置（必须对 Termux 和 Termux:Boot 两个应用都做）
- **电池优化**：设置 → 应用和服务 → 权限管理 → 右上角「特殊访问权限」→ 电池优化 → 显示「所有应用」→ 分别设为「不允许」
- **应用启动管理**：设置 → 应用和服务 → 应用启动管理 → 分别点开 → 关闭「自动管理」→ 手动管理三个开关全开（允许自启动 / 允许关联启动 / 允许后台活动）
- **网络**：设置 → 电池 → 更多电池设置 → 休眠时始终保持网络连接 → 开启
- **最近任务**：Termux 和 Termux:Boot 各自下拉加锁

### 3. 开机脚本 `~/.termux/boot/start-sshd.sh`

```sh
#!/data/data/com.termux/files/usr/bin/sh
{
echo "=== boot $(date) ==="
/data/data/com.termux/files/usr/bin/sshd -D -p 8022
} >> /data/data/com.termux/files/home/boot.log 2>&1
```

要点：
- 必须 **绝对路径**（Android 10+ 开机时无 Termux 环境变量，相对路径会找不到命令）
- `sshd -D` **前台模式**：防止 TermuxService 无通知被杀导致 sshd 存活不了（Termux issue #4657）
- `chmod 755`
- 脚本在 `~/.termux/boot/` 下，目录不存在需 `mkdir -p ~/.termux/boot`

---

## 排查过程与根因

### 症状
- 开机后 `com.termux.boot` 进程能启动、JobScheduler 也有调度记录，但脚本**不执行**（boot.log 无新增、8022 不监听）

### 根因（两层）
1. **华为开机把 `com.termux` 主应用标记为 `stopped=true`**
   - 判断：`dumpsys package com.termux | grep stopped=`
   - termux-boot 0.8.1 **自己不执行脚本**，它只是 BootReceiver → BootJobService → `startForegroundService` 转发 intent 给 `com.termux` 的 TermuxService 来跑脚本（见 BootJobService.java 源码）
   - Android 中 stopped 应用收不到任何隐式 intent → 转发被丢弃 → 脚本永不执行
2. **手机管家设置没真正覆盖/保存** → 手动管理三开关全开 + 电池优化不允许后解决

### 关键验证手段
- `dumpsys package <pkg> | grep stopped=`：看是否 stopped
- `dumpsys jobscheduler | grep termux`：看 BootJobService job 是否调度、卡在哪个约束（曾见 `WITHIN_QUOTA` 未满足）
- `run-as com.termux cat ~/boot.log`：确认脚本是否执行（注意 adb shell 嵌套引号会被吞，用 base64 或 `/data/local/tmp` 中转写文件）
- `am start -n com.termux/.app.TermuxActivity`：解除 stopped、拉起主进程（曾用它让 job 立即执行成功，反向证实根因）

### 排除的坑（供参考）
- 无 Root 设备 `/data/data/com.termux/files/**` 只能 `run-as com.termux` 或 ssh 写入，adb shell 直写 Permission denied
- `cmd package set-stopped-state` 在 Android 10 不存在
- RIO-UL00（EMUI 4.1）曾因 hwPfwService 强制停止第三方应用彻底无解，此方案适用于 EMUI 10+（POT-AL00a）

---

# RIO-UL00（EMUI 4.1 / Android 6.0.1 / arm64）开机自启动 sshd

> 2026-08-01 · 设备：RIO-UL00（EMUI 4.1 / Android 6 / 无 Root）
> 目标：手机重启后 `sshd` 自动监听 8022，`ssh huawei-phone-1` 即连即用
> 状态：✅ 已验证成功

## 与 POT-AL00a 的关键差异
- **POT（EMUI 13）**：手机管家「应用启动管理」手动管理三开关全开 + 电池优化「不允许」即可
- **RIO（EMUI 4.1）**：**必须用手机管家「受保护应用」列表**（受保护=常驻内存/白名单），仅设启动管理不够。pfw（`hwPfwService`）开机 `StopPackagesThread` 会硬性 force-stop 第三方应用，只有把 Termux 加入受保护列表才会跳过
- 验证 pfw 生效：`logcat -d | grep HsmCacheData` 看到 `com.termux_1, com.termux.boot_1`（`_1` = 已加入白名单/受保护）；之前未配置时是 `forceStopPkg com.termux`

## RIO 特有注意事项
- **Termux 版本**：0.119.0-beta.3（versionCode 1022，minSdk 21，targetSdk 28）+ termux-boot 0.8.1，用 `pm install --user 0 -t` 绕过华为安装拦截
- **UID**：重装后 UID 10095 = `u0_a95`（`~/.ssh/config` 的 User 要对应）
- **ssh 别名**：`huawei-phone-1`（192.168.31.200:8022，User u0_a95，密钥免密已配）
- **Termux 启动自检**：`pidof com.termux` / `ps | grep u0_a95`，Android 6 的 `ps -A | grep` 可能匹配不到，用 `ps | grep` 或 `pidof`
- **`ss -tln` 在 adb shell 下不显示 8022**（权限受限），验证监听用 `pidof sshd` + 实际 SSH 连接更可靠
- boot.log 因 adb 权限读不到，走 `ssh huawei-phone-1 cat ~/boot.log`

## 开机脚本 `~/.termux/boot/start-sshd.sh`（与 POT 相同）
```sh
#!/data/data/com.termux/files/usr/bin/sh
echo "=== boot $(date) ===" >> /data/data/com.termux/files/home/boot.log
/data/data/com.termux/files/usr/bin/sshd -D -p 8022 >> /data/data/com.termux/files/home/boot.log 2>&1
```
`chmod 755`，目录 `~/.termux/boot/` 不存在需先 `mkdir -p`

## 验证结果（RIO）
- 重启后 `com.termux`（PID ~3654）+ `com.termux.boot`（PID ~3611）均在运行
- 进程链：`/usr/bin/sh → sshd → sshd → bash`（boot 脚本执行 + 已接受连接）
- `timeout 8 ssh -o StrictHostKeyChecking=no huawei-phone-1 echo SSH_AUTOSTART_OK` → `SSH_AUTOSTART_OK`
- boot.log：`=== boot Sat Aug 1 20:55:31 CST 2026 ===`

---

## 验证结果
- 重启后：`com.termux` + `com.termux.boot` 均启动，`sshd` 进程自动运行，8022 监听
- `timeout 10 ssh -o StrictHostKeyChecking=no huawei-phone echo OK` → 直接连上

---

## 相关文件
- 电脑侧 SSH 配置：`~/.ssh/config` → `huawei-phone`（192.168.31.253:8022，User u0_a34）
- 手机侧：`/data/data/com.termux/files/home/.termux/boot/start-sshd.sh`、`~/boot.log`
