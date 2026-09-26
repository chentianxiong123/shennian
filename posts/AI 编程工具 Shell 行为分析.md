---
title: 'AI 编程工具的 Shell 行为分析'
date: 2026-06-26
---

# AI 编程工具的 Shell 行为分析

## 测试环境

- Windows 11
- PowerShell 7.x
- Git Bash (MSYS2)
- WSL2 Ubuntu

## 结论速查

| 工具 | PowerShell 启动 | Git Bash 启动 | WSL bash 启动 |
|------|-----------------|---------------|---------------|
| Claude Code | Git Bash | Git Bash | WSL bash |
| Codex | PowerShell | Git Bash | WSL bash |
| OpenCode | PowerShell | Git Bash | WSL bash |

**Claude Code 特殊：在 Windows 上永远用 bash，不用 PowerShell。**

## 详细分析

### Claude Code (Anthropic)

**安装方式：** npm 全局安装，实际是编译好的原生 `claude.exe`（245MB）

**Shell 选择逻辑：**
- Windows 上强制使用 bash
- 优先找 Git Bash (`C:\Program Files\Git\bin\bash.exe`)
- 如果从 WSL 启动，用 WSL 的 `/bin/bash`
- 不使用 PowerShell

**证据：** `~/.claude/shell-snapshots/` 目录下有 bash snapshot 文件，内容是标准 bash 语法（`unalias`、`shopt`、`OSTYPE=="msys"`）

**启动脚本：**
```
claude.cmd → claude.exe（原生二进制）
```

### Codex (OpenAI)

**安装方式：** npm 全局安装，Node.js 脚本 + Rust 编译的 native binding

**Shell 选择逻辑：**
- 检查 `SHELL` 环境变量
- Windows 没有 `SHELL` 变量，默认用 `powershell.exe`
- WSL 里 `SHELL=/bin/bash`，就用 bash

**启动脚本：**
```
codex.cmd → node codex.js → @openai/codex-win32-x64 (Rust native)
```

**配置文件：** `~/.codex/config.toml`

### OpenCode

**安装方式：** Go 编译的 CLI 工具

**Shell 选择逻辑：**
- 使用当前终端的 shell
- PowerShell 启动 → 用 PowerShell
- WSL bash 启动 → 用 bash
- Git Bash 启动 → 用 Git Bash

**启动方式：**
```
opencode（直接执行）
```

## 如何强制使用 WSL Shell

在 WSL 终端里启动即可：

```powershell
# 方法一：进入 WSL 后启动
wsl -d Ubuntu
cd /mnt/d/files
claude   # 或 codex / opencode

# 方法二：一行命令
wsl -d Ubuntu -e bash -c "cd /mnt/d/files && claude"
```

这样所有工具都会：
- 使用 WSL 的 `/bin/bash`
- 路径用 Linux 风格（`/mnt/d/files`）
- 命令通过 WSL 执行

## 路径对照

| Windows 路径 | WSL 路径 |
|-------------|----------|
| D:\files | /mnt/d/files |
| C:\Users\a1 | /home/a1 (WSL 主目录) |
| D:\devtools | /mnt/d/devtools |

## 注意事项

1. **Claude Code 不受控制** — 它在 Windows 上永远用 bash，即使你从 PowerShell 启动
2. **Codex 和 OpenCode 跟随父进程 shell** — 从哪启动就用什么
3. **WSL 里路径要改** — `D:\files` 变成 `/mnt/d/files`
4. **文件权限不同** — WSL 里的文件权限和 Windows 不一样，注意 git 操作
5. **性能差异** — WSL 访问 `/mnt/c`（Windows 盘）比访问 Linux 原生文件系统慢
