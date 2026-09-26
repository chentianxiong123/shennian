---
title: 'Skill / Executor 架构说明'
date: 2026-04-29
---

# Skill / Executor 架构说明

## 定位

HomeSense Studio 里 `Skill` 和 `Executor` 是两层不同能力。

- `Skill` 描述语义能力：这个能力是什么、适合什么任务、给 LLM 或 Agent 如何理解。
- `Executor` 描述执行契约：怎么调用、参数如何校验、输出如何解析、超时和协议是什么。

这层拆分的目的不是做一个重型插件市场，而是让 Studio 可以像 Dify 一样，把不同来源的能力挂成可编排节点。

## 当前实现

当前系统已经支持：

- 从 `skills/<name>/SKILL.md` 加载 skill 元信息。
- 从 `skills/<name>/EXECUTOR.json` 自动注册第三方 CLI 执行器。
- 通过 `cli.invoke` 在 Workflow Studio 中调用 CLI。
- 支持 `process_json_arg`、`process_stdin_json`、`in_process_module` 三种执行协议。
- 后端返回 action 描述、参数 schema、协议和超时。
- 前端 Studio 根据 `params_schema` 生成 action 参数表单，同时保留 JSON 高级编辑。

这意味着 HomeSense 支持的不是“完全无约束的任意 CLI”，而是：

**支持任意可以被 manifest 化的 CLI。**

这个表述更准确，也更适合项目展示：系统边界清楚，扩展方式可解释，未来能力可信。

## 厚适配器与薄接入

CLI 集成分两档：

### 1. 系统内置 CLI：厚适配器

系统主线自带的 CLI 可以做专属管理面板，因为它们承担项目演示闭环：

- `mi-cli`：米家、小爱、红外、场景、扫码登录。
- `adb-cli`：Android TV / 手机连接、包名查询、应用启动。
- `bilibili-cli`：B 站 dry-run 草稿、元数据、提交预演。

这些 CLI 可以在 `集成管理` 页面里拥有更厚的配置、诊断和实测 UI。它们不是普通外部插件，而是 HomeSense Studio 求职展示故事的一部分。

### 2. 外部陌生 CLI：薄接入

陌生 CLI 不默认做厚控制台。接入要求保持简单：

- 提供 `EXECUTOR.json`。
- 声明 `actions` 和 `params_schema`。
- 返回标准 JSON：`status / data / error / message`。
- 可选提供 `SKILL.md`，让 Chat / Agent 理解这个能力适合做什么。

Studio 对这类能力提供通用 manifest 浏览、JSON 调用、Workflow 节点编排。只有当某个外部 CLI 逐渐成为主线能力时，才考虑升级为专属厚面板。

`集成管理` 页面现在也提供外部 CLI onboarding 面板：

- 展示 `skills/<name>` 的推荐结构。
- 展示最小 `EXECUTOR.json` 模板。
- 展示最小 `SKILL.md` 骨架。
- 展示通用调用体示例。
- 可把调用示例套入当前选中集成的通用调用框。

这让“薄接入”不只是文档里的规则，也变成前端可见的接入路径。

## 推荐目录结构

```text
skills/
  example-cli/
    SKILL.md
    EXECUTOR.json
    runner.mjs
```

`SKILL.md` 用来给 Agent/LLM 理解能力；`EXECUTOR.json` 用来给 Runtime/Studio 真正执行和渲染表单。

## EXECUTOR.json 契约

```json
{
  "name": "example-cli",
  "executable": "./runner.mjs",
  "protocol": "in_process_module",
  "cwd": ".",
  "args": [],
  "timeout_ms": 30000,
  "actions": {
    "prepare_task": {
      "description": "Prepare a dry-run task for demonstration.",
      "params_schema": {
        "title": "string",
        "count": "number?",
        "dry_run": "boolean?",
        "tags": "string[]?"
      }
    }
  }
}
```

字段说明：

- `name`：CLI 执行器名称，对应 `cli.invoke.params.cli_name`。
- `executable`：执行入口，可以是二进制、脚本或 in-process module。
- `protocol`：执行协议。
- `cwd`：执行工作目录，相对路径会基于 skill 目录解析。
- `args`：固定参数，运行时 payload 会追加或写入 stdin。
- `timeout_ms`：单次调用超时。
- `actions`：可调用动作集合。
- `params_schema`：Studio 自动表单和后端参数校验的来源。

支持的参数类型：

```text
string
number
boolean
object
array
unknown
string[]
number[]
boolean[]
```

类型后加 `?` 表示可选，例如 `title: string` 是必填，`tags: string[]?` 是可选。

## 执行协议

### process_json_arg

把 payload 作为最后一个命令行参数传入。

```text
<executable> <args...> '{"action":"prepare_task","title":"Demo"}'
```

适合已经有 `run <json>` 入口的 CLI。

### process_stdin_json

把 payload 写入 stdin。

```text
<executable> <args...>
```

适合参数较长、需要避免命令行转义问题的 CLI。

### in_process_module

直接动态导入本地 JS module，并调用导出的 `run(payload)`。

```ts
export async function run(payload) {
  return { status: 'success', data: payload }
}
```

适合 HomeSense 自己包装的轻量适配器，例如当前的 `adb-cli`、`mi-cli`、`bilibili-cli`。`hami-cli` 只作为历史参考保留。

## 输入输出规范

Runtime 会把 action 和参数合并成统一 payload：

```json
{
  "action": "prepare_task",
  "title": "HomeSense Demo",
  "dry_run": true
}
```

CLI 必须返回标准 JSON：

```json
{
  "status": "success",
  "data": {
    "task_id": "demo_001"
  }
}
```

失败时：

```json
{
  "status": "error",
  "error": "INVALID_PARAMS",
  "message": "title is required"
}
```

这让 WorkflowRuntime、Trace、失败补偿和未来 Orra-style fallback 可以统一处理结果。

## 和 Agent / A2A 的边界

CLI Executor 适合确定性工具调用：

- ADB / 无障碍 / Android TV 控制
- Bilibili CLI
- OpenClaw CLI wrapper
- Home Assistant / 米家 wrapper
- 本地脚本、打印机、3D 打印机、文件处理工具

A2A / Agent Adapter 适合任务委派：

- Codex
- Claude Code
- 小龙虾式调度器
- 远程平台 Agent
- 需要长时间思考、写代码、调度多个工具的任务

二者都挂在 `ExecutorGateway` 下面，但边界不同：CLI 是工具，Agent 是协作者。

## Studio 里的使用方式

在 Workflow Studio 中添加 `executor_call` 节点：

```json
{
  "executor_name": "cli.invoke",
  "params": {
    "cli_name": "bilibili-cli",
    "action": "prepare_upload",
    "params": {
      "title": "HomeSense Studio demo",
      "dry_run": true
    }
  }
}
```

Studio 会根据 `cli_name + action` 找到 action schema，并生成参数表单。高级用户仍然可以直接编辑 `Action Params JSON`。

## 项目叙事价值

这套机制支撑 HomeSense Studio 的关键故事：

- Chat 负责触发和解释人的意图。
- Workflow Studio 负责像 Dify 一样编排流程。
- ExecutorGateway 把设备、CLI、服务、Agent 统一成可调用能力。
- Skill 提供语义，Executor 提供执行，Trace 记录结果。
- 新能力接入不需要改 WorkflowRuntime 主干，只需要新增一个 manifest 化执行器。

这正好符合项目定位：不是做千万并发产品，而是做一个架构自洽、可演示、可扩展的个人作品。
