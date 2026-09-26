---
title: '魅族 M5 Note Debian Chroot 折腾记录'
date: 2026-08-04
---

# 魅族 M5 Note Debian Chroot 折腾记录

> 设备: Meizu M5 Note (Flyme 7.0.1.0A, Android 7, API 24)
> SoC: MT6755 (Helio P10, ARM64)
> 内核: 3.18.35+
> root: `/system/xbin/su` (残血 su, `u:r:shell:s0`, SELinux Permissive)
> 日期: 2026-08-04

---

## 目录

1. [环境概览](#1-环境概览)
2. [第一个坑: rootfs 下载极慢](#2-第一个坑-rootfs-下载极慢)
3. [第二个坑: chroot 网络权限 (PARANOID_NETWORK)](#3-第二个坑-chroot-网络权限-paranoid_network)
4. [第三个坑: 安装 SSH 时依赖地狱](#4-第三个坑-安装-ssh-时依赖地狱)
5. [第四个坑: APK 安装失败 (USER_RESTRICTED)](#5-第四个坑-apk-安装失败-user_restricted)
6. [第五个坑: 普通 APK 收不到 BOOT_COMPLETED](#6-第五个坑-普通-apk-收不到-boot_completed)
7. [第六个坑: Flyme su 弹窗授权 vs 开机自启](#7-第六个坑-flyme-su-弹窗授权-vs-开机自启)
8. [第七个坑: APK 里执行 su 的方式](#8-第七个坑-apk-里执行-su-的方式)
9. [第八个坑: SSH PTY 分配失败](#9-第八个坑-ssh-pty-分配失败)
10. [最终方案总结](#10-最终方案总结)
11. [经验教训](#11-经验教训)

---

## 1. 环境概览

### 手机

- 魅族 M5 Note, Flyme 7.0.1.0A, Android 7
- 已 root (Flyme 设置里的残血 root, 需屏幕弹窗授权)
- Bootloader 锁定 (未解锁)
- `/system` 可挂载读写 (重启后修改保留, 已验证)
- `/data` 24G 空闲

### 电脑

- CPU: Ryzen 5 5500U
- OS: Debian 13
- Java: OpenJDK 21
- Android SDK: `/home/a1/.android-sdk/Sdk/build-tools/30.0.3` (只有 build-tools, 无 platforms)
- 补了 `platforms/android-30/android.jar` 后才可编译 APK

### 网络

- 手机 WiFi: 192.168.31.213
- 代理: 192.168.31.82:7890 (NAS 上的代理)
- 国内 GitHub 直连极慢 (50-100KB/s), 需代理或国内镜像

---

## 2. 第一个坑: rootfs 下载极慢

### 问题

PC 从 GitHub raw 下载 Anlinux 的 Debian ARM64 rootfs (78MB), 速度只有 50-100KB/s,
反复超时中断。同样的, LXC 镜像 (95MB) 也慢。

### 解决

1. 设置代理: `export http_proxy=http://192.168.31.82:7890`
2. 通过代理下载, 速度正常 (1-2MB/s), 约 1-2 分钟完成

### 经验

国内访问 GitHub raw 一定要走代理或镜像, 不要硬等。

---

## 3. 第二个坑: chroot 网络权限 (PARANOID_NETWORK)

### 问题

chroot 进 Debian 后, `apt update` 报错:

```
Could not create a socket for x.x.x.x (f=2 t=1 p=6) - socket (13: Permission denied)
```

但 `busybox wget` 可以正常下载。

### 原因

Android 内核启用了 `CONFIG_ANDROID_PARANOID_NETWORK` 补丁, 强制检查进程的 GID:

- **GID 3003 (inet)** → 允许创建 AF_INET/AF_INET6 socket
- 即使你是 root (UID=0), GID 不对也不行

chroot 继承父进程 (adb shell) 的 GID=2000 (shell), 没有 inet 组。

### 解决

参考 ZTE 盒子文档 (14_Android_Chroot网络权限解决方案.md):

1. 修改 `/etc/passwd` 中 root 的 GID 为 3003
2. 添加 `inet`(3003) 和 `net_raw`(3004) 组到 `/etc/group`
3. 用 `chroot ... /bin/su - root -c "命令"` 代替直接 chroot

```bash
sed -i 's/^root:x:0:0:/root:x:0:3003:/' /etc/passwd
cat >> /etc/group << EOF
inet:x:3003
net_raw:x:3004
root:x:0:root,inet,net_raw
EOF
```

### 验证

```bash
chroot /data/debian /bin/su - root -c "id"
# 期望: uid=0(root) gid=3003(inet) groups=3003(inet),0(root)
```

---

## 4. 第三个坑: 安装 SSH 时依赖地狱

### 问题

minbase rootfs 只有 220 个包, 没有 SSH。装 openssh-server 时发现 apt 无法联网
(见上一条), 只能手动下载 .deb 包。

### 错误尝试

1. 从 `deb.debian.org` 下载了 testing 版本 (10.4p1), 依赖 libc6 >= 2.38,
   但 rootfs 是 bookworm 的 libc6 2.36, 无法安装
2. 换 bookworm 版本 (9.2p1), 又缺 libwrap0, libnsl2, ucf, runit-helper 等
3. 手动一个个下载, 版本又不对 (libwrap0 7.6.q-37 需要 GLIBC_2.38)

### 最终解决

1. 修复 apt 网络后 (见第三条), 用 `apt --fix-broken install -y` 自动解决依赖
2. 关键: 先修网络, 再用 apt 本身安装, 别手动下载

### 经验

- 永远先修 apt 网络, 再让 apt 自己处理依赖
- 手动下载 .deb 时, 确认版本号匹配 (bookworm 的包在 deb.debian.org 已更新到需要新 glibc 的版本, 所以 rootfs 比较旧时会有问题)

---

## 5. 第四个坑: APK 安装失败 (USER_RESTRICTED)

### 问题

`adb install AutoBoot.apk` 报错:

```
INSTALL_FAILED_USER_RESTRICTED
```

即使 `pm install -r -d --user 0` 也失败。

### 原因

Flyme 限制了从 ADB 安装应用。需要用户在设置中开启「允许安装未知来源应用」。

### 解决

把 APK 放到 `/system/app/` 目录作为系统应用安装:

```bash
adb shell su 0 mount -o rw,remount /system
adb shell su 0 cp AutoBoot.apk /system/app/AutoBoot/
adb shell su 0 chmod 644 /system/app/AutoBoot/AutoBoot.apk
adb reboot
```

重启后 Android 自动扫描并安装系统应用。

### 注意

- 锁 BL 的 Flyme 修改 `/system` 分区后重启保留 (已验证)
- 但改 `/system/bin/install-recovery.sh` 可能因 dm-verity 被还原 (未验证)

---

## 6. 第五个坑: 普通 APK 收不到 BOOT_COMPLETED

### 问题

`adb install` 安装的 APK 收不到 `BOOT_COMPLETED` 广播, 即使 `am broadcast`
手动发送显示 `result=0`, 实际也没执行。

### 原因

Android 不给处于 `stopped=true` 状态的应用发送 BOOT_COMPLETED 广播。
`adb install` 安装的应用默认是 stopped 状态。

```bash
dumpsys package com.meizu.autoboot | grep stopped
# stopped=true notLaunched=true
```

### 解决

把 APK 放到 `/system/app/` 作为系统应用安装后, stopped=false, 广播正常接收。

---

## 7. 第六个坑: Flyme su 弹窗授权 vs 开机自启

### 问题

APK 收到 BOOT_COMPLETED 后, 调用 `Runtime.exec("su")` 需要 Flyme 的 su 授权弹窗。
开机时没人点「允许」, 命令静默失败。

### 解决

1. 先手动触发一次广播, 用户在屏幕上点「允许」(或「永久允许」)
2. Flyme 记住授权后, 下次开机不再弹窗
3. 或者把 APK 做成系统应用 (`/system/app/`), 系统应用执行 su 的权限行为不同

### 经验

Flyme 的残血 root 需要用户交互授权, 这是开机自启的最大障碍。
系统应用 + 首次手动授权后, 后续开机可自动执行。

---

## 8. 第七个坑: APK 里执行 su 的方式

### 问题

APK 需要执行 root 命令, 试了多种方式:

| 方式 | 结果 |
|------|------|
| `Runtime.exec("su -c cmd")` | 手机 su 不支持 -c 参数 |
| `Runtime.exec("sh -c \"echo cmd | su 0\"")` | exit code 0, 但命令没执行 |
| `Runtime.exec("/system/xbin/su", "0")` + stdin 写命令 | **成功** |

### 正确方式

```java
Process p = Runtime.getRuntime().exec(new String[]{"/system/xbin/su", "0"});
OutputStream os = p.getOutputStream();
os.write((cmd + "\n").getBytes());
os.write("exit\n".getBytes());
os.flush();
os.close();
p.waitFor();
```

等价于 shell 中的 `echo "cmd" | su 0`。

---

## 9. 第八个坑: SSH PTY 分配失败

### 问题

SSH 可以连接, 但报错:

```
PTY allocation request failed on channel 0
```

无法获得交互式终端。

### 原因

chroot 环境缺少正确的 `/dev/ptmx` 和 `/dev/pts` 挂载:

1. `/dev/pts` 未挂载 (devpts)
2. `/dev/ptmx` 不存在 (PTY 多路复用器)

### 解决

chroot 启动脚本中挂载:

```bash
mount -t devpts devpts /data/debian/dev/pts
mknod /data/debian/dev/ptmx c 5 2
chmod 666 /data/debian/dev/ptmx
```

### 验证

```bash
ssh root@192.168.31.213
# 应看到 bash 提示符, 可正常交互
```

---

## 10. 最终方案总结

### 架构

```
开机 → AutoBoot.apk (系统应用) → 5秒 → /data/autoboot.conf
  ↓
sh /data/autoboot/android.conf        ← Android 侧命令
  ├─ setprop + stop/start adbd        → ADB WiFi 5555
  └─ sh /data/autoboot/chroot.sh      → 挂载 chroot 环境
       ↓
chroot → /usr/local/bin/autoboot-hook.sh  → 读配置执行
       ↓
/etc/autoboot.d/*.conf                ← chroot 侧命令
  └─ sshd.conf: 启动 SSH
```

### 关键文件

| 文件 | 作用 |
|------|------|
| `/system/app/AutoBoot/AutoBoot.apk` | 开机自启 APK (系统应用) |
| `/data/autoboot.conf` | 入口配置, APK 读这个文件 |
| `/data/autoboot/android.conf` | Android 侧命令 |
| `/data/autoboot/chroot.sh` | 挂载 chroot 并触发内部钩子 |
| `/data/debian/usr/local/bin/autoboot-hook.sh` | chroot 侧钩子脚本 |
| `/data/debian/etc/autoboot.d/sshd.conf` | SSH 启动配置 |

### 使用方式

```bash
# SSH 连接
ssh root@192.168.31.213
# 密码: 123456

# 添加开机自启命令
echo "你的命令" >> /data/debian/etc/autoboot.d/xxx.conf

# 或添加 Android 侧命令
echo "你的命令" >> /data/autoboot/android.conf
```

---

## 11. 经验教训

1. **先查文档** — ZTE 盒子文档里已有 chroot 网络权限解决方案, 不要自己从头摸索
2. **不要手动下载 .deb** — 先修网络, 让 apt 自己处理依赖
3. **系统应用 vs 普通应用** — 普通 APK 收不到 BOOT_COMPLETED, 系统应用可以
4. **Flyme 的 su 行为特殊** — 不支持 `-c`, 只能用 stdin 管道
5. **PTY 不是自动有的** — chroot 里需要手动挂载 devpts 和创建 ptmx
6. **代理很重要** — 国内网络环境, 下载外部资源必须走代理
7. **测试后再优化** — 先跑通再压延迟, 不要一上来就追求完美
8. **锁 BL 不一定锁死** — 修改 `/system` 分区 (如 `/system/app/` 加 APK) 重启后保留