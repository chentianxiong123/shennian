---
title: 'Flyme 官方 root 开启 ADB TCP 方案'
date: 2026-07-03
---

# Flyme 官方 root 开启 ADB TCP 方案

## 问题

Flyme 官方 root 的 `su` 运行在 `u:r:shell:s0` 上下文，无法直接控制 adbd：
- `ctl.restart adbd` — 需要 init 上下文，shell 无权
- `stop/start adbd` — adbd 是 oneshot 服务，shell 拉不起来
- 直接写 `/dev/socket/adbd` — 内部传输接口，不接受用户命令
- ADB 协议帧 — 连接即断（EOF）

## 解决方案：sys.usb.config 切换法

```
APP → su → 脚本
  ├── setprop service.adb.tcp.port 5555
  ├── setprop sys.usb.config none    ← init 监听到变化
  ├── sleep 1
  └── setprop sys.usb.config adb     ← init 再次监听到
                                        ↓
                                  init 执行 on property 触发器
                                  ├── stop adbd
                                  └── start adbd  ← init 有权限！
                                        ↓
                                  新 adbd 读到端口
                                  → TCP 5555 开放 ✓
```

### 关键原理

`sys.usb.config` 是 Android 系统属性，init 进程会监听它的变化。当值变为 `adb` 时，init.rc 中定义的触发器被执行：

```
on property:sys.usb.config=adb && property:sys.usb.configfs=0
    start adbd
```

因为 **init 自己执行 `start adbd`**，不受 SELinux 上下文限制，adbd 正常启动并读取 `service.adb.tcp.port` 属性。

### 对比直接 `ctl.restart`

| 方法 | 执行者 | SELinux 上下文 | 结果 |
|------|:------:|:--------------:|:----:|
| `setprop ctl.restart adbd` | shell | u:r:shell:s0 | 拒绝 |
| `sys.usb.config=adb` 触发器 | init | u:r:init:s0 | 允许 ✓ |

## 部署

### 脚本 `/data/local/flyme_adb.sh`

```sh
#!/system/bin/sh
setprop service.adb.tcp.port 5555
setprop sys.usb.config none
sleep 1
setprop sys.usb.config adb
```

### 开机自启 APP

编译 ADB Boot Helper APK（BootReceiver + 前台服务），安装后打开一次授权 su：

```
打开 APP → 授权 su → ADB TCP 即刻开启 ✓
重启后：BootReceiver → 前台服务 → 15秒后执行脚本 → TCP 自启 ✓
```

### 验证

```sh
adb connect <设备IP>:5555
adb devices
```

## 注意

- 切换 `sys.usb.config` 会短暂断开 USB 连接（系统播放断开声），属于正常现象
- Flyme 官方 root 的授权记忆可能不覆盖后台 BroadcastReceiver，依赖前台服务保持生命周期