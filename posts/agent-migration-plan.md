---
title: 'Agent 架构迁移计划'
date: 2026-07-12
---

# Agent 架构迁移计划

> 2026-07-12 | 目标：从 opencode 迁移到自建 Pi 体系，ccswitch 留在 Windows 做路由+计费

---

## 一、当前环境全景

### 1.1 硬件
| 盘 | 容量 | 剩余 | 用途 |
|----|------|------|------|
| C: | 200GB | ~61GB | 系统 |
| D: | 275GB | ~136GB | 数据/项目 |
| R: | 1GB | 内存盘 | 缓存/TEMP |

### 1.2 主 Agent
| Agent | 版本 | 安装位置 | 数据大小 | 状态 |
|-------|------|----------|----------|------|
| **opencode** | 1.17.18 | `D:\nvm\...\node_modules\opencode-ai` | DB **1.9 GB** | 即将废弃 |
| **Claude Code** | 2.1.201 | `@anthropic-ai/claude-code` | ~10MB 会话日志 | 日常主力 |
| **Codex** | 0.142.1 | `@openai/codex` | 少量 | 偶尔 |
| **Hermes** | 最新 | `D:\hermes-agent` | 149 MB 运营数据 | 研究 |
| **Pi** | 0.78.0 | `D:\files\References\agent\pi\` (源码) | 源码 ~20MB | **目标平台** |

### 1.3 ccswitch (Windows 路由层)
| 项目 | 值 |
|------|-----|
| 版本 | 3.16.5 (Rust/Tauri) |
| 源码位置 | `D:\files\References\cc-switch\` |
| 可执行文件 | `C:\Programs\CC Switch\cc-switch.exe` |
| 数据库 | `C:\Users\a1\.cc-switch\cc-switch.db` (31 MB) |
| 代理端口 | `127.0.0.1:15721` (仅 Claude 启用) |
| 代理请求记录 | **55,464 条** (opencode 占 42,737 = 77%) |
| 总花费 | **$1,407** (opencode $538, codex $519, claude $350) |
| 当前状态 | **无法启动** (Tauri 文件已存在崩溃) |

ccswitch DB 结构 (proxy_request_logs):
```
request_id, provider_id, app_type, model, input/output/cache tokens,
input/output/cache cost (USD), latency_ms, status_code, session_id,
is_streaming, created_at, data_source, pricing_model
```

### 1.4 WSL
| 分发版 | 状态 | 位置 |
|--------|------|------|
| Ubuntu 26.04 | **已停止** | `D:\devtools\wsl\ubuntu` |
| docker-desktop | 已停止 | `D:\devtools\Docker\Images\main` |

WSL 配置: 镜像网络模式

---

## 二、关键问题

### 2.1 opencode 事件溯源膨胀
```
message.part.updated.1:  260,911 行 / 1,047 MB  (68%)
message.updated.1:        91,969 行 /   37 MB  (24%)
session.updated.1:        29,794 行 /   16 MB  ( 8%)
总计:                     383,036 行 / ~1.1 GB
```

根因: `schema/src/v1/session.ts` 统一 `durable`，`updateMessage()` / `updatePart()` 每次写完整快照，不增量、不合并、不删除。已补 #36523 指出根因。

### 2.2 端口 15721 不记日志
透传转发，不写 `proxy_request_logs`。记录来自 app 主动写 or session JSONL 同步。**已验证直接 INSERT DB 可行。**

### 2.3 opencode 二进制 BUG
Bun 独立 exe 硬编码 `B:/~BUN/root/`，R: 内存盘导致 opentui.dll 提取失败 (issue #36502)。

### 2.4 现状总结
- opencode DB 持续膨胀且不治本
- ccswitch UI 崩溃
- 多个 agent 散落，无统一计费
- 想在 WSL 开发但环境未搭

---

## 三、架构设计

```
┌─────────────────────────────────────────────────────────┐
│                    Windows 11                            │
│  ┌─────────────────────────────────────────────────────┐│
│  │  ccswitch (Rust/Tauri)                              ││
│  │   - 路由代理 :15721                                 ││
│  │   - 计费: cc-switch.db (proxy_request_logs)         ││
│  │   - 提供商管理/切换 (UI)                             ││
│  └─────────────────────────────────────────────────────┘│
│                                                          │
│  ┌─────────────────────────────────────────────────────┐│
│  │  Pi Agent (TypeScript, WSL)                         ││
│  │   - 直接写 ccswitch.db (INSERT proxy_request_logs)  ││
│  │   - JSONL 会话文件 (无 event sourcing 膨胀)         ││
│  │   - 模型切换仍走 ccswitch UI                        ││
│  └─────────────────────────────────────────────────────┘│
│                                                          │
│  ┌─────────────────────────────────────────────────────┐│
│  │  自定义 Harness (Go?, WSL) -- 远期                   ││
│  │   - 多 agent 编排 (Pi + Codex + 其他)               ││
│  │   - 统一的前置/后置处理管道                          ││
│  │   - 统一的会话/记忆/工具管理                         ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

### 设计决策
| 决策 | 选择 | 理由 |
|------|------|------|
| Agent 运行位置 | WSL Ubuntu | 避免 Bun B: 问题，Docker 原生，接近生产 |
| 代理/路由 | ccswitch (Windows) | 现有基础设施，UI 管理提供商 |
| 日志写入 | Pi 直接写 ccswitch.db | API 后一行 INSERT，已验证可行 |
| 会话文件 | JSONL (Pi 原生) | 无 event sourcing 膨胀 |
| 未来 Harness | Go vs TypeScript | 待决定 |

---

## 四、Pi 改造清单

### 4.1 新增能力

**A. ccswitch 计费写回 (`sdk.ts:streamFn`)**
- `better-sqlite3` 或 `sql.js` 包
- 每次 API 调用后 INSERT 一行
- WSL 访问: `/mnt/c/Users/a1/.cc-switch/cc-switch.db`
- `data_source='pi_session'`, `app_type='pi'`

**B. 提供商切换**
- 和 ccswitch 解耦 (Pi 不知具体 provider)
- Pi 只配置 `baseUrl=http://127.0.0.1:15721`
- 模型切换 (Ctrl+P) 在 Pi 内，路由由 ccswitch 控制

**C. WSL 路径适配**
- 默认 cwd 在 WSL 文件系统
- Windows 项目: `/mnt/d/projects/...`
- ccswitch DB: `/mnt/c/Users/a1/.cc-switch/cc-switch.db`

### 4.2 不需要改的
| 模块 | 理由 |
|------|------|
| 会话管理 (JSONL) | 原生无 event sourcing |
| 工具系统 | 已完整 (read/bash/edit/write) |
| 扩展系统 | 已完整 |
| TUI | 已完整 |

---

## 五、迁移路线图

### 阶段 A: WSL 环境搭建 (~半天)
```
1. wsl --shutdown && wsl ~
2. 装 nvm, Node.js, Go
3. git clone https://github.com/earendil-works/pi ~/pi
4. cd ~/pi && npm install && npm run build
5. 验证: node dist/cli.js --version
```

### 阶段 B: ccswitch 修复 (~半天)
```
1. 修复 Tauri 崩溃 (lock 文件, TEMP 清理)
2. 确认 15721 正常工作
3. 确认直接 INSERT DB 可行 (已验证)
```

### 阶段 C: Pi 基础改造 (1-2 天)
```
1. streamFn 加 ccswitch.db INSERT
2. 配置 WSL bash path
3. 测试: 发请求, 确认 ccswitch.db 出现 pi_session
4. 验证 ccswitch UI 显示 token/cost
```

### 阶段 D: 日常切换 (并行)
```
- 日常编码 → Pi (WSL)
- opencode 备选 (已有会话继续)
- ccswitch UI 管理提供商
```

### 阶段 E: 自定义 Harness (远期)
```
1. 设计 multi-agent 编排接口
2. 任务调度 → agent 分配 → 结果汇聚
3. 前置处理 (prompt 增强, 上下文注入)
4. 后置处理 (结果验证, 日志聚合)
```

---

## 六、环境清理

| 资源 | 大小 | 处理 |
|------|------|------|
| opencode.db | 1.9 GB | **废弃后删除** |
| opencode 源码 fork | 188 MB | 保留或删 |
| `.opencode` node_modules | 52 MB | 清理 |
| `.config/opencode` node_modules | 52 MB | 清理 |
| opencode 全局包 | 527 MB | 确认迁移完成再删 |
| Pi 源码参考 | ~20 MB | 迁移到 WSL |

---

## 七、风险

| 风险 | 缓解 |
|------|------|
| ccswitch 无法修复 | 直接写 DB 绕过 proxy |
| WSL `/mnt/d` 性能差 | 项目移到 WSL 内 |
| Pi 缺功能 | 有完整本地 fork 可改 |
| ccswitch DB WAL 过大 | 定期 checkpoint |

---

## 八、待定事项

1. **Harness 语言**: Go vs TypeScript?
2. **项目代码放哪**: WSL 内 vs `/mnt/d`?
3. **ccswitch 修复优先级**: 不影响 DB 写方案，但修了才有 UI
4. **opencode 保留至**: Pi 跑通 1 个完整编码会话后
5. **Pi 需要额外工具?**: WSL shell 已完备

---

## 附录: 代码索引

| 文件 | 关键行 |
|------|--------|
| `pi/packages/coding-agent/src/core/sdk.ts` | 204-432 (createAgentSession, streamFn) |
| `pi/packages/coding-agent/src/core/agent-session.ts` | 254-3059 (生命周期) |
| `pi/packages/coding-agent/src/core/session-manager.ts` | 757-1567 (JSONL 持久化) |
| `pi/packages/coding-agent/src/main.ts` | 477-786 (CLI 入口) |
| `opencode/packages/opencode/src/session/processor.ts` | 456, 596 (step-finish updateMessage) |
| `opencode/packages/schema/src/v1/session.ts` | 502-507 (durable 定义) |
| `C:\Users\a1\.cc-switch\cc-switch.db` | proxy_request_logs 表 |
