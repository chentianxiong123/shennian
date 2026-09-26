---
title: 'HomeSense v5 — 云大脑开发任务书（B 线）'
date: 2026-09-01
---

# HomeSense v5 — 云大脑开发任务书（B 线）

> 交给：云端服务开发（Go agent 内核 / 网关侧）
> 关联：v5/ARCHITECTURE.md §1.5（云大脑 + 执行端）、《v5-任务书-A-执行端.md》（对端）
> 基座：`v5/backend`（picoclaw Go 内核，已克隆，全量编译 ✅、64 包测试 ✅）

---

## 0. 一句话任务

把 `v5/backend` 从"能编译的源码"变成**一台真正跑起来的云端服务**：gateway 起服务、开 WebSocket 面、能把家庭大脑（agent）的推理连上 MCP 执行端。这是"云端沙箱大脑"的第一个可运行版本。

## 1. 现状（已就绪的底座）

- `go build ./...` ✅ 全量通过；`go test ./pkg/...` ✅ 64 包全绿（唯一失败 `netbind` 系本机无 IPv6 的环境问题，可忽略）。
- 入口：`cmd/picoclaw/main.go:170 func main()`，内置 `gateway.NewGatewayCommand()`。
- 配置模板：`config/config.example.json`（577 行），含 `model_list`、`channels`、`mcp`、`gateway` 等段。
- 关键端口：gateway `host: localhost, port: 18790`（config 第 570-573 行）。
- MCP：`pkg/mcp/manager.go` 用 `mcp.NewClient` 连接外部 MCP server（**我们当 client**）。
- 渠道：`pkg/channels/` 有 pico / pico_client / 飞书(feishu) 等现成渠道。

## 2. 交付目标（按序，一条条来）

### 2.1 让 gateway 跑起来（P0，先出活）

1. 复制 `config/config.example.json` → `config.json`，填一个真实可用的模型（如 deepseek / glm，或复用我们现有 CPA 网关的模型配置思路：`~/.homesense/agent/models.json` 里的 cpa provider）。
2. `go build -o /tmp/opencode/picoclaw ./cmd/picoclaw/` 起服务，`setsid nohup` 后台常驻。
3. 验证：gateway 在 18790 起来；`/pico/ws` WebSocket 面可连（配置里 `pico` channel 开着）。
4. 输出一份"云大脑运行手册"：怎么配模型、怎么起、怎么探活。

### 2.2 云端当 MCP client 连执行端（P1，打通闭环）

1. 在 config 的 `mcp.servers` 段加一条指向执行端的 MCP server（picoclaw 的 `mcp.servers` 支持 stdio/sse/http 三类；配了 `url` 默认就是 `sse`）：
   ```json
   {
     "homesense-executor": {
       "enabled": true,
       "type": "sse",
       "url": "http://<盒子/手机IP>:51122/executor"
     }
   }
   ```
2. 用 `pkg/mcp` manager 的现成链路加载它，验证 gateway 起来后 agent 的 tool 列表里出现 `executor_info`（执行端 A 线已注册的能力）。
3. 写一个最小验证：在 agent 对话里调用执行端工具，确认"云端→执行端"往返通。
4. 这是"沙箱推理 → 下发执行端 → 回传"完整链路的地基。

### 2.3 家庭大脑雏形（P2，慢做不抢）

1. 用 `pkg/agent` + `pkg/session` 起一个"家庭共享" agent 会话（对应架构：一个家庭 = 一个大脑，全家一条上下文）。
2. 把执行端能力 + timeline 记忆（v3 已有概念，见 v5/ARCHITECTURE.md §2）接到这个会话上。
3. 目标不是完美，是证明"全家一个大脑能调执行端干活"。

## 3. 验收标准

1. gateway 能常驻运行（`setsid nohup`），重启可恢复。
2. MCP client 连执行端成功：agent 工具列表出现 `executor_info`，且能调用成功。
3. 云端到执行端的完整往返（发起调用→执行端执行→结果回传）有日志可查。
4. 运行手册可让另一个人照着把服务起起来。

## 4. 对接约定（和 A 线执行端）

- 传输：SSE，执行端端点 `/executor`（A 线已定稿，勿改）。
- 我们是 **MCP client**（`mcp.NewClient` + `SSEClientTransport`），A 线是 server。
- 能力命名 kebab-case，参数 JSON；联调时先调 `executor_info` 验证注册成功。
- 执行端可能不在本机（盒子/手机），config 里 MCP server url 用真实设备 IP；联调阶段可先用本机 127.0.0.1:51122。

## 5. 红线提醒

- **不在云端塞执行端的 shell 能力**：执行端是封闭能力仓库（A 线负责），云端只做 MCP client 调用，不直接下发任意命令。
- 不改 `cmd/executor` 的传输约定（SSE / 51122 / `/executor`）。
- 多租户（家庭隔离）本阶段先不实现，先用单实例跑通闭环，别铺开。

## 6. 关键文件参考

- `cmd/picoclaw/main.go` — 入口 / 命令装配
- `pkg/gateway/gateway.go` — gateway 服务装配（channels.NewManager 在第 454 行）
- `pkg/mcp/manager.go` — MCP client 管理（337 行 mcp.NewClient）
- `config/config.example.json` — 配置模板（gateway 18790 / pico / mcp.servers）
- `pkg/channels/pico/` — pico 协议渠道（WebSocket 面）
- `/home/a1/HomeSense-Studio-v3/v5/ARCHITECTURE.md` §1.5 / §2 — 云大脑定位与记忆分层

## 7. 两线联调里程碑

- 阶段 1：本机闭环（云端 18790 + 执行端 127.0.0.1:51122，往返通）
- 阶段 2：跨机闭环（云端起服务器，执行端放盒子/手机真机，公网/局域网通）
- 阶段 3：沙箱化（云端推理放进沙箱，执行端只接最终命令）

---

*本任务书随讨论演进；改原则先问 owner。*
