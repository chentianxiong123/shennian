---
title: 'CC-Switch 会话日志聚合与同步机制'
date: 2026-08-10
---

# CC-Switch 会话日志聚合与同步机制

## 一、概述

CC-Switch 内置三种级别的会话日志/使用数据同步机制，用于统一追踪各 AI 编码助手的 token 消耗和费用。

## 二、保留天数

**30 天。**

`backup.rs:280` 在每日维护时调用 `Database::rollup_and_prune(30)`：
- 将 `proxy_request_logs` 表中超过 30 天的明细记录按天汇总到 `usage_daily_rollups`
- 汇总后删除原始明细行
- 对齐到本地午夜边界，确保汇总行代表完整的一天

## 三、同步目标

从各 Agent 的会话文件中提取 token 使用数据，写入 `proxy_request_logs` 表 → 汇总到 `usage_daily_rollups`。

| Agent | 源码文件 | 扫描目录 |
|---|---|---|
| Claude | `services/session_usage.rs` | `~/.claude/projects/*/*.jsonl` |
| Codex | `services/session_usage_codex.rs` | `~/.codex/` |
| Gemini | `services/session_usage_gemini.rs` | `~/.gemini/` |
| OpenCode | `services/session_usage_opencode.rs` | opencode.db (SQLite) |
| Pi | `services/session_usage_pi.rs` | `~/.pi/agent/sessions/*/*.jsonl` |
| Hermes | 无 | - |

## 四、触发方式

### 4.1 手动同步（UI 按钮）

`DataSourceBar.tsx` 中的"同步"按钮 → `usageApi.syncSessionUsage()` → Tauri 命令 `sync_session_usage`（桌面版）或 `dispatch.rs` 的 API 路由（web 版）。

**Web 版调用链：**
```
sync 按钮 → dispatch.rs:76 "sync_session_usage"
         → crates/core/src/lib.rs:1272 sync_session_usage()
         → src-tauri/src/lib.rs sync_all_session_usage()
             ├── sync_claude_session_logs()
             ├── sync_codex_usage()
             ├── sync_gemini_usage()
             ├── sync_pi_usage()          ✅ 已接入
             └── sync_opencode_usage()
```

**桌面版调用链：**
```
sync 按钮 → commands/usage.rs:276 sync_session_usage()
             ├── sync_claude_session_logs()
             ├── sync_codex_usage()
             ├── sync_gemini_usage()
             ├── sync_pi_usage()          ❌ 未接入
             └── sync_opencode_usage()
```

### 4.2 自动定时同步（仅桌面版）

`src-tauri/src/lib.rs` 在应用启动时 spawn 一个后台任务，每 **60 秒** 运行一次：

```rust
const SESSION_SYNC_INTERVAL_SECS: u64 = 60;
```

首次运行所有 5 个 Agent 的同步，后续只同步 Claude/Codex/Gemini/OpenCode。**Pi 不在自动定时同步中**。

### 4.3 Web 版自动同步

Web 版 **没有** 后台自动会话同步。Web 版 `crates/server/src/main.rs` 只创建了一个 `SessionStore` 的 cleanup 任务（每小时清理过期 web 登录会话），与日志同步无关。

## 五、Pi 同步的接入状态

| 入口 | Pi 是否已接入 |
|---|---|
| `sync_all_session_usage()`（web 版手动同步） | ✅ 已接入 |
| `sync_session_usage()`（桌面版手动同步） | ❌ 未接入 |
| 60 秒后台定时同步（桌面版） | ❌ 未接入 |
| Web 版后台自动同步 | 不存在（web 版只有手动） |

`sessions_usage_pi.rs` 的 `sync_pi_usage()` 函数完整存在，只是调用点遗漏。

## 六、Web 登录认证机制

### 6.1 配置文件

`~/.cc-switch/web-auth.json`，内容格式：

```json
{
  "password_hash": "$2b$10$..."
}
```

### 6.2 登录流程

```
auth.status → 返回 { "enabled": true/false }
auth.login  → 验证密码 → 创建 SessionStore 会话 → 返回 token
auth.check  → 验证 token 是否有效
```

### 6.3 保护范围

`invoke.rs` 和 `ws.rs` 通过 `session_auth::has_valid_session()` 检查请求头中的 cookie token，未登录时拒绝 API 调用和 WebSocket 连接。

### 6.4 当前状态

没有配置 `web-auth.json` 文件，认证已关闭（`load_auth_config()` 返回 `None`）。但 `SessionStore` 创建和 cleanup 任务仍在运行（每小时空跑一次）。

## 七、相关代码位置

| 功能 | 文件 | 关键行 |
|---|---|---|
| 保留天数 30 天 | `src-tauri/src/database/backup.rs` | 280 |
| 汇总函数 | `src-tauri/src/database/dao/usage_rollup.rs` | 62 |
| 手动同步(web) | `crates/core/src/lib.rs` | 1272 |
| 手动同步(桌面) | `src-tauri/src/commands/usage.rs` | 276 |
| 全量同步 | `src-tauri/src/lib.rs` | `sync_all_session_usage` |
| 定时同步(桌面) | `src-tauri/src/lib.rs` | 1748-1820 |
| Pi 同步实现 | `src-tauri/src/services/session_usage_pi.rs` | `sync_pi_usage` |
| Web 登录 | `crates/server/src/auth.rs` | `load_auth_config`, `SessionStore` |
| 登录保护 | `crates/server/src/api/session_auth.rs` | `has_valid_session` |
| 登录命令 | `crates/server/src/api/dispatch.rs` | 3396-3450 |