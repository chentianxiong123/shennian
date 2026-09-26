---
title: 'HomeSense-Stdio 转交文档 - 2026-06-05'
date: 2026-06-05
---

# HomeSense-Stdio 转交文档 - 2026-06-05

## 1. 当前结论

当前项目已经不适合作为继续堆功能的主线代码库。

建议把 `D:\files\HomeSense-Stdio` 定位为 legacy/reference 仓库：保留历史实现、CLI 能力、文档和可迁移素材，但不要继续在当前混乱结构里做大规模业务演进。

下一步建议新建 v2 项目，重新建立清晰架构，再按白名单迁移必要能力。

推荐新项目位置：

```text
D:\files\HomeSense-Studio-v2
```

不建议在旧仓库里建 `v2/` 子目录。旧仓库已有大量历史路由、旧文档、旧模块、lockfile 和未验证清理改动，会持续污染判断。

## 2. 当前仓库状态

当前仓库位置：

```text
D:\files\HomeSense-Stdio
```

最近已完成并提交的 commit 链：

```text
5befcb1 chore: switch to pnpm monorepo + fix Nest startup
e55f577 refactor(nest): LegacyBridgeModule - all 21 singletons via DI
b1e4a7c docs: HANDOFF-4 - Nest takeover complete + CLI direction correction
```

`docs/HANDOFF-4.md` 已存在，但其中关于 `native adbkit` 只是辅助的表达已经不再准确。新的方向是：`adb-cli` / `mi-cli` 是经过设计的主体能力，未被设计的 native `adbkit` / native `miio` 不应该继续作为主动发现或主路径存在。

当前工作区是脏的，而且有未验证的删除和修改。不要把当前工作区视为稳定基线。

已观察到的未提交方向包括：

- 后端 `device-discovery` Nest 模块被删除。
- `adbkit` / `miio` 类型声明被删除。
- 后端 `package.json` 和 `pnpm-lock.yaml` 已移除相关依赖。
- 前端部分 ADB / MI 测试页面和路由被删除。
- `DevicesView.vue` 已开始改成手动绑定，不再走 native ADB 扫描。
- `MiCliDetailView.vue` 已开始从 discover 语义改成 binding candidates 语义。
- `skills/adb-cli`、`skills/hami-cli`、`skills/sandbox-mi-cli`、`virtual-home-runtime` 等旧 skill/runtime 文件出现删除或归档痕迹。
- 存在未跟踪文档 `docs/DEVICE-DIGITAL-TWIN.md` 和 `docs/PYTHON-CLI-FUSION.md`。

这些改动没有完成整体验证。后续如果继续在旧仓库收尾，第一步必须跑类型检查和测试，并清理所有残留引用。

## 3. 已对齐的新方向

### 3.1 废除旧沙盒主线

现阶段所有旧的 sandbox、virtual device、fake home runtime 都不再作为主线设计。

正确方向不是“模拟设备”，而是“真实设备的数字孪生”：

- 设备由用户手动注入为主。
- 系统通过 IP、账号、CLI、局域网探测、外部服务等观察来源补充状态。
- 数字孪生保存的是设备状态投影、观测记录、在线判断、能力绑定和空间位置。
- 后续可以扩展更多状态来源，但不能把旧沙盒当成真实设备管理核心。

### 3.2 CLI 能力定位

当前已经明确：

- `adb-cli` 是 Android/ADB 方向的主体能力。
- `mi-cli` 是小米方向的主体能力。
- 后续可能有 `bilibili-cli` 或其他外部能力模块。
- native `adbkit` / native `miio` 不符合当前设计理念，不应继续作为主动发现主路径。

旧说法“native adbkit 只是辅助”容易造成误解。更准确的判断是：这些 native 包不是当前设计出来的能力模块，除非未来重新设计边界，否则应该删除或归档，而不是保留在 active code path。

### 3.3 统一账号管理

需要统一认证/账号页，不要分散在各功能入口里。

第一批账号类型：

- 小米账号
- 哔哩哔哩账号

账号中心负责：

- 登录状态
- cookie/token/credential 管理
- 账号与能力模块的绑定关系
- 后续账号刷新、失效提示、重新认证

### 3.4 数字孪生设备管理

设备管理要增强为数字孪生中心，而不是普通设备列表。

核心能力：

- 手动创建设备。
- 按 IP 判断在线。
- 尽可能提取设备状态。
- 记录观测来源和状态快照。
- 支持房间。
- 支持设备分组。
- 支持设备之间的简单关联。
- 支持 2D 房间拓扑图。

拓扑方向：

- 做 2D。
- 基于房间。
- 不做 3D。
- 分组优先，例如电视和机顶盒一组。
- 设备之间可手动建立关系。

## 4. 建议的 v2 架构

v2 应该按中心化能力重建，而不是照搬旧代码。

建议四个核心中心：

```text
Accounts/Auth Center
  - Xiaomi account
  - Bilibili account
  - credentials/session lifecycle

Device Digital Twin Center
  - manual devices
  - network endpoints/IP online state
  - rooms
  - 2D topology
  - groups
  - relations
  - observations
  - state snapshots

Capabilities Center
  - adb-cli
  - mi-cli
  - bilibili-cli
  - external service adapters
  - capability bindings

Runtime/Automation Center
  - workflows
  - agents
  - tasks
  - only consume accounts/devices/capabilities through stable APIs
```

关键原则：

- Runtime 不能直接扫设备。
- Workflow 不能直接碰账号密钥。
- CLI 不能自己决定业务设备模型。
- 前端不能把临时 API 当业务边界。
- 所有真实设备状态都进入数字孪生中心统一沉淀。

## 5. v2 推荐目录结构

推荐使用新的 pnpm monorepo：

```text
HomeSense-Studio-v2/
  apps/
    web/                 # Vue 3 + TypeScript Web 前端
    server/              # NestJS 或更轻量 HTTP API
  packages/
    domain/              # 领域模型、schema、类型、状态机
    db/                  # 数据库 schema、migration、repository
    api-client/          # 前端/Android shell 复用的 API client
    ui/                  # 可复用 UI 组件，谨慎抽象
    capabilities/        # CLI adapter 协议、能力注册、调用模型
  docs/
    ARCHITECTURE.md
    DEVICE-DIGITAL-TWIN.md
    AUTH-CENTER.md
    CAPABILITIES.md
```

如果希望未来 Android 复用前端，v2 前端应采用 web-first、responsive-first：

- 先做 Vue 3 + TypeScript Web App。
- 页面从第一天支持移动端布局。
- 抽出 `packages/domain` 和 `packages/api-client`，避免业务逻辑写死在浏览器页面里。
- 后续 Android 优先考虑 Capacitor 包装同一套 Web 前端。
- 只有遇到强硬件、后台常驻、系统权限等需求时，再考虑原生 Android 页面。

这条路线能最大化复用前端代码，也避免现在就陷入两套 UI。

## 6. 数据模型初稿

数字孪生建议从以下表开始设计：

```text
accounts
account_credentials
account_sessions

devices
device_network_endpoints
device_capability_bindings
device_observations
device_state_snapshots

rooms
room_topology_layouts
device_topology_positions

device_groups
device_group_members
device_relations

capability_providers
capability_invocations
```

第一阶段不要过度建模。优先保证下面这些问题能被稳定回答：

- 这个设备是谁手动创建的？
- 它属于哪个房间？
- 它现在是否在线？
- 在线判断来自哪里？
- 它绑定了哪些能力？
- 最近一次观测到的状态是什么？
- 它和哪些设备在同一组？
- 它在 2D 房间图上的位置在哪里？

## 7. 迁移白名单和黑名单

### 7.1 可迁移白名单

可以从旧仓库迁移：

- `adb-cli` 中真正可用的 CLI 能力。
- `mi-cli` 中真正可用的 CLI 能力。
- `docs/DEVICE-DIGITAL-TWIN.md` 里的数字孪生设计思想。
- `docs/PYTHON-CLI-FUSION.md` 里的高性能 CLI 持久化思路。
- Nest 启动、DI 接管过程中得到的经验。
- 可独立复用的测试样例和领域名词。

迁移时必须重新审查，不要整目录复制。

### 7.2 不应迁移黑名单

不建议迁移：

- 旧 sandbox runtime。
- virtual device / fake home runtime。
- native `adbkit` 主动发现链路。
- native `miio` 主动发现链路。
- 旧 `device-discovery` 模块。
- 旧的分散登录入口。
- 为兼容历史 UI 而存在的临时 API。
- 含混的 skill runner 和旧 executor 文件。

这些东西最多归档查看，不应该进入 v2 active path。

## 8. 建议执行阶段

### P0 - 冻结旧仓库

目标：让旧仓库成为参考源，而不是继续扩张。

动作：

- 不再继续大规模重构旧仓库。
- 如果必须保留当前清理现场，先 commit 或 stash。
- 写明旧仓库只作为 legacy/reference。

### P1 - 新建 v2 骨架

目标：建立干净 monorepo 和基础工程约束。

动作：

- 新建 `D:\files\HomeSense-Studio-v2`。
- 初始化 pnpm workspace。
- 建立 `apps/web`、`apps/server`、`packages/domain`、`packages/api-client`。
- 先定义领域模型和 API contract，再做页面。

### P2 - 账号中心 MVP

目标：统一 Xiaomi / Bilibili 账号管理。

动作：

- 账号列表。
- 登录状态。
- credential 存储抽象。
- 账号与 capability provider 绑定。

### P3 - 数字孪生 MVP

目标：替代旧设备页。

动作：

- 手动创建设备。
- 房间管理。
- IP endpoint。
- 在线检测。
- 状态快照。
- 设备分组。

### P4 - CLI 能力接入

目标：把 `adb-cli` / `mi-cli` 作为能力提供者接入，而不是让它们支配设备模型。

动作：

- 定义 capability provider 协议。
- 定义 invocation record。
- 设备绑定 capability。
- CLI 调用结果写入 observations。

### P5 - 2D 房间拓扑

目标：建立房间内设备空间管理。

动作：

- 房间画布。
- 设备点位。
- 拖拽保存位置。
- 分组视觉表达。
- 简单关系线。

## 9. 当前旧仓库收尾提醒

如果下一轮仍要在旧仓库收尾，优先事项是：

```text
pnpm install
pnpm -r typecheck
pnpm -r test
```

预期可能失败，因为当前已经删除了一批 API、路由、类型声明和模块文件。

重点检查：

- 前端是否还有 `api.devices` / `api.adbDevices` 引用。
- 路由是否还有已删除页面引用。
- 后端是否还有 `DeviceDiscoveryModule` 引用。
- 依赖里是否彻底移除 `adbkit` / `miio`。
- skill registry 是否还引用已删除 executor。
- 文档是否仍误导为 native discovery 辅助方案。

## 10. 下一轮开工提示词

建议下一轮直接这样开工：

```text
我们准备新建 HomeSense-Studio-v2，不继续在旧仓库堆功能。

请先创建 v2 架构方案和目录骨架：
- 新项目位置：D:\files\HomeSense-Studio-v2
- 技术路线：pnpm monorepo，Vue 3 + TypeScript Web，后端 API，shared domain/api-client
- 核心中心：账号中心、设备数字孪生中心、能力中心、运行自动化中心
- 设备方向：手动注入、IP 在线检测、房间、2D 拓扑、分组、设备关系、状态观测
- 能力方向：adb-cli / mi-cli 是主体能力，native adbkit / miio 不进入 active path
- Android 方向：web-first responsive，未来 Capacitor 复用前端

先不要迁移旧代码，先给出 v2 的最小可运行骨架和第一阶段数据模型。
```

## 11. 最重要的判断

现在最关键的不是继续修补旧项目，而是把边界重新立住：

- 账号是账号中心。
- 设备是数字孪生中心。
- CLI 是能力中心。
- 自动化是消费方。
- 沙盒和虚拟设备不是主线。
- native discovery 不是主线。
- v2 应该新建在干净目录里。

只要这个边界稳定，后续功能才不会再次变成大杂烩。
