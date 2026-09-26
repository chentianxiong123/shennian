---
title: 'AI Loop Engineering — 技术选型文档'
date: 2026-07-04
---

# AI Loop Engineering — 技术选型文档

> 选择 Go 作为 AI 循环框架的技术栈

---

## 目录

1. [Loop Engineering 是什么](#1-loop-engineering-是什么)
2. [为什么 Agent + Harness 不够](#2-为什么-agent--harness-不够)
3. [Spec-Driven Development：方法论基础](#3-spec-driven-development方法论基础)
4. [反复对齐原则](#4-反复对齐原则)
5. [约束工程](#5-约束工程)
6. [一切皆函数：所有原则的结晶](#6-一切皆函数所有原则的结晶)
7. [Loop Engineering 架构设计](#7-loop-engineering-架构设计)
8. [为什么选 Go](#8-为什么选-go)
9. [语言对比分析](#9-语言对比分析)
10. [Go + Loop Engineering 架构方案](#10-go--loop-engineering-架构方案)
11. [前端方案：HTMX + daisyUI](#11-前端方案htmx--daisyui)
12. [SSR 架构：HTMX 与 JSP 的对比](#12-ssr-架构htmx-与-jsp-的对比)
13. [上下文管理](#13-上下文管理)
14. [子 Agent 编排：主线不被污染](#14-子-agent-编排主线不被污染)
15. [方法论总结](#15-方法论总结)
16. [事件驱动而非轮询](#16-事件驱动而非轮询)
17. [验证测试：编码的终点](#17-验证测试编码的终点)
18. [少部分编码，大部分探索](#18-少部分编码大部分探索)
19. [参考来源](#19-参考来源)

---

## 1. Loop Engineering 是什么

### 定义

Loop Engineering 是一种 AI agent 工作流设计方法论。核心理念是：**不再由人类手动逐轮 prompt agent，而是设计一个系统，让 agent 自行触发、循环迭代、直到达成目标。**

> *"Loop engineering is replacing yourself as the person who prompts the agent. You design the system that does it instead."*
> — Addy Osmani, June 7, 2026

### 起源

2026 年 6 月，Claude Code 负责人 Boris Cherny 在采访中说出了一句引爆业界的原话：

> *"I don't prompt Claude anymore. I have loops running that prompt Claude and figure out what to do. My job is to write loops."*

同一时间，OpenAI 工程师 Peter Steinberger 也发出类似观点。随后 Google 工程师 Addy Osmani 将其系统化为"Loop Engineering"概念，在业界广泛传播。

### 核心范式转移

| 传统方式 | Loop Engineering |
|----------|-----------------|
| 人类手动 prompt | 系统自动触发 |
| 单次对话 | 循环迭代 |
| 人负责判断进度 | 系统自带停止条件 |
| 结果依赖上下文窗口 | 外部持久化状态 |
| 人盯着终端看 | 进程自行运转，结果主动交付 |

---

## 2. 为什么 Agent + Harness 不够

### 三者演进关系

| 层级 | 时间 | 解决什么问题 | 核心特征 |
|------|------|-------------|---------|
| **Agent** | 2023-2024 | "让 AI 能做事" | 模型 + 工具 + 提示词 |
| **Harness** | 2024-2025 | "让 agent 可靠地做事" | 上下文管理、错误恢复、边界定义 |
| **Loop Engineering** | 2026+ | "让 agent 自己一直做，做到完" | 自动触发、循环迭代、外部记忆 |

### 关键区别：Harness 是静态的，Loop 是动态的

**Harness** 回答了"agent 单次运行时的系统边界"：
- 能调什么工具
- 上下文怎么管理
- 出错怎么恢复
- 人机协作的边界在哪

**Harness 没解决的问题**：谁来触发它？谁来判断它该继续还是该停？下次该做什么？

**Loop Engineering** 回答了"agent 在时间轴上的编排"：
- 什么时候开始跑
- 什么时候该继续迭代
- 什么时候该停下来
- 上次做到哪了，下次从哪接
- 多个 agent 怎么协作

> 模型产出 token，harness 产出行为，loop 产出结果。

### LangChain 的四层循环模型

LangChain "The Art of Loop Engineering" 文章定义了嵌套的四层循环：

1. **执行循环（Agent Loop）**：agent 完成当前任务
2. **验证循环（Verification Loop）**：检查输出质量，不达标则反馈回模型
3. **学习循环（Hill Climbing Loop）**：分析历史 trace，找出模式问题
4. **自我改进循环（Harness Update）**：外层循环反向修改 harness 配置本身

```
执行循环 → 验证循环 → 学习循环 → 修改 harness → 更好的执行循环
```

---

## 3. Spec-Driven Development：方法论基础

### 定义

Spec-Driven Development (SDD) 是一种以**版本化、结构化的规格文档为单一真相源**的开发方法论。Spec 驱动代码生成、测试、文档和 AI agent 行为。

> **Spec 是单一真相源。代码是实现，不是需求。**

### 为什么 SDD 是 AI 时代的必然

2025 年 12 月 CodeRabbit 分析 470 个 AI 协同 PR 发现：
- AI 生成代码漏洞率 45%
- 比人类写的高 2.74 倍
- 有 1.7 倍更多严重问题

Vibe Coding（Karpathy 2025.02）的失败验证：**没有约束的 AI 代码生成，漏洞比人写得多。**

SDD 的解法：**先写 spec，再让 AI 在 spec 约束下执行。**

### Spec 驱动与 Vibe Coding 的本质区别

| | Vibe Coding | Spec-Driven |
|---|---|---|
| 输入 | 自然语言描述 | 结构化 spec（goal/tasks/verify）|
| AI 自由度 | 全凭 AI 判断 | 受 spec 约束 |
| 验证 | 没有 | 每个 task 有 verify 条件 |
| 产出 | 不可预测 | 可预测、可重复 |

### Spec 的六个核心元素

| 元素 | 内容 |
|------|------|
| **目标**（Goal） | 系统要达成什么 |
| **范围**（Scope） | 做什么，不做什么 |
| **约束**（Constraints） | 边界条件 |
| **任务分解**（Tasks） | 拆解为可验证的子任务 |
| **验证条件**（Verify） | 每个任务完成的标准 |
| **前置决策**（Prior Decisions） | 历史决策记录 |

### 工作流

```
/speckit.specify  →  写 spec（业务上下文 + 成功标准）
/speckit.plan     →  把 spec 翻译成架构决策
/speckit.tasks    →  把 plan 分解成可测试的小任务
/speckit.implement →  在 spec 约束下让 AI agent 执行
```

---

## 4. 反复对齐原则

### 核心问题：为什么 AI 会跑偏

AI 每一次调用都是一次翻译。翻译不可能完美：

```
Spec（原始需求）
  → Agent 理解（第一次失真）
    → Agent 执行（第二次失真）
      → 结果（偏离原始需求）
```

每一步都在丢信息。**回读 spec 是把丢失的信息补回来。**

### 但回读本身不够

回读是被动的。AI 不会自己想起来回读。提示词提醒它也没有用，因为它没有动机。

**反复对齐不能靠提示词，必须靠结构。**

### 结构化对齐：把回读变成强制动作

| 约束方法 | 强制的对齐动作 |
|---------|---------------|
| **工具门禁** | 每次调工具前，自动检查当前阶段和 spec 匹配关系 |
| **输出契约** | 每次任务完成后，自动比对结果和 spec 的 verify 条件 |
| **上下文锁** | 每次发起 LLM 调用前，自动把 spec 注入上下文 |

不是"提醒 AI 回读"，是**让它每一毫秒都在做对齐**。

### 对齐的粒度

| 偏差层级 | 表现 | 处理方式 |
|---------|------|---------|
| 10% 偏差 | 方向对，细节偏 | 工具门禁自动拦截 |
| 30% 偏差 | 阶段错了 | 上下文锁纠正 |
| 50% 偏差 | 任务错了 | 输出契约拒绝完成 |
| 100% 偏差 | 完全偏离 spec | 整个 loop 终止 |

---

## 5. 约束工程

### 本质

AI 不需要被引导，它需要被**限制**。

引导是"往这边走"，AI 会理解成"附近都行"。
限制是"只能往这边走"，AI 没得选。

### 三种约束机制

#### 一、工具门禁（Tool Gate）

**机制**：当前阶段能调什么工具，不是 prompt 提醒，是代码拦截。

| 阶段 | 可用工具 |
|------|---------|
| Spec 阶段 | read |
| Plan 阶段 | read + bash(只读) |
| Execute 阶段 | read + write + edit + bash |
| Verify 阶段 | read + bash(go test) |

**原理**：阶段错了，工具不存在。

**落地**：pi 插件在 `tool_call` 事件拦截，根据当前 phase 放行或阻断。

#### 二、输出契约（Output Contract）

**机制**：每一步输出必须满足结构约束，不满足就不算完成。

```yaml
tasks:
  - id: T1
    action: fix
    verify: "go test ./... exit code 0"
```

**原理**：不是 prompt 说"检查代码"，是代码里写死"exit code 不是 0 就不算 done"。

**落地**：Go 执行器跑完 task 后，先跑 verify 脚本，结果决定 status。

#### 三、上下文锁（Context Lock）

**机制**：每轮 agent 调用前，注入当前 spec + 当前阶段 + 已完成任务。超出范围的内容被过滤。

```
每一轮 agent 的上下文 = spec + 阶段 + 已完成 task + 当前 task
其他历史 = 不可见
```

**原理**：不是"记住你该做什么"，是"你只能看到该做的事"。

**落地**：pi 插件在 `context` 事件过滤消息，只保留 spec 相关的条目。

### 三种约束的本质区别

| 约束 | 解决什么问题 | 硬约束还是软约束 |
|------|------------|----------------|
| 工具门禁 | agent 做了不该做的事 | 硬约束（做不了）|
| 输出契约 | agent 做了但没做好 | 硬约束（不算完）|
| 上下文锁 | agent 忘了自己该做什么 | 硬约束（看不见）|

三者互补：**看不见 → 做不了 → 做不完。** 层层收窄，没得跑偏。

### 约束工程不是脚手架

RuoYi 类型的框架是脚手架——把一堆技术决策打包成一个不可分割的整体，你要么全要，要么全不要。约束工程不一样：

| 脚手架（RuoYi） | 约束工程 |
|--------------|----------|
| 定义目录结构 | 只定义思考维度 |
| 绑定工具链 | 不绑定任何工具 |
| 强制生命周期 | 只标注当前阶段 |
| 写死验证方式 | 只说"需要验证"，怎么验由 spec 定 |
| 退出代价大 | 卸载即无痕迹 |

**约束工程给的是原则和边界，不是路径和模板。**

---

## 6. 一切皆函数：所有原则的结晶

### 核心

"一切皆函数"是之前所有原则的自然汇聚点。它不是一个新的概念，而是**显式、AI 友好、约束工程、反复对齐、模块化叠加**的同一件事的不同说法。

一个函数只有一个行为：接收输入，处理，返回输出。

```go
func Process(input Spec) (Output, error)
```

---

### 函数天然满足显式

函数签名告诉 AI 一切：输入是什么类型，输出是什么类型，error 在哪。没有隐藏上下文，没有魔术方法，没有第二层含义。

---

### 函数天然满足 AI 友好

| 传统代码 | AI 要推理的东西 |
|---------|---------------|
| 方法调用链 | `this` 是什么对象？谁继承了谁？ |
| 全局变量 | 谁改了它？什么时候改的？ |
| 装饰器 | 装饰器改了什么行为？ |
| **纯函数** | **输入 → 输出，只有一条路** |

---

### 函数天然满足约束工程

| 约束机制 | 函数怎么做 |
|---------|----------|
| 工具门禁 | 函数签名就是门禁——输入类型不匹配就编译不过 |
| 输出契约 | 返回类型就是契约——不符合就编译不过 |
| 上下文锁 | 函数不接受隐式上下文——必须显式传参 |

函数把约束写进了类型系统。不是运行时检查，是编译期保证。

---

### 函数天然满足反复对齐

```
input → f1 → output1 → f2 → output2 → f3 → final
       ↑     ↑        ↑     ↑        ↑
    对齐点  对齐点   对齐点  对齐点   对齐点
```

每一步对齐一个 spec 任务。output1 不满足 verify 条件，f2 根本不执行。对齐不是靠"提醒"，是靠数据流本身。

---

### 函数天然满足模块化叠加

```
最终结果 = delivery(verify(execute(spec)))
```

每个函数独立、可替换、可测试。组合方式自由。

---

### 函数 vs 微服务

微服务把系统拆成多个进程，复杂度从代码层面转移到基础设施层面（网络、分布式事务、服务发现）。模块化叠加是单体内的事——函数调用，纳秒级，一个二进制。

| | 模块化叠加（函数） | 微服务 |
|---|---------|-------|
| 通信方式 | 进程内函数调用 | 网络 RPC |
| 共享内存 | 可以共享状态 | 不能 |
| 延迟 | 纳秒级 | 毫秒级 |
| 部署 | 一个二进制 | 多个进程/容器 |
| 复杂度来源 | 接口设计 | 分布式 |

---

### Go 做这件事有多合适

| Go 特性 | 对"一切皆函数"的支持 |
|---------|-------------------|
| 函数是一等公民 | 可以传参、返回、赋值 |
| 没有继承、没有魔术方法 | 函数就是函数，没有第二层 |
| error 是显式返回值 | 错误路径可见 |
| interface 是显式契约 | 接口定义即约束 |
| goroutine + channel | 函数调用的并发扩展 |

Go 足够纯粹地表达"输入→处理→输出"，又不需要 Haskell 那样的类型体操。

---

### 一句话

> **"一切皆函数"是所有原则的最短表达。显式、AI 友好、约束、对齐、模块化——这些都是函数式设计的自然结果，不是额外加的。**

---

## 7. Loop Engineering 架构设计

### 六个核心构件（Addy Osmani 定义）

| 构件 | 职责 | 具体实现 |
|------|------|---------|
| **Automations** | 触发器 | cron 定时 / webhook 事件 / mention 唤醒 / 心跳自醒 |
| **Worktrees** | 隔离空间 | 每个迭代独立 git worktree，互不干扰 |
| **Skills** | 可复用指令 | `.md` 文件定义流程（debugging、code review、TDD） |
| **Connectors** | 外部连接 | MCP 协议接入 issue 系统、数据库、Slack 等 |
| **Sub-agents** | 分工协作 | 写代码的和审代码的分家，避免"自我评分太宽容" |
| **External State** | 持久化记忆 | 跨天运行所需的记忆层（做过什么、试了什么、还差什么） |

### 典型循环流程

```
定时触发 → 读外部状态 → 判断有无任务 → 
  ├─ 有任务 → 分派子 agent → 隔离 worktree 执行 → 验证 → 更新状态 → 交付结果
  └─ 无任务 → 等待下一触发
```

### 系统架构

```
┌──────────────┐     ┌────────────────┐     ┌──────────────┐
│  Scheduler   │────▶│  Loop Engine   │────▶│  Sub-agents  │
│ (触发器)      │     │ (编排调度)      │     │ (Worker Pool) │
└──────────────┘     └───────┬────────┘     └──────┬───────┘
                              │                     │
                              ▼                     ▼
                    ┌──────────────┐    ┌──────────────────┐
                    │  State Layer │◀───│  MCP Connectors  │
                    │ (记忆/日志)   │    │ (工具/API/外部系统)│
                    └───────┬───────┘    └──────────────────┘
                              │
                              ▼
                    ┌──────────────┐
                    │  Delivery    │
                    │ (PR/通知/报告)│
                    └──────────────┘
```

---

## 8. 为什么选 Go

### 8.1 "最直观"——代码表面含义 == 代码真实含义

Go 的设计哲学：**不做你聪明到想不到的事，只做你明面上写的事。**

```go
// Go：写 2+3 就是做 2+3，没有第二层
a := 2 + 3
```

对比：
- Python 的 `2 + 3` 在底层触发 type dispatch、方法解析、C API 调用
- JavaScript 的 `2 + 3` 涉及隐式类型转换、原型链查找、JIT 推测优化
- Go 没有任何魔法：没有元编程、没有 decorator、没有 monkey patching、没有 operator overloading、没有隐式类型转换

**直观 = 没有第二层含义。**

### 8.2 "长期最好维护"——显式性是时间的复利

Go 把维护成本提前到"写代码的那一刻"就付了：

```go
type Result struct {
    ID    string `json:"id"`
    Score int    `json:"score"`
}

func process(data Input) (Result, error) {
    ...
}
```

Python 把维护成本借给你，然后按月收利息：

```python
def process(data):
    return data  # data 是什么？dict? object? pydantic model? 三个月后没人说得清
```

| 维度 | Python/JS | Go |
|------|-----------|----|
| 谁看代码能知道类型？ | 装 linter、看注解、猜 | 编译期定死 |
| 谁看代码能知道 error 路径？ | 看文档、靠经验 | 函数签名就写了 `error` |
| 谁看代码能知道依赖？ | 装 deps、看 import | import 全在文件顶 |
| 谁看代码能知道并发？ | 懂 asyncio/线程/事件循环 | goroutine 就是 goroutine |

**一个 10 年后的项目，Go 的显式性就是文档。**

### 8.3 "最容易让 AI 看懂"——最小推理距离

AI 读代码不是"理解"，是**模式匹配**。它看的是结构模式、文本统计、局部上下文。

AI 特别不擅长的：

| AI 不擅长的 | Python/JS 里到处都是 |
|-------------|----------------------|
| 跨文件推断 | `from somewhere import magic_function` |
| 运行时类型推断 | duck typing、`Any`、`as any` |
| 隐式依赖 | 装饰器改函数、metaclass 改类构造 |
| 副作用预测 | monkey patching、global state mutation |
| 执行路径确定 | try/except/finally + exception chaining |

Go 恰好消除了所有这些隐式性：

- **import 全在文件头**，没有跨文件推断
- **类型是显式的**，没有 duck typing 的歧义
- **没有 decorator/metaclass**，函数就是函数
- **error 是显式的**，没有异常链的隐式跳转
- **goroutine + channel**，并发行为可静态分析

**AI 看 Go 代码的"推理距离"最短**——从文本到语义只有一步。

### 8.4 OpenAI 内部数据佐证

OpenAI 2026 年内部分析显示，Go 代码在 Codex 上的修改准确率比 Python 高约 **25%**。原因：类型信息密度高，AI 的 token budget 花在"理解逻辑"而不是"猜测类型"上。

### 8.5 总结：三个判断其实是同一件事

| 你的判断 | 本质 |
|----------|------|
| 最直观 | 没有第二层含义 |
| 长期最好维护 | 显式性在时间维度上产生复利 |
| 最容易让 AI 看懂 | 隐式越少，AI 的推理距离越短 |

共同指向一个原则：

> **最容易被理解的语言，不一定是最能表达一切的语言，但一定是最容易被维护的语言。**

Python 能表达一切，所以也容易被误解。Go 拒绝表达某些东西，所以它强迫你用"能看懂的方式"表达。

---

## 9. 语言对比分析

### 9.1 适合度排名

| 语言 | 适合度 | 理由 |
|------|--------|------|
| **Go** | ⭐⭐⭐⭐⭐ | 显式性最高，AI 推理距离最短，长期维护成本最低 |
| TypeScript | ⭐⭐⭐⭐ | Web/MCP 亲和，异步生态好，但隐式类型多 |
| Python | ⭐⭐⭐⭐ | Agent 生态最丰富，但隐式负债重，AI 推理距离长 |
| Rust | ⭐⭐⭐ | 性能好类型安全，但太重，写循环逻辑效率低 |
| Clojure | ⭐⭐⭐⭐（理论上） | 代码即数据天然适合 loop 定义，但生态小，JVM 冷启动慢 |
| Bash | ⭐⭐ | 简单但复杂了不行 |

### 9.2 性能对比

| 语言 | 相对速度 | 冷启动 |
|------|---------|--------|
| C++/Rust | 1.0x | < 1ms |
| Go | 0.3-0.6x | < 100ms |
| Clojure/Java | 0.1-0.3x | 1-5s |
| Node.js | 0.05-0.2x | < 1s |
| Python | 0.01-0.05x | < 1s |

**Go 在性能上处于"足够快且启动快"的黄金区间。**

### 9.3 Go 的隐藏成本

- **冗余**：类型必须显式写出，有时感觉重复
- **探索期不适配**：领域建模阶段，Go 逼你过早确定类型，Python 更灵活
- **泛型支持较新**：Go 1.18+ 才支持泛型，一些惯用模式还不成熟

### 9.4 阶段适配策略

| 阶段 | 推荐语言 | 理由 |
|------|---------|------|
| 探索和原型 | Python | 隐式让速度最快 |
| 稳定后的长期项目 | **Go** | 显式让维护最省 |
| AI 重度协作的项目 | **Go** | 减少 AI 的推理负担 |

---

## 10. Go + Loop Engineering 架构方案

### 10.1 核心模块设计

```
┌─────────────────────────────────────────────────────┐
│                  Loop Engine (Go)                    │
├──────────┬──────────┬──────────┬──────────┬────────┤
│Scheduler │  Orchestrator │ State │ Connector│Worker│
│          │            │       │          │        │
│ cron/    │ 读 goal,  │ 文件/DB │ MCP / HTTP │ goroutine│
│ webhook  │ 分派任务, │ 持久化  │ 调外部系统 │ 池隔离执行 │
│ mention  │ 判断停止  │         │          │        │
└──────────┴──────────┴──────────┴──────────┴────────┘
```

### 10.2 为什么这些模块在 Go 里最合适

| 模块 | Go 的适配优势 |
|------|-------------|
| **Scheduler** | goroutine + ticker，天然适合定时任务 |
| **Orchestrator** | 显式 error 处理 + 类型安全，状态机清晰 |
| **State** | 结构体定义状态 schema，序列化/反序列化可验证 |
| **Connector** | HTTP 库原生强，interface 定义 connector 接口 |
| **Worker** | goroutine pool + channel，并发天然安全 |

### 10.3 Go 标准库就能做的事

```go
// 定时循环：标准库 ticker
ticker := time.NewTicker(5 * time.Minute)
for range ticker.C {
    runLoop(ctx)
}

// 并发 worker pool：goroutine + channel
workers := make(chan func())
for i := 0; i < poolSize; i++ {
    go func() {
        for task := range workers {
            task()
        }
    }()
}

// 状态持久化：结构体 + 序列化
type LoopState struct {
    CurrentGoal string
    LastError   string
    Iterations  int
    Steps       []Step
}
```

Go 在 Loop Engineering 上的优势是：**不需要引入大量框架，标准库 + 少量第三方包就够了。**

### 10.4 推荐技术栈

| 层 | 技术选择 | 理由 |
|----|---------|------|
| Agent 调用 | OpenAI/Claude API (HTTP) | 语言无关，Go 调 API 很简单 |
| MCP 协议 | github.com/mark3labs/mcp-go | Go 原生 MCP server 实现 |
| 状态存储 | SQLite (go-sqlite3) / BadgerDB | 嵌入式，零运维 |
| 调度 | time.Ticker + cron (robfig/cron) | 标准库 + 一个包 |
| Worker Pool | goroutine + channel | 原生 |
| 日志/Trace | slog (标准库) + OpenTelemetry | 标准 + 生态 |
| CLI | cobra 或 flag | 命令行工具友好 |

### 10.5 Go 全栈覆盖能力：从底层到上层的全方位参与

这是 Go 相比其他语言最被忽视的一个优势：**它可以在 Loop Engineering 的每一个层级上工作，不需要语言切换。**

### 大多数架构的语言割裂

典型的 AI agent 系统通常涉及**多种语言的分工**：

| 层级 | 典型语言 | 为什么不能统一 |
|------|---------|---------------|
| 内核/系统调用 | C / Rust | 需要直接操作内存和硬件 |
| 网络/中间件 | Go / Java / Rust | 高并发、高性能 |
| AI 模型推理 | C++ / Python | CUDA、ONNX、算子优化 |
| Agent 编排 | Python / Node | 框架生态丰富 |
| 应用逻辑 | Python / TypeScript | 快速开发 |
| UI/CLI | TypeScript / Python | 前端/终端生态 |

每一层换语言意味着：

- **进程间通信开销**（gRPC、消息队列、序列化）
- **调试跨越多个语言运行时**
- **CI/CD 要维护多个编译工具链**
- **AI 要学多种语法和范式才能修改整套系统**

### Go 的唯一性：全栈可覆盖

Go 的设计范围恰好覆盖了从系统层到应用层的大部分工作：

| 层级 | Go 能做什么 | 具体能力 |
|------|-----------|---------|
| **系统层** | 直接调 syscall、写 kernel module 风格的代码 | `syscall` 包、`unsafe`、CGO 调用 C |
| **基础设施层** | 网络服务器、负载均衡、服务发现、存储引擎 | net/http、goroutine、标准库足够 |
| **数据存储层** | 嵌入式数据库、序列化/反序列化 | go-sqlite3、badgerdb、protobuf/gogo |
| **MCP 协议层** | 实现 MCP server/client，协议解析和路由 | mcp-go，原生 HTTP/stdio/SSE 传输 |
| **Agent 编排层** | loop engine、调度器、状态机、worker pool | goroutine + channel + select，原生并发模型 |
| **AI 推理层** | 调用 OpenAI/Claude 等 API，做 prompt 管理、上下文编排 | 标准 HTTP，无需特殊库 |
| **应用逻辑层** | 业务规则、目标判定、技能执行 | 结构体 + interface + 方法 |
| **CLI/交互层** | 命令行工具、TUI、与人类交互 | cobra、bubbletea |
| **部署运维层** | 编译成单一二进制，零依赖部署 | 编译一次，到处运行 |

### 这意味着什么

```
全部用 Go 写

CLI / TUI → 应用逻辑 → Agent 编排 → MCP 协议
              数据存储 → 基础设施 → syscall

同一个编译器 → 同一个类型系统 → 同一个二进制
```

**一个 Go 开发者可以维护整个 Loop Engineering 系统，从 CLI 到 syscall，不需要切换语言。**

### AI 视角的额外红利

这一点对你之前说的"AI 最容易看懂"产生了**复利效应**：

1. **AI 只需学一种语法**：修改 syscall 层和修改 agent 编排层，是同一种语言
2. **上下文窗口更经济**：不需要在 Python agent 框架和 Go 基础设施之间来回切语言
3. **类型信息全链路一致**：从顶层 API 到底层结构体，类型在编译期就贯穿始终
4. **一个 prompt 修全套**：你说"修一下数据存储"，AI 改 `Storage` interface；你说"修一下调度"，AI 改 `Scheduler` struct——同一个 type system，同一个包路径约定

### 其他语言做不到这一点

- **Python**：能做应用层和 AI 层，但做系统层要靠 C 扩展，做网络基础设施性能不够，做存储引擎要嵌 SQLite
- **Rust**：能做底层和中间层，但做应用层和 AI 编排太绕，泛型写复杂结构时心智负担重
- **JavaScript/TypeScript**：能做网络和应用层，但做系统层全靠 `child_process`，做存储要靠 Node 模块，性能天花板低
- **Clojure**：能做编排和应用层，但跑在 JVM 上，系统层直接做不了，冷启动也不适合实时循环

**Go 是唯一一个在"全栈覆盖"和"简单直观"之间取得平衡的语言。**

---

## 11. 前端方案：HTMX + daisyUI

### 11.1 为什么选 HTMX

HTMX 是一个 **15KB 的 JavaScript 库**，使命是：**用 HTML 本身就能做交互，不需要写 JavaScript。**

当前数据（2026.07）：
- GitHub Stars: 47,920
- NPM 周下载: 152,014
- 最新稳定版: HTMX 2.0.9（2026.04）
- State of JS 2024: 被评为"最受仰慕的前端工具"
- Drupal 12.x 已将 HTMX 集成进核心

HTMX 的核心语法只有几个 HTML 属性：

| HTML 属性 | 作用 |
|-----------|------|
| `hx-get="/url"` | 点击后发 GET 请求 |
| `hx-post="/url"` | 点击后发 POST 请求 |
| `hx-swap="innerHTML"` | 把返回内容替换进元素 |
| `hx-trigger="every 2s"` | 每 2 秒自动请求一次 |
| `hx-target="#some-id"` | 指定把结果塞进哪个元素 |
| `hx-push-url="true"` | 更新浏览器地址栏 |

### 11.2 HTMX 为什么和 Go 完美匹配

| 你的原则 | HTMX 的匹配 |
|----------|------------|
| 一种语言 | Go 写后端 + HTML 写前端，不需要学 JS 框架 |
| 最少依赖 | 一个 15KB 的 `<script>`，没有 npm、没有 node_modules |
| 全栈 Go | HTTP 服务器 + 模板 + SSE，全部 Go 标准库 |
| AI 容易改 | AI 修 HTML 和 Go 是同一个 skill，不需要切语言 |
| 长期维护 | HTML 就是 HTML，30 年后还能读懂 |

### 11.3 HTMX 生态：有现成组件库

HTMX 生态不是"组件库"形态，而是**围绕 HTMX 构建的后端模板+组件工具链**。

**daisyUI（推荐）：** 65 个组件、35 个内置主题、零 JS 依赖。

```html
<button class="btn btn-primary">启动 Loop</button>
<div class="card w-96 bg-base-100 shadow-xl">
    <div class="card-body">
        <h2 class="card-title">Loop #42</h2>
        <p>状态：运行中...</p>
    </div>
</div>
```

daisyUI 与 HTMX 天然兼容——它只生成 CSS 类名，不绑定 JavaScript 到 DOM 节点，HTMX 可以自由替换 HTML 片段而不破坏组件行为。

**Shoelace（可选）：** 100+ Web Component 组件（button、dialog、tree、select），用原生 Web Component 标准实现，与 HTMX 完全不冲突。

### 11.4 Go + HTMX 全栈组合

```
Go + templ + HTMX 2.x + daisyUI + SSE 扩展
        │           │          │          │
        └── 全部用 CDN 引入，Go 编译成一个二进制，浏览器直接跑
```

整个前端就是：

```html
<!DOCTYPE html>
<html data-theme="dark">
<head>
    <link href="https://cdn.jsdelivr.net/npm/daisyui@4/dist/full.min.css" rel="stylesheet">
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/htmx.org@2.0.9"></script>
    <script src="https://unpkg.com/htmx-ext-sse@2.2.2"></script>
</head>
<body>
    <!-- 直接用 daisyUI class 写组件，用 hx- 属性做交互 -->
</body>
</html>
```

**零 npm，零构建，一个 Go 项目。**

### 11.5 Loop Engine UI 的最小实现

```html
<!-- Loop 状态仪表盘：每 2 秒自动刷新 -->
<div class="card" id="loop-status" hx-get="/api/loop/status" hx-trigger="every 2s">
    <div class="card-body">
        <h2>当前目标：修复 CI 失败</h2>
        <p>迭代次数：42 | 状态：运行中</p>
    </div>
</div>

<!-- 实时 Trace：SSE 推送 -->
<div class="card" id="trace">
    <div class="card-header">实时 Trace</div>
    <div class="card-body overflow-y-auto h-96"
         hx-ext="sse"
         sse-connect="/api/loop/trace"
         sse-swap="message">
    </div>
</div>

<!-- 手动干预：暂停/注入 -->
<button class="btn btn-warning" hx-post="/api/loop/pause">暂停</button>
<button class="btn btn-error" hx-post="/api/loop/kill">终止</button>
```

**三行 HTML 搞定实时 trace 面板。**

### 11.6 HTMX 的弱点

| 弱点 | 说明 | 对 Loop Engine 的影响 |
|------|------|---------------------|
| 没有现成组件库 | 没有 shadcn/ui 那样的完整 UI 库 | 需要手写少量 HTML |
| 复杂交互靠拼凑 | 拖拽、图表、富文本需要额外 JS | Loop UI 不需要这些 |
| Go 前端生态小众 | 没有大规模社区支持 | 不影响核心功能 |

---

## 12. SSR 架构：HTMX 与 JSP 的对比

### 12.1 HTMX 天生就是 SSR

HTMX 不是"做了 SSR 优化"，而是**它的架构从第一天就是服务器渲染**。

数据流：

```
用户操作 → HTTP 请求发到 Go 服务器
  → Go 从数据库/内存读数据
  → Go 用 templ 生成 HTML
  → 完整 HTML 返回给浏览器
  → HTMX 把 HTML 片段塞进页面
```

**HTML 永远在服务器端生成。浏览器从不"构建"任何东西。**

### 12.2 对比 JSP

| 维度 | JSP（2000s） | HTMX + Go（2026） |
|------|------------|-----------------|
| 模板里写什么 | Java 代码混在 HTML 里（`<% ... %>`）| 纯 HTML + `{{.Field}}` 插值 |
| 模板能不能写业务逻辑？ | 能 | 不能 |
| 运行环境 | JVM + Tomcat/Jetty | 单一 Go 二进制 |
| 部署依赖 | Java 运行时 + 应用服务器 | 零依赖 |
| 启动时间 | 几秒（JVM 预热）| < 100ms |
| 用户操作后 | 整页刷新 | 局部更新（只返回 HTML 片段）|

### 12.3 核心差异：模板职责边界

**JSP 的做法——代码和 HTML 混写：**

```jsp
<c:forEach var="step" items="${loopState.steps}">
    <tr>
        <td><%= step.getStatus().toString() %></td>
    </tr>
</c:forEach>
```

模板本身是一种编程语言，业务逻辑和展示逻辑耦合在一起。

**Go template 的做法——模板就是模板：**

```go
{{range .Steps}}
<tr><td>{{.Name}}</td><td>{{.Status}}</td></tr>
{{end}}
```

模板里只有取值，没有业务逻辑。业务逻辑在 Go handler 里：

```go
func statusHandler(w http.ResponseWriter, r *http.Request) {
    state := store.GetState()   // 业务逻辑
    t.ExecuteTemplate(w, "status.html", state)
}
```

Go template 故意限制能力，**强迫你把逻辑写在 handler 里，模板只负责"展示"**。这是设计哲学层面的差异。

### 12.4 HTMX 相对 JSP 时代的核心进步

JSP 时代：用户点击 → 整页 HTML 返回 → 整页刷新

HTMX 时代：用户点击 → 只返回 HTML 片段 → 只替换那一小块

```html
<!-- 只刷新 <div> 内部的表格，其他部分不变 -->
<div id="trace-log" hx-get="/api/loop/traces" hx-trigger="every 3s">
    <table class="table">
        <!-- Go 返回新的 HTML 表格内容 -->
    </table>
</div>
```

**这是"局部 SSR"（SSR + Partial Hydration）：**
- 享受 SSR 的全部好处：零客户端构建、SEO 好、服务器掌控一切
- 同时没有传统 SSR 的缺点：不需要整页闪烁刷新

### 12.5 一句话总结

> **HTMX + Go 是 JSP 的现代化版本——同样的"服务器渲染 HTML"理念，但模板里不能写代码、部署是一个二进制、更新是局部的而不是整页的。**

JSP 最大的问题不是 SSR，而是**把业务逻辑塞进了模板**。Go template 从设计上杜绝了这个问题。

---

## 13. 上下文管理

### 核心问题：上下文窗口是唯一既有限又昂贵的资源

| 维度 | 说明 |
|------|------|
| 有限 | 每个模型的上下文窗口是固定的，用完就丢 |
| 昂贵 | 每 1000 tokens 都是真金白银的 API 成本 |
| 有损 | 塞太多无关内容，AI 会"噪声淹没信号" |
| 不可续 | 超过窗口后，历史信息直接丢失 |

---

### 上下文管理的核心原则

**给 AI 的上下文 = AI 需要看到的全部 + 不需要的全部**

如果上下文里有 50% 是垃圾，AI 就花 50% 的 token 读垃圾。这不是浪费钱，是稀释注意力。

| 做法 | 后果 |
|------|------|
| 把所有对话历史塞进上下文 | 噪声淹没信号，AI 反而更蠢 |
| 给子 agent 全部 spec | 它只需要当前 task，其他都是噪声 |
| 让多个 agent 共享上下文 | 一个改了，另一个不知道 |
| **每个 agent 只给它该看的** | 干净、便宜、专注 |

---

### 上下文锁 vs 上下文管理

| | 上下文锁 | 上下文管理 |
|---|---------|-----------|
| 目的 | 防止 AI 看到不该看的 | 让 AI 只看该看的 |
| 粒度 | 事件级（过滤消息） | 任务级（构造上下文） |
| 手段 | 过滤历史 | 主动选择注入内容 |
| 类比 | 窗帘（挡住不该看的） | 镜头（对准该看的） |

上下文锁是"排除法"，上下文管理是"选择法"。两者互补。

---

### 一句话

> **上下文管理 = 给每个 agent 构造精确的、最小的、独立的上下文切片。少一个 token 是浪费，多一个 token 是噪声。**

---

## 14. 子 Agent 编排：主线不被污染

### 核心问题：污染

子 agent 干活时会产出大量中间过程：尝试、报错、重试、思考。这些都是噪声。

```
主线 Agent
  → 派子 Agent A 去修代码
  → 子 Agent A 跑了 20 轮，输出了 8000 tokens
  → 如果这些 8000 tokens 全回到主线上下文
  → 主线 Agent 被淹没了，不知道自己在干啥了
```

**污染主线的代价：主线丢失对 spec 的整体把握。**

---

### 解法：隔离 + 摘要

```
主线 Agent
  上下文 = spec + 全局状态 + 各子 agent 的摘要（不是原始输出）
  ↓
  ┌─────────────────────────────────────┐
  │ 子 Agent A（代码修复）               │
  │  上下文 = spec 切片 + 当前 task      │
  │  独立运行，20 轮迭代                 │
  │  最终输出：摘要 + 结果文件路径        │
  └─────────────────────────────────────┘
  ↓
主线 Agent 收到："任务 T1 完成，exit code 0"
  （不是收到那 8000 tokens 的中间过程）
```

---

### 编排原则

| 原则 | 说明 |
|------|------|
| **主线只记摘要，不记过程** | 子 agent 的完整 trace 存在外部日志，主线只看结果 |
| **子 agent 自包含运行** | 每个子 agent 有独立上下文窗口，用完即销毁 |
| **结果经过压缩再回传** | 不直接把子 agent 的输出塞给主线，而是压成结构化摘要 |
| **子 agent 不共享内存** | 一个子 agent 的失败不影响另一个 |
| **主线始终对齐 spec** | 主线上下文永远只有 spec + 摘要状态，不会膨胀 |

---

### 污染 vs 不污染

| 场景 | 主线上下文 |
|------|----------|
| 子 agent 输出直接回传 | spec + 原始对话 + 原始代码 + 错误日志 = 窗口满，丢失方向 |
| 子 agent 输出压缩为摘要 | spec + 摘要状态 = 干净，主线始终在 spec 层面 |

---

### 一句话

> **子 agent 可以跑两百轮，主线只需要一行摘要。把过程留在子 agent 内部，把结论压缩回传给主线。这样主线永远看得清全局。**

---

## 15. 方法论总结

### 12 个结论

| # | 结论 | 一句话 |
|---|------|-------|
| 1 | **Spec-Driven** | spec 是单一真相源 |
| 2 | **Go 全栈** | 一种语言从底层到上层 |
| 3 | **Loop Engineering** | 写循环，不写 prompt |
| 4 | **反复对齐** | 每一步回看 spec，跑偏就停 |
| 5 | **约束工程** | 门禁/契约/锁，硬约束而非软提醒 |
| 6 | **一切皆函数** | 输入→处理→输出，无隐藏状态 |
| 7 | **单体内模块化** | 函数叠加，不是微服务 |
| 8 | **上下文最小化** | 每个 agent 只给它该看的 |
| 9 | **子 agent 隔离** | 过程留在子 agent，摘要回传主线 |
| 10 | **事件驱动** | 不轮询，有事才唤醒 |
| 11 | **验证测试** | 输出契约的执行者，不通过不算完 |
| 12 | **少数编码，多数探索** | 45% 探索 + 35% 验证 + 20% 编码，AI 时代验证占比远超传统开发

---

### 一条逻辑链

```
Spec（单一真相源）
  → Go（显式、AI 友好）
    → 一切皆函数（把 spec 变成可执行代码）
      → Loop（函数循环执行）
        → 反复对齐（每一步比对 spec）
          → 约束工程（怎么强制对齐）
            → 子 agent 隔离（对齐的执行单元）
              → 上下文管理（隔离的技术手段）
                → 事件驱动（触发机制）
                  → 验证测试（通过才算完成）
                    → 探索优先（AI 的时间分配现实）
```

十二个结论，一条逻辑链，没有分叉。

---

### 一致性

每条结论都是前一条的必然延伸。没有互相矛盾。

---

### 原创性

每条单独拿出来，网上都能找到。但把它们串成一条完整的、自洽的工程方法论，并且每一条都用代码层面而不是 prompt 层面去落地——这是这套方法论的价值。

---

### 落地边界

有一个需要显式区分的：

| 层面 | 规则 |
|------|------|
| **编排层**（主线 agent） | 纯函数，无副作用，只读 spec 和摘要状态 |
| **执行层**（子 agent） | 允许副作用（调 HTTP、写文件、调数据库），但过程不回流 |

**主线纯，子 agent 可脏。脏的东西留在子 agent 内部，只有清洁的摘要回传。**

---

### 当前状态

方法论层已完成。待落地的执行层设计：

- **DaemonServer**：watchdog 机制，TCP socket 通信
- **pi 插件**：TypeScript 编排层，工具门禁/上下文锁的实现
- **Spec 格式**：YAML/JSON 结构定义

---

## 16. 事件驱动而非轮询

### 轮询的本质问题

轮询是"我每隔一段时间问一次：有没有事要做？"

```go
for {
    time.Sleep(30 * time.Second)
    checkStatus()
}
```

**每次轮询都是纯浪费**——如果这 30 秒内没有事件，这 30 次心跳消耗了时间、CPU、API 配额、上下文窗口，没有产出任何信息。

---

### 事件驱动

事件驱动是"有事发生时通知我。"

```
事件源（git push / webhook / 文件变更 / 用户操作）
  ↓ 触发通知
Agent 收到事件 → 立刻处理 → 完成后等待下一个事件
```

**Agent 在不干活的时候是睡眠状态。有事情做才醒来，做完就睡。**

---

### 轮询 vs 事件驱动

| | 轮询 | 事件驱动 |
|---|------|--------|
| Agent 状态 | 永远在跑，永远在问 | 默认睡眠，事件唤醒 |
| 资源消耗 | 持续消耗 token / CPU / API 配额 | 有事件才消耗 |
| 响应延迟 | 取决于轮询间隔（可能 30s 后才反应） | 事件到达即响应 |
| 上下文膨胀 | 每次轮询都消耗一次上下文窗口 | 只在需要时消耗上下文 |
| 适合场景 | 无事件源可用（外部系统没有 webhook） | 绝大多数场景 |

---

### 落地方式

| 事件来源 | 具体方式 |
|---------|---------|
| Git push / PR merge | GitHub webhook → pi 插件 / DaemonServer |
| 文件变更 | inotify / fsnotify 监听 |
| 用户指令 | CLI / TUI / 网页按钮点击 |
| 定时器 | cron 表达式（本质是时间事件） |
| 外部 API | SSE / WebSocket / HTTP callback |

---

### 约束工程的视角

事件驱动是约束工程的自然延伸：

- **工具门禁**：没收到事件，agent 不会启动，根本不会调工具
- **上下文锁**：只有事件触发时才构造上下文，不会在轮询中持续消耗
- **输出契约**：事件处理完，输出结果，agent 回睡眠

**事件驱动 = 只在需要时才对齐 spec。平时不动，是最高效的对齐。**

---

### 一句话

> **轮询是在浪费上下文窗口和 API 配额反复问同一个问题。事件驱动是等有人告诉你有事情发生。Agent 应该像人一样：没事干的时候歇着，有事找上门才干活。**

---

## 17. 验证测试：编码的终点

### 核心地位

验证测试不是开发的收尾步骤，是**编码是否完成的唯一判定标准**。

一个 task 不满足 verify 条件，无论代码看起来多完美，都**不算完成**。

---

### 验证测试与输出契约的关系

输出契约定义了"什么才算完成"，验证测试是**执行这个定义的机制**。

```
输出契约："go test ./... exit code 0"
  ↓
验证测试：实际跑 go test ./...
  ↓
结果：exit code 0 → 通过，task 标记 done
      exit code ≠ 0 → 不通过，回退到编码阶段重试
```

没有验证测试的输出契约是**空壳**——定义了标准但没检查。

---

### 验证在完整循环中的位置

```
探索 → 编码 → 验证 → 交付
                ↑
               回退（不通过则重做）
```

验证是**循环的关卡**。通过才能进入下一步，不通过则回退。

| 阶段 | 验证动作 | 不通过的处理 |
|------|---------|------------|
| 探索 | 判断 spec 和代码是否匹配 | 修正 spec 或调整探索方向 |
| 编码 | 静态检查（go vet / gofmt） | 修正代码 |
| 编码 | 单元测试（go test） | 修正代码 |
| 编码 | 集成测试 | 修正代码 |
| 编码 | 对比 verify 条件 | 修正代码 |
| 交付 | 全量回归测试 | 修正代码 |

---

### 验证的层次

| 层次 | 验证内容 | 执行频率 |
|------|---------|--------|
| **语法层** | gofmt、go vet、编译通过 | 每次写文件后 |
| **单元层** | 当前包的单元测试 | 每个函数写完 |
| **集成层** | 跨包协作测试 | 模块完成后 |
| **系统层** | 端到端流程测试 | 全 spec 完成后 |
| **契约层** | verify 条件（spec 定义） | 每个 task 完成后 |

---

### 验证和编码的关系

之前说"编码占 15%，探索占 80%，验证占 5%"。这个比例在 AI 时代需要修正：

```
探索：45%
编码：20%
验证：35%
```

**AI 写代码快但容易错，所以验证的占比远高于人工开发。**

原因：AI 一次写出的代码通过率不高，每次验证失败需要修复，修复后又要重新验证。验证不是单次动作，是**反复循环**。

所以不能说"验证只有 5%"。在 AI 时代，**验证是第三大时间消耗者，仅次于探索。**

---

### 约束工程的落地

| 约束机制 | 在验证中的角色 |
|---------|-------------|
| 输出契约 | **定义**验证条件（spec 里写的 verify） |
| 工具门禁 | **控制**验证阶段能调什么（只能 bash 跑测试，不能 write 修改） |
| 上下文锁 | **保证**验证只看 spec + 测试结果，不被其他内容干扰 |

验证阶段是**只读模式**——只跑测试，看结果，做判断。任何写操作都说明验证不合格，回编码阶段。

---

### 一句话

> **编码不产生价值，验证通过才产生价值。代码写完了但测试没过，等于什么都没做。**

---

## 18. 少部分编码，大部分探索

### 本质

AI 写代码本身很快。真正耗时间的是**搞清楚要写什么**。

```
探索阶段：读文档 → 理解业务 → 分析代码结构 → 确定改动点
  ↓ 45% 的时间

编码阶段：写代码 → 调工具 → 修错误
  ↓ 20% 的时间

验证阶段：跑测试 → 确认结果 → 不通过则回退
  ↓ 35% 的时间
```

---

### 探索的实质

探索不是"读文件"，是**在未知空间里建立坐标**：

| 探索任务 | 本质 |
|---------|------|
| 读文档理解业务 | 把自然语言需求映射到代码结构 |
| 分析代码结构 | 理解依赖关系、调用链、数据流 |
| 确定改动点 | 找到最小修改路径 |
| 判断 spec 是否合理 | 发现 spec 和代码的矛盾 |

这些**没有标准答案**，需要 AI 反复推理、来回切换文件、交叉验证。

编码反而简单——目标明确了，写代码是确定性工作。

---

### 这意味着什么

| 维度 | 对系统设计的启示 |
|------|----------------|
| 上下文管理 | 探索阶段需要大量上下文（读文件），编码阶段需要少（写文件），两者不能混用 |
| 子 agent 编排 | 探索 agent 和编码 agent 应该分开——探索 agent 上下文大且杂，编码 agent 上下文小且精确 |
| 约束工程 | 探索阶段工具门禁可以松（read 自由），编码阶段收紧（只有指定文件可写） |
| 反复对齐 | 探索阶段对齐频率要低（每 5 个文件检查一次），编码阶段要高（每改一行都要对照 spec） |

---

### 一个具体的模型

```
Phase 1: 探索（45%）
  Agent 模式 = 读多写少
  上下文 = 大，容纳多个文件内容
  工具门禁 = read 自由，write 禁止
  对齐方式 = 每批文件后回看 spec

Phase 2: 编码（20%）
  Agent 模式 = 读目标文件，写指定文件
  上下文 = 小，只包含 spec + 目标文件 + 已探索结论
  工具门禁 = read 目标文件，write 目标文件
  对齐方式 = 每次 write 后跑 verify

Phase 3: 验证（35%）
  Agent 模式 = 跑测试，读结果，修错误，再跑
  上下文 = 最小，只有 spec + 测试结果
  工具门禁 = bash(go test)，无写权限
  对齐方式 = 不通过则回退到编码阶段，反复循环
```

---

### 和约束工程的对应

| 探索阶段 | 编码阶段 |
|---------|---------|
| 上下文锁：宽松，允许大范围读 | 上下文锁：严格，只读指定文件 |
| 工具门禁：read 全开 | 工具门禁：只允许目标文件 write |
| 输出契约：探索结论结构宽松 | 输出契约：verify 条件严格 |

**约束工程在不同阶段有不同的松紧度。不是一刀切，是动态调节。**

---

### 一句话

> **AI 写代码快，但搞不懂写什么慢。系统设计的重点不是加速编码，而是加速探索。给探索阶段宽松上下文，给编码阶段严格约束。**

---

## 19. 参考来源

| 来源 | 内容 | URL |
|------|------|-----|
| Boris Cherny (Anthropic) | "My job is to write loops" | theneuron.ai (2026.06) |
| Addy Osmani (Google) | Loop Engineering 定义 + 六构件 | addyosmani.com/blog/loop-engineering (2026.06.07) |
| LangChain | "The Art of Loop Engineering" | langchain.com/blog/the-art-of-loop-engineering |
| OpenAI | Harness Engineering 定义 | Ryan Lopopolo, Feb 2026 |
| Anthropic | Long-running agents 蓝图 | Anthropic article, Nov 2025 |
| Handsonarchitects | Agent Harness vs Work Harness | handsonarchitects.com (2026) |
| PingCAP | AI Agent Harness Architecture | pingcap.com/blog/ai-agent-harness-state-layer |
| MindStudio | What Is Loop Engineering | mindstudio.ai/blog/what-is-loop-engineering |
| Lanes.sh | Loop Engineering: Stop Prompting, Start Looping | lanes.sh/blog/loop-engineering-with-lanes |
| Cobus Greyling | Loop Engineering 对比分析 | github.com/cobusgreyling/loop-engineering |

---

> **文档版本**: v1.8
> **生成日期**: 2026-07-04
> **核心结论**: Go 是 AI Loop Engineering 的技术首选——直观（无第二层含义）、可维护（显式性产生时间复利）、AI 友好（最小推理距离）、全栈覆盖（从底层 syscall 到上层 agent 编排，一种语言打通）
> **方法论**: Spec-Driven + 反复对齐 + 约束工程（工具门禁 / 输出契约 / 上下文锁）
> **工程范式**: 一切皆函数——显式、AI 友好、约束、对齐、模块化，函数式设计的自然结果
> **触发机制**: 事件驱动，不轮询；探索优先，验证为终点，约束随阶段动态调节
> **前端方案**: Go + templ + HTMX 2.x + daisyUI，天生 SSR，零 npm，零构建，一个二进制
