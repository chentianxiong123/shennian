---
title: 'Skills 体系与 Agent 协议设计'
date: 2026-05-26
---

# Skills 体系与 Agent 协议设计

> 从 5 个 SKILL.md 到瘦 skill 协议的演化
> 2026-05-26 ~ 2026-06-08

---

## 一、最初的 5 个 Skill

最开始在 project-archive 包中设计了 5 个 skill，构成完整的 Agent 协作体系：

| Skill | 职责 | 核心内容 |
|-------|------|----------|
| `project-archive.md` | 归档能力 | 触发条件、存储结构、命名规范 |
| `project-recall.md` | 检索能力 | archive-search、archive-decision 查询 |
| `project-status.md` | 状态同步 | 双层 STATUS.md 结构、锁机制 |
| `project-coordinate.md` | 协作协议 | 三 Agent 架构、事件机制、工作间模型 |
| `project-hermes.md` | Hermes 行为 | 10 项职责 + 全生命周期 |

### 配套脚本

```
core/
  init-project.py       — 项目初始化
  update-status.py      — STATUS.md 写入（带锁）
  archive-search.py     — 归档检索
  archive-decision.py   — 决策记录
  workspace.py          — 工作间创建/状态管理
  dispatch.py           — Hermes 派发 CC/Codex
  trigger_server.py     — 事件触发服务
  watcher.py            — 状态监听
```

---

## 二、Skill 审查过程

这 5 个 skill 经历了三轮审查：

**第一轮（5/28）：全流程链路断点分析**
- 走通整个流程（用户需求 → 归档）
- 标出 6 个断点，其中 2 个致命（事件没人处理、set-status 命令不存在）
- 结论：**事件驱动链路不通，需要重构**

**第二轮（5/29）：一对一审查**
- 每个 skill 单独过，列出问题
- 发现 archive-search.py 标题不匹配（## 成果 vs ## 探索成果）
- 修复合入方向、路径硬编码等问题
- 新增 `_history/` 备份旧版本

**第三轮（6/8）：技能重构到瘦协议**
- skill 从"完整文档"瘦身成"触发规则 + 几条指令"
- 每个文件只定义一件事
- 去掉所有 Python 脚本依赖（归档、检索、状态写入改为直接文件操作）

---

## 三、最终瘦 Skill 结构

```
skills/
  workspace.md           — 工作间创建规范
  claude-code/
    SKILL.md             — CC 开发规范（触发 → 开发 → commit → notify）
  codex/
    SKILL.md             — Codex 审查规范（触发 → 审查 → REVIEW/FAIL → commit）
  hermes/
    hermes-plan.md       — 任务规划
    hermes-create-workspace.md  — 创建/启动工作间
    hermes-archive.md    — 终审归档
    hermes-recall.md     — 历史检索
```

### SKILL.md 模板格式

```markdown
---
title: "CC 开发规范"
trigger: "收到 /develop-ws 或 /fix-ws"
---

## 身份
你是 CC（Claude Code），负责**实现**。

## 触发场景
- `/develop-ws` — 新任务，读 STATUS.md 了解需求
- `/fix-ws` — Codex REVIEW-FAIL，读 STATUS.md 了解问题

## 工作流程
1. 读 STATUS.md 了解当前状态
2. 读文件系统了解项目现状
3. 实现或修复
4. 追加迭代记录到 STATUS.md
5. git add && git commit -m "[CC-WSxxx] 做了什么"
6. 执行 notify-agent.sh

## 结束条件
Codex 给出 REVIEW-PASS = 工作间完成
```

---

## 四、STATUS.md 协议规范

核心设计思想：**STATUS.md 是唯一的交流通道。**

### 项目级 STATUS.md

```markdown
# 项目名

## 任务池
| 工作间 | 任务 | 状态 | 轮次 |
|--------|------|------|------|
| ws001 | JWT 认证 | completed | 4 |

## 技术决策
- JWT 存储 → pyjwt + 24h expire
```

### 工作间级 STATUS.md

```markdown
# ws001 — JWT 认证

## 任务
实现 JWT 登录签发
## 约束
用 pyjwt，token 有效期 24h

## 迭代记录
| 轮次 | 提交者 | 结果 | 详情 |
|------|--------|------|------|
| 1 | CC | 完成 | 实现 JWT 登录签发 |
| 2 | Codex | REVIEW-FAIL | token 过期校验缺失 |
| 3 | CC | 修复 | 增加 exp 字段检查 |
| 4 | Codex | REVIEW-PASS | 审查通过 |

## 状态
completed
```

---

## 五、设计原则演化

| 版本 | 原则 | 问题 |
|------|------|------|
| V1 | 5 个大 skill + 9 个 Python 脚本 | 太厚，改一个脚本要改所有引用 |
| V2 | 合并成 3 个 skill + 去掉脚本依赖 | 还不够瘦 |
| V3 | 瘦 skill：每个文件只定义一件事 | 够了 |
| V4 | 协议层 → SKILL.md，路由层 → n8n | 彻底解耦 |

最终的结论：

1. **SKILL.md 不是文档，是 Agent 的启动指令** — 触发规则 + 几条关键动作
2. **协议层不依赖任何脚本** — 读、写、commit 都是 CLI 原生操作
3. **瘦到不能再瘦** — 每个 skill 不超过 30 行，一个屏幕看完
4. **事件驱动** — Agent 不做主动决策，收到指令才动
