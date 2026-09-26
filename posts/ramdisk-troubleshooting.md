---
title: 'R: RAM Disk 折腾记录'
date: 2026-07-12
---

# R: RAM Disk 折腾记录

## 环境

- C: SSD — 系统盘（目标：减少写入）
- R: — 1GB ImDisk RAM 盘（type vm，无镜像文件）
- 系统 zh-CN，原 ACP=65001（UTF-8 Beta）→ 改回 936

---

## 一、R: 初始化问题

### 症状
开机后 R: 盘符存在但为 RAW，启动脚本 mkdir 静默失败。

### 原因
ImDisk 持久注册表配置只建了设备（Type=0x1 VM），没有文件系统。

```
HKLM\SYSTEM\CurrentControlSet\Services\ImDisk\Parameters\Disk0
  Size       = 0x40000000  (1GB)
  MountPoint = \??\R:
  Type       = 0x1         (VM, no image file)
```

### 修复
启动脚本 `init_r_drive.bat` 加入 RAW 检测 + 自动格式化：

```
fsutil fsinfo volumeinfo R:\ | find /i "NTFS"
if errorlevel 1 (
    format R: /q /y /fs:ntfs /v:RAMDISK
)
```

脚本路径：`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\init_r_drive.bat`

### 当前脚本行为
1. 循环等待 R: 就绪（最长 30 秒）
2. 检测文件系统，RAW 则 Quick Format 为 NTFS
3. 创建全部所需目录（幂等，mkdir 2>nul）

---

## 二、TEMP 重定向与 opencode 冲突

### 症状
`%TEMP%` 设为 `R:\temp` 后，`opencode -c`（启动 TUI）报错：

```
Failed to initialize OpenTUI render library:
Failed to open library "B:/~BUN/root/opentui-2nr24hkx.dll": error code 126
```

CLI 命令（`--version`、`--list-files`）正常。

### 原因
opencode.exe 是 Bun 打包的独立二进制（184MB）。Bun 在启动时将内置的 opentui.dll 提取到 `%TEMP%` 下并加载。当 TEMP=R: 时：

- `GetTempPath` 返回正确 (`R:\temp\`)
- 文件读写正常
- `LoadLibrary` 从 R: 加载原生 DLL 正常
- 但 **Bun 不在 R: 上创建任何临时文件**（FileSystemWatcher 零事件）

结论：**Bun 独立二进制与 ImDisk RAM 盘存在兼容性问题**，提取原生插件阶段静默跳过。

### 修复
`%TEMP%` 改回系统默认 `%USERPROFILE%\AppData\Local\Temp`。

### 备注
- 如果不使用 opencode TUI（只用 CLI），`%TEMP%` 可以指向 R:
- 其他程序（Chrome、Edge、Clash Verge）不受影响

---

## 三、Clash Verge（clash-verge-rev）日志目录

### 症状
启动崩溃：

```
Failed to setup app: error encountered during setup hook:
Log cannot be written, e.g. because the configured output directory is not accessible
```

### 原因
`%APPDATA%\io.github.clash-verge-rev.clash-verge-rev\logs` 被错误设为 symlink 指向 `R:\logs\clash`，但 R: 上该目录不存在。Tauri 2 初始化时写日志失败导致 panic。

### 修复
删除该 symlink，重建为普通目录。

---

## 四、图吧工具箱乱码

### 症状
界面文字全部乱码。

### 原因
系统 ANSI Code Page (ACP) 被设为 65001（UTF-8 Beta 功能）。旧程序调用 ANSI API 时收到 UTF-8 而非预期的 GBK (CP936)，导致中文乱码。

### 修复
ACP 从 65001 改回 936：

```
reg add "HKLM\SYSTEM\CurrentControlSet\Control\Nls\CodePage" /v ACP /t REG_DWORD /d 936 /f
```

需重启生效。

### 微调替代方案
用 Locale Emulator (github.com/xupefei/Locale-Emulator) 单独指定程序运行的语言环境，不更改系统全局 ACP。

---

## 五、浏览器缓存重定向（当前生效）

| 缓存 | C: 原路径 | R: 目标 |
|------|----------|--------|
| Chrome Cache | `%LOCALAPPDATA%\Google\Chrome\User Data\Default\Cache` | `R:\chrome-cache` |
| Chrome Code Cache | `%LOCALAPPDATA%\Google\Chrome\User Data\Default\Code Cache` | `R:\chrome-code-cache` |
| Edge Cache | `%LOCALAPPDATA%\Microsoft\Edge\User Data\Default\Cache` | `R:\edge-cache` |
| Edge Code Cache | `%LOCALAPPDATA%\Microsoft\Edge\User Data\Default\Code Cache` | `R:\edge-code-cache` |
| ccswitch Cache | `%LOCALAPPDATA%\com.ccswitch.desktop\Cache` | `R:\com.ccswitch.desktop\Cache` |

均为 Junction 类型（`mklink /j`），需管理员权限创建。

---

## 六、其他已撤销的系统改动

以下为尝试过的 SSD 写入优化，因兼容性问题已撤销或保留但非必需：

| 改动 | 状态 | 原因 |
|------|------|------|
| 禁用 EventLog | 已撤销 | 部分程序依赖 |
| WMI ETL 日志 (DENY ACL) | 保留 | 不影响日常使用 |
| waasmedic 日志 (DENY ACL) | 保留 | 不影响日常使用 |
| 禁用 WaaSMedicSvc | 保留 | 注册表 Start=4 |
| 禁用 Clipboard 服务 | 已撤销 | 影响剪贴板功能 |
| RDP AutoTrace | 已撤销 | 非必要 |
| 用户 TEMP→R:\temp | 已撤销 | 导致 opencode TUI 崩溃 |
| C:\Windows\Temp junction | 已撤销 | 导致系统组件异常 |

---

## 七、经验总结

1. **RAM 盘（ImDisk VM 型）与 Bun 独立二进制不兼容** — Bun 提取原生 DLL 时静默跳过 RAM 盘，原因未明。`LoadLibrary` 本身从 R: 加载 DLL 没问题。
2. **ACP=65001（UTF-8 Beta）坑老程序** — 旧版 Windows 程序用 ANSI API 的必炸，不改回来无解。
3. **Symlink 依赖初始化** — R: 是易失的，symlink 指向 R: 的程序必须在 R: 建好目录后才能启动。
4. **先验证单项再推下一个** — 这次一次性上了 17 项改动，出问题根本定位不了。
5. **启动脚本要幂等** — `mkdir 2>nul`、循环等待、RAW 格式化，每次开机都能安全重跑。
