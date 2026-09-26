---
title: 'OpenCode SSD 写入优化方案'
date: 2026-07-08
---

# OpenCode SSD 写入优化方案

## 优化目标
在不影响正常使用体验的前提下，最大限度减少 OpenCode 对 SSD 的写入量。

## 关键路径（供统一管理脚本用）

```
$ocConfig  = "$env:USERPROFILE\.config\opencode\opencode.json"           # 配置文件
$ocData    = "$env:USERPROFILE\.local\share\opencode"                     # 数据目录
$ocState   = "$env:USERPROFILE\.local\state\opencode"                     # 状态目录
$ocDB      = "$env:USERPROFILE\.local\share\opencode\opencode.db"         # SQLite 主库
$ocLog     = "$env:USERPROFILE\.local\share\opencode\log\opencode.log"    # 日志文件
$ocTools   = "$env:USERPROFILE\.local\share\opencode\tool-output"         # 工具输出缓存目录
$ocHistory = "$env:USERPROFILE\.local\state\opencode\prompt-history.jsonl" # 对话历史
```

## 第一步：修改配置

编辑 `~\.config\opencode\opencode.json`，在顶层追加以下字段：

```json
{
  "logLevel": "ERROR",
  "snapshot": false,
  "tool_output": {
    "max_lines": 5000,
    "max_bytes": 262144
  },
  "compaction": {
    "prune": true
  }
}
```

### 各选项说明

| 选项 | 作用 | UX 影响 |
|------|------|---------|
| `logLevel: "ERROR"` | 只记错误日志，停止 INFO/DEBUG 写入 | 无 |
| `snapshot: false` | 关闭文件变更快照，消除 DB 最大写入源 | 失去 undo/revert 功能 |
| `tool_output` 阈值调大 | 减少工具输出 spill 到磁盘的次数 | 无 |
| `compaction.prune: true` | 上下文压缩时裁剪旧工具输出 | 无 |

> 配置修改**不实时生效**，下次启动 OpenCode 才生效。

## 第二步：重启后一次性清理

```powershell
# 清空工具输出缓存（省 ~80 MB）
Remove-Item -Path "$env:USERPROFILE\.local\share\opencode\tool-output\*" -Force

# 清空日志（省 ~48 MB）
Clear-Content -Path "$env:USERPROFILE\.local\share\opencode\log\opencode.log"

# 压缩 SQLite 数据库（回收已删除空间）
# 注：需要 opencode 未运行时执行
& "C:\Program Files\opencode\opencode.exe" db vacuum
# 或直接用 sqlite3
sqlite3 "$env:USERPROFILE\.local\share\opencode\opencode.db" "VACUUM;"
```

## 第三步：定期维护脚本（可选）

```powershell
# OpenCode-Cleanup.ps1 — 计划任务每周运行
$dataDir = "$env:USERPROFILE\.local\share\opencode"

# 清理工具输出（保留最近 24 小时）
Get-ChildItem "$dataDir\tool-output" | Where-Object {
  $_.LastWriteTime -lt (Get-Date).AddHours(-24)
} | Remove-Item -Force

# 日志超过 10MB 则清空
$log = "$dataDir\log\opencode.log"
if ((Get-Item $log -ErrorAction SilentlyContinue).Length -gt 10MB) {
  Clear-Content $log
}

# 清理旧会话标记
Get-ChildItem "$dataDir\storage\session_diff\*.json" |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-7) } |
  Remove-Item -Force
```

## 预期效果

| 项目 | 优化前 | 优化后 |
|------|--------|--------|
| `opencode.db` 写入速率 | ~高（含快照）| ~低（无快照）|
| `opencode.log` 增长 | ~持续增长 | ~基本停止 |
| `tool-output\` 文件数 | 143+ | ~大幅减少 |
| 使用体验 | 正常 | 无变化（除失去 undo）|