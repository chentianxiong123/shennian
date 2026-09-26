---
title: 'ExecutorGateway 架构说明'
date: 2026-04-29
---

# ExecutorGateway 架构说明

## 设计目标

HomeSense Studio 的 Workflow 不应该直接耦合某一个 CLI、某一个设备协议，或者某一个外部 Agent。

它更合理的结构是：

- `WorkflowNode` 只声明“我要调用什么能力”
- `ExecutorGateway` 负责把这个能力分发到真实执行端
- `CLI / Service / Workflow / Agent` 只是不同的执行端类型

这层设计同时借鉴了：

- `dify` 的节点工厂与 runtime 分层
- `agentmesh` 的 executor / graph 执行思想
- `claude-code-agents` 的 tool registry / agent dispatcher 风格

## 当前实现

当前系统已经具备：

1. `ExecutorGateway`
   - `cli.invoke`
   - `service.invoke`
   - `workflow.run`
   - `plan.run`
   - `agent.dispatch` 占位

2. `PlanLibrary`
   - 会读取老项目的 `paths.json`
   - 把 `watch_bilibili_demo` 这类成功路径导入成结构化 plan

3. `executor_call` Workflow 节点
   - WorkflowRuntime 可以直接调用 `ExecutorGateway`
   - 这让 Studio 开始具备“Agent 中枢”的后端骨架

## 为什么这很关键

这层把系统从“工作流节点直接写 mi-cli / adb-cli 调用”升级成了：

```text
Workflow Node
  -> ExecutorGateway
    -> CLI / Service / Workflow / External Agent
```

所以以后接：

- `mi-cli`
- `adb-cli`
- `B站 CLI`
- `OpenClaw`
- `Codex`
- `Claude Code`

时，不需要每种能力都单独发明一套节点模型。

## 老项目 B站母路径

老项目里的 `watch_bilibili_demo` 现在会被：

- 导入 `PlanLibrary`
- 编译进 `compiled_knowledge_items`
- 通过 `/api/executor-gateway/plans/:id` 提供结构化 preview

这条路径当前的主线执行器已经切到：

- `mi-cli`：米家场景、小爱音箱、红外控制
- `adb-cli`：Android TV 连接、包名检查、应用启动

但这不是坏事。它恰好说明：

- 新项目已经承接了老项目的成功经验
- 计划与执行器已经分离
- 下一步只需要补真实设备验证，不需要重写计划表达

## 当前状态

一句话概括：

**现在 HomeSense 已经有了“执行器中枢 + 计划库 + 工作流调用中枢”的骨架。**

后面补充真实 `adb-cli / mi-cli / B站 CLI` 时，优先是在执行器层扩容，而不是改 WorkflowRuntime 主干。`hami-cli` 仅保留为历史参考，不再作为当前设备主线。
