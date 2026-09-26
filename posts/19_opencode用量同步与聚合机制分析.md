---
title: 'OpenCode 用量同步与聚合机制分析'
date: 2026-08-01
---

# OpenCode 用量同步与聚合机制分析

> 日期：2026-08-01
> 环境：ccs 在盒子（192.168.31.82，系统 eMMC + U盘 /dev/sda 挂 /mnt/shared）；opencode 在电脑；电脑经 NFS 以 /mnt/box_share 访问同一盘。
> 核心诉求：opencode 用量必须走盒子 U盘，不落在电脑本地；同步数据不能丢。

## 背景架构

```
电脑 (opencode)                    盒子 (ccs / cc-switch-web)
  ~/.config/opencode/*         ──符号链接──►  /mnt/box_share/.opencode/**
  /mnt/box_share  ◄──NFS───────  /mnt/shared (U盘, 13.4G)
                                     /mnt/shared/.opencode/opencode.db
                                     /mnt/shared/.cc-switch/cc-switch.db
```

- ccs 每次从 opencode 的 SQLite 里拉取会话明细，写入自己的 `proxy_request_logs`。
- opencode.db 与 cc-switch.db 都在共享盘上，电脑不存任何一份副本。

## 按点分析

### 1. 一键手动同步按钮已上线

- **前端**：`DataSourceBar`（此前从未被挂载）挂到 `UsageDashboard`；`SessionSyncResult` 新增 `sources: Vec<SessionSyncSource>` 返回每源明细。
- **后端**：`sync_all_session_usage`（`lib.rs:271`）编排 5 源（claude/codex/gemini/opencode/…），每源返回 imported/errors 等明细。
- **构建部署**：commit `6f8ed729`，GH Actions arm32（`arm32-web-build.yml`）构建成功，已部署盒子 `/opt/cc-switch-web/cc-switch-web`（md5 `e885925b…`，服务 active，HTTP 200）。
- **实测**：RPC 触发 opencode 同步成功，544 imported，0 errors，5 源明细正常返回。

### 2. opencode 配置对接已修复

- 补 1 个符号链接：`~/.config/opencode/opencode.json -> /mnt/box_share/.opencode/opencode-config/opencode.json`。
- 验证：`opencode models` 列出 `sensenova/deepseek-v4-flash`。
- ccs 写 `opencode-config/opencode.json`（含 sensenova provider）；盒子 settings `/root/.cc-switch/settings.json` 里 `opencodeConfigDir=/mnt/shared/.opencode/opencode-config`。
- opencode 读配置顺序（v1.18.6 源码 `config.ts:258-260`）：config.json → opencode.json → opencode.jsonc 顺序 merge；`Global.Path.config` 默认 `~/.config/opencode`。

### 3. API 凭证已清空

- `/mnt/box_share/.opencode/opencode-config/auth.json` 原含 4 个 key（xiaomi-token-plan-cn, opencode, auto, cpa），已按用户要求全部删除，当前为 `{}`，备份已删。
- `~/.local/state/opencode/model.json` 中 xiaomiplan 的 recent/variant 记录已清除，备份已删。

### 4. 自动同步机制查证：盒子没有自动同步

- `lib.rs:1759-1818` 存在 `SESSION_SYNC_INTERVAL_SECS: u64 = 60`：启动同步一次 + 每 60 秒循环（claude/codex/gemini/opencode）。
- **但整个 `run()` 是 `#[cfg(feature="desktop")]`**（`lib.rs:895-897`），headless 盒子完全不编译 → **盒子没有自动同步，只能手动点按钮**。

### 5. 日志按天聚合机制：存在，但盒子只在启动时触发

- **机制**：`src-tauri/src/database/dao/usage_rollup.rs` 的 `rollup_and_prune(retain_days=30)`：
  - 按天（对齐本地午夜）把 >30 天的 `proxy_request_logs` 明细聚合进 `usage_daily_rollups`，再删除明细。
  - 聚合维度：(日期, app_type, provider_id, model, request_model, pricing_model)，保留 token/成本/延迟加权平均。
  - 聚合前先 `backfill_missing_usage_costs` 尽力回填计价，失败仅告警不阻断（防 0 成本永久入账）。
  - 用 SAVEPOINT 保证原子性；删除后 `notify_log_recorded()` 通知前端重拉。
- **触发点对比**：

| 触发点 | 位置 | 电脑 desktop | 盒子 headless |
|---|---|---|---|
| 进程启动时 | `database/mod.rs:177`（`Database::init`） | ✅ | ✅ **有** |
| 每 24h 定时 | `backup.rs:280` ← `lib.rs:1753`（desktop-only `run()` 内） | ✅ | ❌ **没有** |

- 盒子走 `crates/server/main.rs` → `ServerState::new` → `CoreContext::new`（crates/core）→ `Database::init()`，所以**启动时执行一次 `rollup_and_prune(30)`**。
- 24h 定时器在 desktop-only `run()` 里，web/headless 二进制不编译。盒子 `main.rs:146` 只有 1 小时的 HTTP session cleanup，与用量日志无关。
- **含义**：盒子长期不重启则 >30 天明细一直堆积（U盘占用增长）；一旦重启会自动聚合 + 清理。聚合按天进 rollup 表，总量/成本/每日趋势不丢，丢的只是 >30 天单条明细级审计能力。
- **对同步数据**：opencode 明细以 `data_source='opencode_session'` 写入 `proxy_request_logs`，rollup 的 DELETE 一并清理（除非有 proxy 重复行经 `effective_usage_log_filter` 判定不进聚合）。

### 6. 数据量对比（20356 vs 32754）

- opencode.db `message` 表 20356 条 vs cc 库 `opencode_session` 记录 32754 条。
- cc 库数据自 7/3 起连续，每日几百到几千条（最近 8/1 为 2659 条）。
- request_id 均标准 3 段 `opencode_session:ses_*:msg_*`，2 段格式 0 条。
- **差异解释**：opencode.db 本地 message 表被 opencode 自身清理过；cc 库保留全量历史，非同步重复。

### 7. 关于"绝对不漏"的结论

- 无法保证绝对不漏：immutable 降级读主库会跳过 `-wal` 未 checkpoint 的尾部帧，靠下一轮 mtime 更新补齐，非永久丢失。
- 用户态度：接受"现在 OK 很好了"，不再追求绝对不漏。

### 8. 盒子缓存清理

- `/tmp` tmpfs 从 100% 满 → 0 空。
- 删除旧二进制副本、测试 DB（t.db 423M 等）、40+ 调试脚本。
- `/opt/cc-switch-web/` 仅剩当前运行二进制；3 个 `.bak.*` 旧备份已删。

### 9. wal_test 工具问题记录

- 最近一次改动用 `Row::column_count` 编译失败（E0599）。
- 后续改用 python3 sqlite3 以 immutable 模式打开共享盘 DB 成功（电脑端可用；盒子无 sqlite3）。

## 关键路径速查

- web 分支代码：`/tmp/opencode/ccsp/repo`（HEAD 6f8ed729）
- 共享盘（电脑 /mnt/box_share = 盒子 /mnt/shared）：
  - `/mnt/shared/.opencode/opencode-config/opencode.json`（ccs 写，sensenova provider）
  - `/mnt/shared/.opencode/opencode-config/auth.json`（已清空为 `{}`）
  - `/mnt/shared/.opencode/opencode-db/opencode.db`（opencode 数据库）
  - `/mnt/shared/.cc-switch/cc-switch.db`（ccs 数据库）
- 盒子：服务 `cc-switch-web.service`（systemd，`OPENCODE_DB=/mnt/shared/.opencode/opencode-db/opencode.db`），配置 `/root/.cc-switch/settings.json`
- 电脑端符号链接体系：`~/.config/opencode/*` 与 `~/.local/share/opencode/*` → `/mnt/box_share/.opencode/**`
- 关键源码：
  - `src-tauri/src/lib.rs:1759-1818`：desktop-only 60s 自动同步循环
  - `src-tauri/src/database/dao/usage_rollup.rs`：`rollup_and_prune` 按天聚合
  - `src-tauri/src/database/backup.rs:280`：24h 周期 rollup（desktop-only）
  - `src-tauri/src/database/mod.rs:177`：启动时 rollup（所有分支）
  - `src-tauri/src/services/session_usage_opencode.rs`：WAL immutable 降级 + 同步
  - `crates/server/main.rs`：盒子 web 入口（无自动同步/无 24h 定时）

## 当前状态

- 一键同步：可用（手动）。
- 自动同步：盒子无（desktop-only）。
- 按天聚合：盒子仅启动时执行；长期不重启 DB 会增长。
- 凭证：已全部清空。
- 数据：cc 库保留全量 opencode 明细（7/3 起连续）。
