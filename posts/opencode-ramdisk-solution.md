---
title: 'OpenCode + R: RAM 盘 最终解决方案'
date: 2026-07-12
---

# OpenCode + R: RAM 盘 最终解决方案

## 问题

- 目标：`%TEMP%` 指向 R: 内存盘，减少 SSD 写入
- 障碍：opencode 启动失败，报错 `Failed to open library "B:/~BUN/root/opentui-*.dll": error code 126`

### 根因分析（两层问题）

#### 第一层：Bun 的 bunfs 虚拟文件系统硬编码 B: 驱动器

opencode.exe 是用 Bun 打包的独立可执行文件。Bun 在 Windows 上编译独立 exe 时，会将 **bunfs（Bun 虚拟文件系统）的根路径硬编码为 `B:/~BUN/root/`**。这是 Bun 的设计决策 —— Windows 上需要一个驱动器字母来挂载虚拟文件系统。

相关源码（`packages/cli/script/build.ts:98` 和 `packages/opencode/script/build.ts:165`）：

```typescript
// Windows 平台强制使用 B:/~BUN/root/ 作为 bunfs 根路径
const bunfsRoot = item.os === "win32" ? "B:/~BUN/root/" : "/$bunfs/root/"
```

这个路径在运行时必须是可访问的有效驱动器。如果 B: 盘不存在，Bun 就无法加载内置资源（包括 opentui 渲染库的 DLL）。

#### 第二层：ImDisk RAM 盘上的 DLL 提取失败

即使 B: 盘存在，当 `%TEMP%` 指向 ImDisk 创建的 RAM 盘时，Bun 在启动时提取内置 DLL 到 TEMP 目录的操作会静默失败，导致 opentui.dll 无法被加载。

#### 错误表现

```
Failed to initialize OpenTUI render library: Failed to open library "B:/~BUN/root/opentui-2nr24hkx.dll": error code 126
```

error code 126 = "找不到指定的模块"（The specified module could not be found）

---

## 解决方案

### 方案 A：从源码运行（推荐）

原理：用 `bun run` 直接跑 TypeScript 源码，Bun 仅作为运行时使用。此时 opentui.dll 从 `node_modules` 直接加载，不经过 TEMP 提取，也不依赖 B: 虚拟驱动器。

### 步骤

#### 1. 拉取源码（浅克隆，只拿需要的目录）

```bash
git clone --depth 1 --filter=blob:none --sparse https://github.com/anomalyco/opencode.git D:\devtools\opencode
cd D:\devtools\opencode
```

#### 2. 安装依赖

```bash
bun install
```

#### 3. 验证能跑

```bash
bun run --cwd packages\opencode --conditions=browser src\index.ts --version
```

#### 4. 创建启动脚本

`D:\devtools\opencode\run-opencode.bat`：

```bat
@echo off
bun run "%~dp0packages\opencode\src\index.ts" %*
```

#### 5. 可选：替换 PATH 中的 opencode

现有的 `opencode.ps1` wrapper 调用的是独立二进制。建一个新的脚本替换它：

`D:\Program Files (x86)\nvm\v22.22.2\opencode-src.ps1`：

```powershell
#!/usr/bin/env pwsh
$basedir="D:\devtools\opencode"
& "bun" "run" "--cwd" "$basedir\packages\opencode" "--conditions=browser" "$basedir\packages\opencode\src\index.ts" @args
exit $LASTEXITCODE
```

或者在 `$PROFILE` 里加别名：

```powershell
function opencode-src {
    bun run --cwd "D:\devtools\opencode\packages\opencode" --conditions=browser "D:\devtools\opencode\packages\opencode\src\index.ts" $args
}
```

---

### 方案 B：WSL2 运行（一劳永逸）

在 WSL2 中运行 opencode，完全避开 Windows 的 B: 驱动器问题。Linux 上 bunfs 使用 `/$bunfs/root/` 虚拟路径，不需要驱动器字母。

```bash
# 在 WSL2 里安装
curl -fsSL https://opencode.ai/install | bash

# 运行
opencode -c
```

WSL2 的 `/tmp` 默认就是 tmpfs（内存文件系统），无需额外配置。

### 方案 C：管理员权限运行（临时尝试）

用管理员权限运行 opencode.exe，让它能创建 B: 驱动器映射：

```powershell
Start-Process opencode -Verb RunAs
```

**注意**：此方法不一定有效，因为 B: 驱动器的创建是 Bun 内部行为，不一定能通过提权解决。

---

## TEMP 配置（最终方案）

| 变量 | 值 | 说明 |
|------|-----|------|
| 用户 `%TEMP%` | `R:\temp` | 所有应用临时文件走 RAM 盘 |
| 用户 `%TMP%` | `R:\temp` | 同上 |
| 系统 `%TEMP%` | `C:\WINDOWS\TEMP` | 不动 |
| 系统 `%TMP%` | `C:\WINDOWS\TEMP` | 不动 |

设置命令：

```powershell
[Environment]::SetEnvironmentVariable("TEMP", "R:\temp", "User")
[Environment]::SetEnvironmentVariable("TMP", "R:\temp", "User")
```

---

## 浏览器缓存重定向（已生效）

| 缓存 | C: 原路径 | R: 目标 |
|------|----------|--------|
| Chrome Cache | `%LOCALAPPDATA%\Google\Chrome\User Data\Default\Cache` | `R:\chrome-cache` |
| Chrome Code Cache | `%LOCALAPPDATA%\Google\Chrome\User Data\Default\Code Cache` | `R:\chrome-code-cache` |
| Edge Cache | `%LOCALAPPDATA%\Microsoft\Edge\User Data\Default\Cache` | `R:\edge-cache` |
| Edge Code Cache | `%LOCALAPPDATA%\Microsoft\Edge\User Data\Default\Code Cache` | `R:\edge-code-cache` |
| ccswitch Cache | `%LOCALAPPDATA%\com.ccswitch.desktop\Cache` | `R:\com.ccswitch.desktop\Cache` |

---

## 启动脚本（R: 初始化）

`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\init_r_drive.bat`：

```bat
@echo off
REM init_r_drive.bat - Initialize R: RAM disk on boot

REM Wait for R: to be ready (up to 30 seconds)
for /l %%i in (1,1,30) do (
    if exist R:\ (
        goto READY
    )
    timeout /t 1 /nobreak >nul
)
echo [WARN] R: not ready after 30s, skipping
exit /b 1

:READY

REM Format if RAW
fsutil fsinfo volumeinfo R:\ 2>nul | find /i "NTFS" >nul 2>nul
if errorlevel 1 (
    echo [INIT] Formatting R: as NTFS...
    format R: /q /y /fs:ntfs /v:RAMDISK >nul 2>nul
)

REM Create directories (idempotent)
mkdir R:\chrome-cache            2>nul
mkdir R:\chrome-code-cache       2>nul
mkdir R:\edge-cache              2>nul
mkdir R:\edge-code-cache         2>nul
mkdir R:\com.ccswitch.desktop    2>nul
mkdir R:\opencode-tool-output    2>nul
mkdir R:\opencode-log            2>nul
mkdir R:\codex-sandbox           2>nul
mkdir R:\temp                    2>nul
mkdir R:\Windows\temp            2>nul

echo [OK] R: initialized
```

---

## 已提交的 Issue

https://github.com/anomalyco/opencode/issues/36502

标题：*TUI fails to load opentui DLL when %TEMP% is on an ImDisk RAM disk (error 126)*

---

## 其他改动备忘

| 改动 | 状态 | 说明 |
|------|------|------|
| ACP 65001→936 | 已改，需重启 | 修复老程序乱码 |
| WMI ETL DENY ACL | 保留 | 不影响日常 |
| waasmedic DENY ACL | 保留 | 不影响日常 |
| WaaSMedicSvc Start=4 | 保留 | 不影响日常 |
| Clash Verge logs symlink | 已修复 | 重建为普通目录 |
