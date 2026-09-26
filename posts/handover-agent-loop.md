---
title: 'Hermes — Agent Loop 交接文档'
date: 2026-06-08
---

# Hermes — Agent Loop 交接文档

> 时间：2026-06-08
> 生成者：Hermes (deepseek-v4-flash)
> 背景：用户（a1）与 Hermes 构建多 Agent 对证循环（verify loop）基础设施

---

## 一、项目概要

构建一套 **CC ↔ Codex 对证循环** 基础设施，使两个独立 TUI agent 能通过 STATUS.md 协作，git commit 事件驱动，n8n 路由通知，simple-inject.ps1 完成窗口注入。Hermes 只做开头规划和结尾归档，不介入循环内部。

## 二、当前架构（最终形态）

```
┌─ 第 0 步 ──────────────────────────────────────────┐
│ Hermes：分析任务 → 写 STATUS.md 初始版               │
│          → launch-terminal.ps1 启动两个 agent        │
│          → 各注入 skill agent-loop                   │
└──────────────────────┬──────────────────────────────┘
                       │
         ┌─────────────▼─────────────────┐
         │  CC 窗口（常开，已加载 skill）  │
         │  Codex 窗口（常开，已加载 skill）│
         │                                │
         │  循环体：                       │
         │  1. 读 STATUS.md               │
         │  2. 干活（改代码/写审查）        │
         │  3. 追加 ## <名字>: 到 STATUS.md │
         │  4. git add && commit          │
         │  5. ./scripts/notify-agent.sh  │
         │     → curl n8n webhook         │
         │  6. n8n → 读 session → inject  │
         │     对方窗口收到 /agent-loop    │
         │  ↑____________循环____________↓ │
         │      直到某人写 REVIEW-PASS     │
         └──────────────┬─────────────────┘
                        │ 统一后
         ┌──────────────▼──────────────┐
         │ Hermes：归档到 project-archive│
         └─────────────────────────────┘
```

## 三、三层架构

| 层 | 职责 | 技术选型 |
|----|------|----------|
| 协议层 | STATUS.md 格式、REVIEW-PASS 规则、agent 行为 | SKILL.md（Hermes skill） |
| 路由层 | webhook 接收 → 解析 → 查 session → inject | n8n 流程图（Webhook + Code） |
| 物理层 | 窗口启动、HWND 捕获、剪贴板注入 | PowerShell 脚本 |

## 四、文件清单

### 4.1 项目测试目录

```
D:\test-loop\
├── .git\hooks\post-commit       ← 旧版 hook（直调 inject，后续改为调 notify 脚本）
├── scripts\notify-agent.sh      ← 通知脚本（curl n8n webhook）
├── STATUS.md                    ← 通信通道
└── hello.c                      ← 测试文件
```

### 4.2 n8n 基础设施

```
D:\DockerFiles\n8n-native\
├── sessions\                    ← session 注册文件（HWND 跟踪）
│   ├── cc.json
│   └── codex.json
├── scripts\
│   ├── launch-terminal.ps1      ← 启动 agent + 抓 HWND + 写 session
│   └── simple-inject.ps1        ← 剪贴板注入（写文字 + Ctrl+V）
└── templates\                   ← 模板文件
    ├── launch_agent.json
    ├── send_to_window.json
    └── README.md
```

### 4.3 n8n 工作流

| 工作流 ID | 名称 | 状态 | 说明 |
|-----------|------|------|------|
| s4nQJbFXGmgm2BTm | agent-loop-router | ✅ Active | Webhook → Code(解析 → inject) |

Webhook URL: `POST http://localhost:5679/webhook/agent-loop`
Payload: `{"author": "CC", "message": "..."}`

### 4.4 两个 CC 窗口（常开）

| 会话 | HWND | 注册文件 |
|------|------|----------|
| cc   | 2819790 | sessions/cc.json |
| codex | 3278594 | sessions/codex.json |

---

## 五、skill: agent-loop

> 位置：`D:\hermes-agent\skills\agent-loop\SKILL.md`（已有，需更新）

### 定义 `/agent-loop <名字>` 指令

```
收到 /agent-loop <名字> 后：

1. cat STATUS.md — 了解最新状态
2. git diff HEAD~1 — 查看变更
3. 按 STATUS.md 里的任务干活（写代码 / 写审查）
4. 追加 ## <名字>: 做了什么 到 STATUS.md
5. git add -A && git commit -m "<名字>: 做了什么"
6. ./scripts/notify-agent.sh <名字>
7. 如果 STATUS.md 最后是 REVIEW-PASS → 停下
8. 如果自己觉得任务完成 → 追加 REVIEW-PASS → commit → notify
```

### 参数

| 参数 | 说明 | 示例 |
|------|------|------|
| `<名字>` | STATUS.md 前缀、notify 身份标识 | CC、Codex、OpenCode |

### 约束

- 不碰 CLAUDE.md（项目级配置不受影响）
- 不包含初始化逻辑（STATUS.md 初始版由 Hermes 创建）
- 不包含 hook/n8n 搭建信息（那是 Hermes 环境搭建职责）

---

## 六、n8n Code 节点源码（route 节点）

```javascript
const { execSync } = require('child_process');
const fs = require('fs');

const input = $input.first().json;
const author = input.body.author;
const message = input.body.message || '';

if (!author) {
    return [{ json: { error: 'missing author' } }];
}

const TARGET_MAP = { 'CC': 'codex', 'Codex': 'cc', 'codex': 'cc', 'cc': 'codex' };
const target = TARGET_MAP[author];

const content = fs.readFileSync(
    'D:/DockerFiles/n8n-native/sessions/' + target + '.json', 'utf8'
).replace(/\ufeff/g, '');
const session = JSON.parse(content);
const hwnd = session.hwnd;

const injectMsg = '/agent-loop ' + author;
const psCmd = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File ' +
    '"D:/DockerFiles/n8n-native/scripts/simple-inject.ps1" ' +
    '-HWND ' + hwnd + ' -Message "' + injectMsg + '"';

const out = execSync(psCmd, { timeout: 10000 });
return [{ json: { status: 'ok', target, hwnd, message: injectMsg, output: out.toString().trim() }}];
```

## 七、完整流程（端到端测试）

```
# 1. Hermes 规划（手动/自动化）
写 STATUS.md 初始版 → launch CC → launch Codex

# 2. CC 干活 → 写入 STATUS.md → commit
git add STATUS.md && git commit -m "CC: 实现 JWT sign/verify"

# 3. CC 通知 Codex
./scripts/notify-agent.sh CC

# 4. n8n 路由 → inject → Codex 收到 /agent-loop
# Codex 读 STATUS.md → git diff → 审查 → 写评语 → commit

# 5. Codex 通知 CC
./scripts/notify-agent.sh Codex

# 6. 循环，直到某人在 STATUS.md 写 REVIEW-PASS
```

---

## 八、遗留问题

1. **notify-agent.sh** 当前是独立脚本。hook 中也可以放 `curl` 代替 `./scripts/notify-agent.sh`，减少文件散落
2. **launch-terminal.ps1** 的注入 skill 逻辑未开发（当前只启动窗口，后续需要首次启动时注入 skill 协议文本）
3. **session 文件 HWND 可能变化** — 窗口关闭/重启后 HWND 会变，需重新注册
4. **ARCHIVAL 第 0 步 Hermes 动作** — 暂无自动化，全部手动
5. **Codex 是否支持 skill 注入** — 需验证 Codex CLI 是否接受 `/agent-loop` 参数格式（当前两个窗口都跑 claude）
6. **多 agent 扩展** — 当前只支持两个（CC ↔ Codex），超过 2 个需修改路由逻辑 TARGET_MAP

---

## 九、Harness 判断

**是。这是一个 harness 工程。**

理由：
- 不直接产生业务价值（不写业务代码），而是提供了一套多 Agent 协作的基础设施框架
- 协调其他工具（两份 Claude Code TUI），定义了它们的通信协议和触发机制
- 各层可独立替换（inject 脚本、n8n 流程图、skill 协议）
- 本身体积小、模块化，不是应用而是骨架

类似 CI/CD pipeline 或测试 harness：本身不干活，但让干活的人能协作。