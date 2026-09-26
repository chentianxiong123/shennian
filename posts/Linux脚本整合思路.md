---
title: 'Linux脚本整合思路 - 从Windows转Linux的脚本折腾记录'
date: 2026-07-23
---

# Linux脚本整合思路 - 从Windows转Linux的脚本折腾记录

## 前言

从Windows转到Linux，最大的感受就是：**Windows开箱即用，Linux要写一大堆脚本**。

Windows上点点鼠标就能完成的事情，Linux上得自己写脚本。但这也是Linux的魅力所在——你可以完全掌控你的系统。

## 脚本整合思路

### 问题

刚开始写脚本时，所有脚本都扔在一个目录下，乱七八糟：

```
sh/
├── mount-box.sh
├── umount-box.sh
├── disable-sleep.sh
├── proxy.sh
└── ...越来越多
```

### 解决方案：按功能分目录，单一职责

```
sh/
├── proxy/
│   ├── proxy-on.sh      # 开启代理
│   ├── proxy-off.sh     # 关闭代理
│   └── proxy-status.sh  # 查看状态
├── sleep/
│   ├── sleep-disable.sh # 禁用休眠
│   ├── sleep-enable.sh  # 启用休眠
│   └── sleep-status.sh  # 查看状态
└── nfs/
    ├── nfs-mount.sh     # 挂载
    ├── nfs-umount.sh    # 卸载
    └── nfs-status.sh    # 查看状态
```

### 设计原则

1. **单一职责**：一个脚本只做一件事
2. **通知反馈**：用`notify-send`代替`echo`，不阻塞进程
3. **CLI优先**：脚本本身就是CLI，通知是附加的
4. **source vs 执行**：需要修改当前shell环境的用`source`，否则直接执行

## 通知 vs echo

### echo的问题

```bash
echo "代理已开启"
```

- 阻塞进程
- 终端关闭就看不到了
- 无法在图形界面看到

### notify-send的优势

```bash
notify-send "代理" "已开启" -i network-proxy
```

- 不阻塞进程
- 桌面右上角弹出通知
- 几秒后自动消失
- CLI和GUI都能用

## Linux vs Windows

| 方面 | Windows | Linux |
|------|---------|-------|
| 代理设置 | 图形界面点点 | 写脚本 |
| 休眠控制 | 控制面板 | systemd命令 |
| 网络挂载 | 自动发现 | mount脚本 |
| 开箱即用 | ✓ | ✗ |
| 完全掌控 | ✗ | ✓ |

## 常用技巧

### 1. 环境变量修改

需要`source`运行才能影响当前shell：

```bash
source proxy-on.sh  # 当前终端生效
./proxy-on.sh       # 只在子shell生效
```

### 2. 通知图标

```bash
notify-send "标题" "内容" -i network-proxy    # 代理图标
notify-send "标题" "内容" -i system-lock-screen # 锁屏图标
notify-send "标题" "内容" -i folder-remote      # 文件夹图标
```

### 3. sudo密码传递

```bash
echo '123456' | sudo -S mount -t nfs ...
```

## 总结

Linux就是要折腾。但折腾的过程也是学习的过程。当你写出一套完整的脚本体系，那种掌控感是Windows给不了的。

---

*写于 2026-07-23*
*系统: Debian Linux*
*桌面: KDE Plasma*
