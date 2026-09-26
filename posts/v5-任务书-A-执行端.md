---
title: 'HomeSense v5 — 执行端开发任务书（A 线）'
date: 2026-09-01
---

# HomeSense v5 — 执行端开发任务书（A 线）

> 交给：执行端开发（termux / 盒子侧）
> 关联：v5/ARCHITECTURE.md §1.5（执行端设计）
> 已落地：`v5/backend/cmd/executor`（v0.1 雏形，SSE MCP server）

---

## 0. 一句话任务

把 `v5/backend/cmd/executor` 从"只有 executor_info 的空壳"，做成一个**封闭式能力仓库 MCP server**——它跑在用户的 termux / 盒子上，承接云端下发的"能力调用"并本地执行，**严禁裸 shell 权限**。

## 1. 不可违背的原则（红线）

1. **零裸 shell**：源码中不得 import `os/exec` 直接执行用户输入的命令串。任何命令执行只能发生在"能力内部、参数白名单化"之后。
2. **执行端不是终端，是能力仓库**：agent 只能调用预先定义好的具名能力，每个能力有自己的参数 schema + 边界。
3. **能力默认拒绝**：新能力必须过白名单 / 拒绝正则两道检查，不匹配一律拒绝。
4. **不碰渠道层**：执行端不做飞书/微信等渠道，那不是它的职责。
5. **单进程常驻**：产物是单个静态 Go 二进制，`setsid nohup` 后台守护，适配 termux/Android。

## 2. 现状（v0.1，已提交 5957bf4）

```
cmd/executor/
├── main.go   # SSE MCP server，监听 127.0.0.1:51122，端点 /executor
└── tools.go  # 仅注册 executor_info（只读，无命令执行）
```

- 编译：`go build ./cmd/executor/` ✅
- 实测：MCP client 完整握手成功（连接→ListTools→CallTool→结构化返回）✅
- 依赖：`github.com/modelcontextprotocol/go-sdk`（v5/backend 已在 go.mod）

## 3. 交付目标

### 3.1 能力注册机制（先做这个，是地基）

设计一个**能力 manifest 注册表**，形如：

```go
type Capability struct {
    Name        string   // "adb-cmd"
    Description string
    InputSchema map[string]any   // 参数 JSON schema
    // 边界三件套
    AllowArgs   []string // 允许的子命令（如 adb: shell/screencap/input/tcpip）
    DenyRegexps []string // 拒绝正则（如 rm -rf, format, dd if=, mkfs）
    Timeout     time.Duration
    Handler     func(ctx, params) (result, error)  // 内部实现，用 os/exec 跑"固定模板命令"
}
```

- 所有能力集中在一个 `capabilities/` 注册表，启动时扫描注册。
- 核心约束：**参数进模板、模板进 exec**，而不是"用户命令直接进 exec"。
- 例（adb）：
  ```go
  // 参数: {action: "shell", args: ["dumpsys", "battery"]}
  // 拼接: adb {action} {args...}  → 只允许 action ∈ AllowArgs
  // 校验: args 每项过 DenyRegexps, 且不含 shell 元字符
  ```

### 3.2 能力域（按优先级，逐个封闭式实现）

| 能力 | 说明 | 边界示例 |
|---|---|---|
| `adb-cmd` | 白名单 adb 子命令 | 只许 `shell/screencap/input/tcpip/pair`，`shell` 子参数再过一道正则 |
| `netdisk-sync` | alist 网盘挂载同步（本机已有 `/home/a1/openlist-data`） | 只走固定配置文件；目标目录白名单 |
| `workflow-run` | 跑执行端 `workflows/` 目录里**预先注册**的脚本 | 脚本必须先有 manifest（描述/参数/绑定的设备或盘符）才可被调用 |

> adb 术语参考：`pkg/tools/fs`、`pkg/tools/hardware` 是现有可抄的控制面；`pkg/tools/shell.go` 里有现成的 denyPatterns 思路（rm -rf / format / mkfs / dd 全部拒绝）可平移。

### 3.3 可观测性（小但要有）

- 每次能力调用记一条日志：时间 / 能力名 / 参数摘要 / 结果码 / 耗时。
- `/executor` 之外加一个 `GET /healthz` 返回存活 + 能力清单，方便云端探活。

## 4. 验收标准

1. `go build ./cmd/executor/` 零告警。
2. 用 MCP client（参考 `/tmp/opencode/mcp-client/main.go`）连上后：`ListTools` 能看到全部已注册能力。
3. 调 `adb-cmd` 白名单内子命令 → 成功返回；白名单外 / 命中拒绝正则 → **明确拒绝**并回传原因。
4. 全能力域中没有"直接执行任意命令"的路径。
5. `adb-cmd`、`netdisk-sync`、`workflow-run` 至少完成前两个。

## 5. 关键文件参考

- `v5/backend/cmd/executor/main.go` — 入口（已定稿，别大改）
- `v5/backend/cmd/executor/tools.go` — 工具注册（重写为能力注册表）
- `v5/backend/pkg/tools/shell.go` — denyPatterns 参考
- `v5/backend/pkg/tools/fs/`、`pkg/tools/hardware/` — 现有工具控制面参考
- `/home/a1/openlist-data/` — alist 网盘挂载现有数据目录

## 6. 对接约定（和 B 线云大脑的接口）

- 传输：SSE，端点 `/executor`（保持不动）。
- 云端当 **MCP client** 连过来（`mcp.NewClient` + `SSEClientTransport`）。
- 能力命名 `kebab-case`，参数一律 JSON。
- 完成后与云大脑联调：云端调用 `executor_info` 能看到你注册的能力。

---

*本任务书随讨论演进；改原则先问 owner。*
