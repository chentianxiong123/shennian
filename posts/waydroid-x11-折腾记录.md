---
title: 'Waydroid X11 兼容性折腾记录'
date: 2026-08-21
---

# Waydroid X11 兼容性折腾记录

## 背景
- 当前系统运行在 X11 会话（Xorg），Waydroid 官方要求 Wayland
- 桌面入口：`/home/a1/桌面/安卓桌面.desktop`
- 启动脚本：`/home/a1/bin/waydroid-desktop.sh`

## 结论
- Waydroid **原生不支持 X11**（官方 issue #195、#1223 已关闭）
- X11 下可行方案：在 X11 内嵌套运行 Weston 合成器（`weston --backend=x11 --xwayland`）
- 更轻量的替代方案：使用 **Cage**（专用全屏 Wayland 合成器，专为 Waydroid 设计）
- 完全切换到 KDE Wayland 会话是最干净的办法

## 已尝试方案

### 方案一：Weston X11 后端（已验证可行，但有瑕疵）
```bash
# 安装
sudo apt install weston

# 手动启动
weston --backend=x11 --xwayland --shell=desktop-shell.so &
# 找到 socket
ls /run/user/1000/wayland-*   # 通常是 wayland-1
export WAYLAND_DISPLAY=wayland-1
waydroid session start
waydroid show-full-ui
```
**问题**：
1. Weston 会占用一个 X11 窗口，Waydroid UI 在里面运行
2. 可能触发 `RuntimeError: Already tracking a session`（之前已启动过容器）
3. 每次挂起/恢复后 Wayland 状态可能丢失
4. 体验不完美，性能也打折扣

### 方案二：Cage（未尝试，推荐下次试试）
Cage 是专门为 Waydroid 设计的轻量全屏合成器：
```bash
sudo apt install cage
# 启动
cage waydroid show-full-ui
```
比 Weston 更干净，无多余桌面组件。

### 方案三：切换到 KDE Wayland 会话（最推荐）
- 在 KDE 登录界面选择 **Plasma (Wayland)** 会话
- 重启后 Waydroid 原生运行，无需任何 workaround

## 清理记录
- 已 kill 残留 weston/waydroid 进程
- 已清理 `/run/user/1000/wayland-*` 残留 socket
- 已清理 `/tmp` 下的临时文件
- 保留文件：
  - `/home/a1/bin/waydroid-desktop.sh` — 脚本（待优化或替换为 cage 方案）
  - `/home/a1/桌面/安卓桌面.desktop` — 桌面入口（已验证正常）
  - `weston` 包已安装

## 下一步可选
1. 尝试 cage 方案（更轻量）
2. 切换到 KDE Wayland 会话（最干净）
3. 等待 Waydroid 官方 X11 支持（ unlikely ）
