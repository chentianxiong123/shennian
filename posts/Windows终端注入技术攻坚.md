---
title: 'Windows 终端注入技术攻坚'
date: 2026-05-28
---

# Windows 终端注入技术攻坚

> 把命令塞进 Claude Code / Codex CLI 窗口的那些事
> 2026-05-28 ~ 2026-05-30

---

## 背景

在多 Agent 对证循环中，路由层需要把指令注入到 CC / Codex 的终端窗口。
这个问题在 Windows 上比 Linux 难得多——没有 tmux，没有 PTY 复用，没有 send-keys。

## 第一阶段：SetForegroundWindow + keybd_event

### 方案

```
window-server.py（端口 8765）
  → inject-fast.ps1
    → ShowWindow(SW_SHOW)
    → SetForegroundWindow
    → 剪贴板写入文本
    → keybd_event(Ctrl+V)
    → keybd_event(Enter)
    → SetForegroundWindow(恢复前台)
```

### 成果

- 注入速度 ~200ms
- HWND 查找用 `find-window.ps1`
- 用户验证：**"非常稳"**
- 文件：`inject-fast.ps1`、`window-server.py`、`find-window.ps1`

### 缺点

- 窗口必须在前台才能接收按键
- 用户工作时窗口闪烁抢焦点
- 需要 HWND 跟踪，窗口重建后 HWND 变化

---

## 第二阶段：ConPTY / stdin 方案（失败）

试图通过 ConPTY API 绕过窗口层：

| 方案 | 结果 | 原因 |
|------|------|------|
| `conpty-server.py` | ❌ | CC 检测到无终端后立即退出 |
| 直接 stdin 写 | ❌ | `[Errno 22] Invalid argument` |
| CC `--print` 模式 | ❌ | 一次性进程，不是持久会话 |

结论：**CC 和 Codex 都是用 prompt_toolkit 的交互式 REPL，不支持 stdin 管道交互。**

---

## 第三阶段：Windows 自动化框架评估

| 框架 | 结果 | 原因 |
|------|------|------|
| pywinauto | ❌ | 同 keybd_event 限制 |
| AutoHotkey | ❌ | 同样受 ReadConsoleInputW 限制 |
| AutoIt | ❌ | 同样 |
| WinAppDriver | ❌ | 面向 UWP/Web 应用，非 Console |

根因：**Windows Terminal / ConHost 的输入通过 `ReadConsoleInputW` 直接从内核态读取，绕过窗口消息队列。** 所有用户态注入框架都无法绕过。

---

## 第四阶段：切换到 WSL + tmux（彻底解决）

放弃直接在 Windows 上注入，改用 **WSL + tmux**：

```
n8n（Windows 路由层）
  → wsl -e tmux send-keys -t cc "/develop-ws" Enter
  → CC 在 WSL 中通过 tmux session 运行
```

### 优点

- ✅ tmux 原生支持 `send-keys`，零延迟
- ✅ 窗口不需要前台，后台注入
- ✅ session name 即身份（cc / codex / ws001）
- ✅ 多工作间天然隔离
- ✅ 不怕窗口焦点抢夺

### 代价

- CC / Codex 必须在 WSL 环境中运行（Linux 环境）
- 文件系统通过 `/mnt/c/...` 访问 Windows 文件
- 需要一个 WSL 发行版

---

## 技术演进总表

| 时间 | 方案 | 状态 | 核心文件 |
|------|------|------|----------|
| 5/28 | SetForegroundWindow + keybd_event | ✅ 验证通过 | inject-fast.ps1, window-server.py |
| 5/29 | ConPTY 管道 | ❌ 阻塞 | conpty-server.py |
| 5/29 | CC --print 模式 | ❌ 一次性 | cc-server.py |
| 5/29 | 自动化框架（pywinauto/AHK） | ❌ 不可行 | — |
| 5/30 | WSL + tmux send-keys | ✅ 最终方案 | README.md |

---

## 经验教训

1. **不要跟 Windows Console 子系统硬刚** — ReadConsoleInputW 是内核态操作，用户态无解
2. **平台能力有本质差异** — Windows 的窗口模型不适合 Agent 自动化，WSL 是桥梁
3. **HWND 不是稳定的标识符** — 窗口重建后 HWND 变化，tmux session name 是更好的方案
4. **先验证最天然的方式** — tmux send-keys 早就在 Linux 上解决了这个问题
