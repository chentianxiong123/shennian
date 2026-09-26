---
title: 'CC-Switch OpenCode 会话发现机制 — 代码级解析'
date: 2026-08-13
---

# CC-Switch OpenCode 会话发现机制 — 代码级解析

## 问题

CC-Switch 的 `opencodeConfigDir` 配置项无法控制 opencode 会话读取路径，设置后仍然看不到 opencode 会话。

## 根因

CC-Switch 中各工具的会话发现路径逻辑**不统一**：

| 工具 | 发现路径来源 |
|------|-------------|
| Claude Code | `claudeConfigDir` 配置 → 找 `<dir>/sessions/` |
| Codex | `codexConfigDir` 配置 → 找 `<dir>/sessions/` |
| Pi | `piConfigDir` 配置 → 找 `<dir>/sessions/` |
| **OpenCode** | **硬编码** `$XDG_DATA_HOME/opencode/opencode.db` |
| OpenClaw | 硬编码路径 |
| Hermes | 硬编码路径 |

## 关键代码

文件：`src-tauri/src/session_manager/providers/opencode.rs`

```rust
/// 不读 opencodeConfigDir，只读 XDG_DATA_HOME 环境变量
pub(crate) fn get_opencode_base_dir() -> PathBuf {
    if let Ok(xdg) = std::env::var("XDG_DATA_HOME") {
        return PathBuf::from(xdg).join("opencode");
    }
    // 兜底
    dirs::home_dir()
        .map(|h| h.join(".local/share/opencode"))
        .unwrap_or_else(|| PathBuf::from(".local/share/opencode"))
}

fn get_opencode_db_path() -> PathBuf {
    get_opencode_base_dir().join("opencode.db")
}
```

最终路径 = `$XDG_DATA_HOME/opencode/opencode.db`（Linux 下不读配置文件）

## 会话数据来源

CC-Switch 同时支持两种 opencode 会话格式，**SQLite 优先**：

1. **JSON 旧格式**：`<base_dir>/storage/session/{id}.json`（旧版 opencode）
2. **SQLite 新格式**：`<base_dir>/opencode.db`（`session` / `message` / `part` 三表）

代码逻辑（`scan_sessions()`）：SQLite 有数据就只返回 SQLite，JSON 只在 SQLite 空时回退。

## 实际环境路径对照

hi-box 上的情况：

| 路径 | 内容 |
|------|------|
| `/mnt/shared/.opencode/opencode-db/opencode.db` | 1.1GB 数据库（用户实际数据） |
| `/mnt/shared/opencode/opencode.db` | 2.4GB 数据库（另一份） |
| CC-Switch 默认找 | `$XDG_DATA_HOME/opencode/opencode.db` |

## 修复方案

两步：

**1. 软链接** — 让 CC-Switch 的路径找到实际数据库：

```bash
ln -sf /mnt/shared/.opencode/opencode-db /mnt/shared/.opencode/opencode
# 结果: /mnt/shared/.opencode/opencode/opencode.db → opencode-db/opencode.db (1.1GB)
```

**2. 环境变量** — 让 CC-Switch 去 `.opencode` 目录下找：

在 `cc-switch-web.service` 的 `[Service]` 段添加：

```ini
Environment=XDG_DATA_HOME=/mnt/shared/.opencode
```

最终 CC-Switch 读到的路径：`/mnt/shared/.opencode/opencode/opencode.db`（1.1GB ✅）

## 补充：Host 绑定

CC-Switch 默认只绑 `127.0.0.1`，需要用 `CC_SWITCH_HOST` 环境变量改：

```ini
Environment=CC_SWITCH_HOST=0.0.0.0
```

文件：`crates/server/src/main.rs` 第 178 行：

```rust
let host = std::env::var("CC_SWITCH_HOST")
    .unwrap_or_else(|_| "127.0.0.1".to_string());
```

## 最终 cc-switch-web.service

```ini
[Unit]
Description=CC-Switch Web Server (persistent)
After=network.target

[Service]
Type=simple
ExecStart=/opt/cc-switch-web/cc-switch-web
WorkingDirectory=/opt/cc-switch-web
Environment=HOME=/root
Environment=CC_SWITCH_CONFIG_DIR=/mnt/shared/.cc-switch
Environment=XDG_DATA_HOME=/mnt/shared/.opencode
Environment=CC_SWITCH_HOST=0.0.0.0

[Install]
WantedBy=multi-user.target
```
