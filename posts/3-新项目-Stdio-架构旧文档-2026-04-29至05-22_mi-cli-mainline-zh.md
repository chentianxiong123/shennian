---
title: 'mi-cli 主线说明'
date: 2026-04-29
---

# mi-cli 主线说明

## 定位

`mi-cli` 是 HomeSense Studio V1 的唯一米家控制核心。HA 和 `hami-cli` 只保留为历史参考，不再作为当前家庭娱乐演示链路的活跃依赖。

V1 目标是支撑可实测的家庭电视场景：

```text
Chat / Workflow
  -> mi-cli 场景、小爱、红外、MIoT 控制
  -> adb-cli 电视 App 操控
  -> Bilibili TV 演示闭环
```

## 登录

登录必须使用米家 App 扫码：

- `login_qr`：生成二维码登录信息
- `prepare_login`：兼容别名，等同于 `login_qr`
- `login_status`：检查登录状态，并在扫码完成后保存 token
- `login_logout`：清理本地登录状态

登录状态固定返回：

- `logged_in`
- `token_valid`
- `has_saved_login`
- `user_id`
- `auth_fields_present`
- `pending_qr`
- `qr.login_url`
- `qr.qr_image`
- `qr.lp_url`
- `next_steps.should_scan_qr`

Token 会尝试通过 `serviceLogin -> location -> cookies` 刷新，但不能假设所有小米服务 token 通用。尤其 `speaker_status` 仍涉及 Mina 服务，属于实验接口，不进入 V1 主线承诺。

## 能力入口

资产发现：

- `discover`：家庭、设备、features、entities、capability_profile
- `speaker_list`：小爱音箱候选
- `scene_list`：米家手动场景
- `discover_ir`：红外控制器
- `ir_get_keys`：红外按键

控制：

- `scene_execute`：执行米家手动场景
- `ir_press_key`：发送红外按键
- `speaker_execute`：让小爱执行语音指令
- `speaker_play`：让小爱朗读文本
- `get_prop / set_prop / run_action`：MIoT 属性与动作

推荐控制顺序：

1. `scene_execute`
2. `ir_press_key`
3. `speaker_execute`
4. `set_prop / run_action`

## 小爱与蓝牙边界

小爱 V1 主路径只依赖 MIoT action：

- `speaker_execute` 优先找 `execute-text-directive`
- 次选 `execute_directive`
- 再次选 `message_router.post`
- `speaker_play` 优先找 `play-text`

蓝牙能力只承认米家云或网关已经暴露出来的设备能力。项目不承诺任意第三方蓝牙设备直控。

## 后端入口

后端已经把 `mi-cli` 接成一等执行器：

- `/api/auth/login`
- `/api/auth/status`
- `/api/auth/logout`
- `/api/devices/discover`
- `/api/devices/scenes`
- `/api/devices/scenes/execute`
- `/api/devices/speakers`
- `/api/devices/ir/controllers/:parentDid`
- `/api/devices/ir/keys/:controllerId`

Workflow / Studio 默认电视演示链已经切到 `mi-cli.scene_execute`、`mi-cli.speaker_execute` 和 ADB，不再使用 `hami-cli`。

## 前端管理面边界

当前前端固定拆成三类控制面：

- `Studio`：Dify 式资产中枢和工作流控制面，管理 workflow / manifest / plan / agent 等资产。
- `设备管理`：HA 式统一设备注册表，只关心 Device / Entity / Service / State，不承担扫码登录和 CLI 配置。
- `集成管理`：插件和集成管理面，管理 CLI / Agent / A2A / Service / Channel 的存在、配置、登录、通用调用和诊断。

因此 `mi-cli` 的二维码登录、米家诊断、场景查询、小爱列表、红外控制器查询都放在 `集成管理`。`mi-cli.discover` 发现到的设备会落到本地设备注册表，再由 `设备管理` 以统一实体方式展示。

这个拆分的目的：

1. 避免设备页变成米家控制台。
2. 让未来 `adb-cli`、`bilibili-cli`、Codex / Claude / 小龙虾 A2A、飞书/微信/QQ 渠道都能用同一种集成管理入口接入。
3. 保持 Chat 和 Workflow 只消费共享底座，不把配置型 UI 堆进对话或画布里。
