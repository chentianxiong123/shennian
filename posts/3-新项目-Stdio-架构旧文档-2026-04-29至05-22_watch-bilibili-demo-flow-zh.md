---
title: 'Watch Bilibili On Toshiba TV Demo'
date: 2026-04-29
---

# Watch Bilibili On Toshiba TV Demo

## 定位

这条工作流是 HomeSense Studio 的第一个家庭娱乐主线演示流。它不是单纯的“打开一个 App”，而是把用户自然意图转成可追踪、可复用、可编排的设备执行链。

目标叙事：

```text
用户说：我想在东芝电视上看 B 站。
系统执行：解析意图和家庭上下文 -> 执行米家电视场景 -> 让小爱中枢补执行 -> 连接 Android TV ADB -> 查看包名 -> 打开小电视 App。
```

## 当前实现

Seeded workflow:

```text
Watch Bilibili On Toshiba TV Demo
```

节点链路：

1. `start`：注入家庭场景输入，包括 `target_tv`、`set_top_box`、`app_package`。
2. `code`：生成可展示的 intent/context route。
3. `scene_execute`：调用 `mi-cli.scene_execute` 执行米家手动场景，比如“东芝电视开机”。
4. `xiaoai`：调用 `mi-cli.speaker_execute`，让小爱音箱中枢执行补充指令。
5. `executor_call` + `agent.dispatch`：通过 `mi_adb` adapter 执行 `adb-cli.ensure_connected`。
6. `executor_call` + `agent.dispatch`：通过 `mi_adb` adapter 执行 `adb-cli.list_packages`。
7. `executor_call` + `agent.dispatch`：通过 `mi_adb` adapter 执行 `adb-cli.launch_app`，目标包名为 `com.xiaodianshi.tv.yst`。
8. `answer`：输出演示闭环结果。

## 证明点

- `WorkflowRuntime` 可以跑多节点设备流程。
- `ExecutorGateway` 可以统一承接 `cli.invoke` 和 `agent.dispatch`。
- `Skill/CLI` 可以作为外部执行能力接入，不要求所有能力写死在后端。
- `agent.dispatch` 已经能把“目标 agent/adapter + task + payload”转成实际 CLI 执行。
- 虚拟设备阶段可以先形成可测试闭环，后续替换为真实 ADB / mi-cli / B 站 CLI。

## 下一步

1. 把这条工作流接入 Chat intent 命中路径。
2. 加入执行前 preview，让用户看到将要控制哪些设备。
3. 加入失败分支：米家场景不存在、小爱执行失败、ADB 连接失败、包名不存在、红外设备未知。
4. 把虚拟设备状态显示到 Studio 或设备侧栏，方便录屏展示。
