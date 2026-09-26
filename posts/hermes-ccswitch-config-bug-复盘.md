---
title: 'ccswitch "应用 <agent> 配置" 写入策略是"整段追加",导致 YAML duplicate 键报错'
date: 2026-06-07
---

# ccswitch "应用 <agent> 配置" 写入策略是"整段追加",导致 YAML duplicate 键报错

> 一份给 ccswitch 维护者的 issue 草稿。适用于任何被 ccswitch 管理的、配置文件是 YAML 格式的 agent / runtime(claude / codex / gemini 之外的第三方应用,例如 hermes / openclaw 等)。

---

## 环境
- ccswitch (Rust 编译的 Tauri 桌面应用,托盘常驻)
- 任意受 ccswitch 管理的第三方 agent / runtime(下文以 `<agent>` 代替)
- 配置文件: `~/{app 配置目录}/config.yaml`
- 操作系统: Windows 11(在 macOS / Linux 应同样可复现,因为问题在 ccswitch 的 Rust 代码,不在 OS 行为)

## 现象
启动 `<agent>` 时报:
```
配置错误: Failed to parse <agent> config as YAML: duplicate entry with key "..."
```
`...` 可能是 `custom_providers` / `model` / `mcp_servers` 三者之一,也可能其他顶层键。

`config.yaml` 里出现重复的顶层键。

## 复现步骤
1. 正常使用 `<agent>`,`config.yaml` 是 `<agent>` 自己的完整配置(包含 agent / terminal / display / voice / security / cron / kanban / gateway / 各种 auxiliary provider 等数百个字段)
2. 在 ccswitch 托盘菜单里点击 `<agent>` 的"切换到 <某个供应商>"(或 ccswitch 自动检测到 model 指针指向不存在的供应商,自动重建)
3. 触发"应用 <agent>" 动作
4. 再次启动 `<agent>` → YAML 报 duplicate

## 根因
ccswitch 的 "update <agent> model defaults after switching to '<provider>'" 函数(疑似位于 `cc_switch_lib::services::provider` 模块)实现是:

> 从 ccswitch 自己的数据库(`cc-switch.db` 的 `providers` 表)读出"它认为完整的 `<agent>` 配置" → **整段附加到 `<agent>` 的 `config.yaml` 末尾**

这份"完整配置"至少包含三个顶层键:
- `model:` (当前激活的 default + provider)
- `custom_providers:` (所有 `<agent>` 供应商列表)
- `mcp_servers:` (ccswitch 还会顺便带一份 mcp server 配置)

**ccswitch 从来不做 in-place 合并,只会"追加整段"**。所以:

| 情况 | 结果 |
|---|---|
| 目标文件已有 `model:` 块 | 追加后 → duplicate `model` |
| 目标文件已有 `custom_providers` 段 | 追加后 → duplicate `custom_providers` |
| 目标文件已有 `mcp_servers` 段 | 追加后 → duplicate `mcp_servers` |
| 目标文件**没有**这些键 | 看起来"成功",但 ccswitch 自己的小文件覆盖了 `<agent>` 的完整配置 |

## 旁证:ccswitch 对 `<agent>` 是"半吊子"管理
(以一个第三方 agent 为例,以下是通用现象)

- `cc-switch.db` 的 `proxy_config` 表有 claude / codex / gemini 的代理配置,**不一定有 `<agent>`**
- `proxy_live_backup` 表只对 claude / codex 有备份,**不一定有 `<agent>`**
- ccswitch 日志里大量 `[Claude]` 和 `[Codex]` 的请求记录,**很少或没有 `[<Agent>]`**
- `settings.json` 里 `currentProvider<Agent>` 字段可能缺失
- `providers` 表里 `<agent>` 供应商的 `is_current` 字段长期为 0

也就是说 ccswitch 在 UI 上声称管理 `<agent>`,但实现上**不一定有装网络代理、不一定标 `is_current`、不一定有 live takeover 机制**,而 "update <agent> model defaults" 函数又用了粗暴的"追加"策略。

## 日志特征(对排查有用)
- 写入时**不写 INFO 日志**,只在失败时打 WARN,例如:
  ```
  [WARN][cc_switch_lib::services::provider]
  Failed to update <agent> model defaults after switching to '<provider>':
  配置错误: Failed to parse <agent> config as YAML: duplicate entry with key "custom_providers"
  ```
- 写入"成功"时**完全静默**,无任何日志输出
- ccswitch 每次"应用"动作会在 `~/.cc-switch/backups/<app_type>/` 创建一份 `<app_type>_<时间戳>.yaml` 时间戳备份

## 建议的修复方向
按"根治性"递减,任选其一即可:

1. **改 in-place 合并**:读取文件 → 解析 YAML → 改 model 块的 default / provider 字段 → 写回。**不要追加**。
2. **写入前做 YAML 解析校验**:用 `serde_yaml` / `yaml-rust` 解析写入后的文件,确保无重复键、无 schema 错误。失败就回滚 + 报错。
3. **写入前用锁文件机制**:例如 `~/.{app}/.cc-switch.lock`,避免和 `<agent>` 自己的写入并发。
4. **如果决定保留"整体重写"策略**:
   - 完整重写 `<agent>` config(不是追加),保留 `<agent>` 自己的所有字段(不光是 ccswitch 知道的 N 个供应商)
   - 在重写前**备份**用户原始完整配置(不只备份 ccswitch 写的"应用前"版本)
5. **如果决定保留"追加"策略**(最不推荐):
   - 至少做去重:写入前先去掉 `model` / `custom_providers` / `mcp_servers` 这几个顶层键的旧值,再追加
6. **降低日志噪音**:写入"成功"也写一条 INFO,方便用户 / 开发者知道 ccswitch 对 `<agent>` 做了什么

## 临时绕过(给遇到同样问题的用户)
如果不想等修复,**退出 ccswitch 进程** 或把 `settings.json` 里 `"visibleApps": { "<agent>": false }` 设为 false 可以彻底规避 —— 但代价是 ccswitch 不能再帮你管理 `<agent>` 供应商。

也可以**把 `<agent>` 的 `config.yaml` 重命名成 `config.yaml.bak`**(让原位置空)—— 这时 ccswitch 会自己创建一个小文件,在它上面"切换"是 in-place 编辑、不重复 —— 但**这个文件只包含 ccswitch 关心的字段,`<agent>` 的所有个性化设置会丢**。

## 给其他用户的自查清单
如果你也遇到类似 duplicate 报错,可以按下面顺序自查:

1. 看 `~/.cc-switch/logs/cc-switch.log` 最近 50 行,搜 `Failed to update <agent>` —— 有日志就是中招
2. 看 `~/.cc-switch/backups/<app_type>/` 是否有最近 24 小时内的时间戳备份 —— 有就说明 ccswitch 在写
3. 打开 `config.yaml` 找 `model:` / `custom_providers:` / `mcp_servers:` 这几个键是不是出现两次
4. 临时绕过:退出 ccswitch 进程,问题立刻消失
