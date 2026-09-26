---
title: 'Shell 脚本技巧笔记'
date: 2026-07-30
---

# Shell 脚本技巧笔记

## 1. 进程后台化

### easytier-core 的坑
- `-d` 是 `--dhcp`，不是 daemon！`--daemon` 才是后台守护模式
- 但 `--daemon` 有时不创建 tun 设备，**更可靠的做法**：

```bash
nohup sudo /path/to/binary [args] &>/dev/null &
disown
```

- `nohup` 防止 SIGHUP 断开时杀进程
- `&>/dev/null` 吞掉 stdout/stderr，避免管道阻塞
- `disown` 从 shell 任务列表移除，防止父 shell 退出时连带杀子进程

### 通用后台模式模板

```bash
nohup some_command &>/dev/null &
disown
```

## 2. .desktop 文件 + 通知

### notify-send 从 .desktop 启动时可能不弹
- `Terminal=false` 启动脚本时，`DBUS_SESSION_BUS_ADDRESS` 可能未继承
- 解决：脚本开头加环境变量兜底：

```bash
DBUS_SESSION_BUS_ADDRESS=${DBUS_SESSION_BUS_ADDRESS:-unix:path=/run/user/$(id -u)/bus}
export DBUS_SESSION_BUS_ADDRESS
```

- KDE 环境可额外用 `kdialog --passivepopup` 做双保险

### .desktop 模板

```ini
[Desktop Entry]
Type=Application
Name=名称
Exec=/path/to/script.sh
Icon=图标名
Terminal=false
Comment=描述
```

## 3. 免密 sudo

### 单命令免密（推荐）

```
# /etc/sudoers.d/easytier
a1 ALL=(ALL) NOPASSWD: /usr/bin/pkill
a1 ALL=(ALL) NOPASSWD: /home/a1/tools/easytier-linux-x86_64/easytier-core
```

### 全命令免密

```
# /etc/sudoers.d/a1-nopasswd
a1 ALL=(ALL) NOPASSWD: ALL
```

- 写完必须 `sudo visudo -c` 校验语法
- 文件权限必须 `0440`：`sudo chmod 0440 /etc/sudoers.d/xxx`

## 4. 进程检测与切换

### 通用开关脚本模板

```bash
#!/bin/bash

if pgrep -f '进程关键词' > /dev/null; then
    sudo killall 进程名 2>/dev/null
    notify-send "标题" "已停止" -i network-offline
else
    nohup sudo /path/to/binary [args] &>/dev/null &
    disown
    sleep 2
    if pgrep -f '进程关键词' > /dev/null; then
        notify-send "标题" "已启动" -i network-vpn
    else
        notify-send "标题" "启动失败" -i dialog-error
    fi
fi
```

### 注意事项
- `pkill -f` 会匹配命令行所有内容，可能误杀自身脚本进程
- 更安全用 `killall` 或精确的 `pkill -x`（只匹配进程名）
- 启动后 `sleep 2` 再检测，给进程初始化时间
