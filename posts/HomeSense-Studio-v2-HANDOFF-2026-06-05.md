---
title: 'HomeSense-Studio v2 交接文档 — 2026-06-05'
date: 2026-06-05
---

# HomeSense-Studio v2 交接文档 — 2026-06-05

## 0. 写在最前

- 旧仓库 `D:\files\HomeSense-Stdio` 已冻结（commit `fbcc934`），定位为 **legacy / reference**，不再演进。
- 一切新工作都在 `D:\files\HomeSense-Studio-v2`，pnpm monorepo。
- 本文档描述的是 **v2 截至 2026-06-05 的真实状态**——不是方向宣言，是已经发生的事实。
- 上一份交接文档 `HomeSense-Stdio-HANDOFF-2026-06-05.md` 讲的是“为什么要建 v2”，本文讲“v2 已经到哪一步、还差什么”。

---

## 1. v2 的当前形态

### 1.1 目录结构

```text
D:\files\HomeSense-Studio-v2
├── apps/
│   ├── web/        # Vue 3 + Vite 前端
│   └── api/        # NestJS 后端（v2 阶段**未启用**）
├── packages/       # 预留
├── pnpm-workspace.yaml
└── package.json
```

### 1.2 已落地的关键决策

| 主题 | 决策 | 原因 |
|------|------|------|
| 仓库选址 | 新建 `HomeSense-Studio-v2`，平级而非旧仓 v2/ | 旧仓 lockfile / 路由 / 文档污染判断 |
| 旧仓命运 | 冻结在 `fbcc934`，archive 旧 skill runner | 旧仓不能进主路径，但要保留历史能力 |
| 后端栈 | NestJS 11（已脚手架） | DI / 装饰器适合领域服务 |
| 前端栈 | Vue 3 + Vite + Pinia + vue-router | 旧仓已验证、迁移成本最低 |
| 移动端 | Capacitor（**已选，未实施**） | 一套 Vue 跨 iOS / Android |
| 数据库 | **不接** | 先把前端跑通，再谈领域模型 |
| 登录归属 | 登录从 CLI 层剥离，划到“账号中心 / 已连接服务”面板 | 旧设计里登录写死在 adb-cli / mi-cli 内部，难复用 |
| 账号 UI | **不做账号列表**，只做“已连接服务”面板 | 用户明确说“我只要一个号” |
| 主体能力 | `adb-cli` / `mi-cli` | native `adbkit` / `miio` 不进主路径 |

---

## 2. 前端接管现状（最重要）

### 2.1 整体策略

> **老前端全部拿过来，所有 API 全部在浏览器层 mock。**
> 后端不参与。等前端骨架稳了，再讨论后端要不要写。

这个策略的好处：

- 前端可以独立运行、独立调试、独立测试。
- 领域模型讨论不会被后端 binding 拖下水。
- 重画 UI 不会破坏后端契约（因为根本没有后端契约）。

### 2.2 已完成

- `apps/web/src/` 复制了旧仓 117 个源文件，**1.3MB 完整 UI 资产**。
- `package.json` 同步了旧仓所有依赖（vue-flow / xterm / naive-ui / pinia / vue-router / virtual-scroller）。
- `pnpm install` 通过（vue-demi build script 已批准）。

#### 2.2.1 mock-server.ts（核心新增文件）

`apps/web/src/mock-server.ts`：

- 在 `window.fetch` 上挂了 in-browser mock。
- 路由表覆盖：
  - auth（login / status / logout / qr / verify-ticket）
  - user-devices（list / cards / runtime-manifest / capabilities / execute / ir-keys / ir-press / apps / launch / ping / mi-candidates）
  - chat（messages / stream）
  - llm（providers / models / vision / usage / chat-models / default-model）
  - services / manifests / approvals / agents
  - rooms / user-context / runtime-context
  - rule-engine / command（match / aliases / stopwords / l1-policy）
  - observability（cron / compensation / experiences / memory / workflow-runs）
  - health
- 未匹配的 `/api/*` 返回 404 mock，并 `console.warn`，不会回落到真实网络。
- ~10–40ms 模拟网络延迟，避免前端 loading 状态全是同步瞬变。
- 类型签名 `MockHandler = (url, method, body, match?) => unknown`，带正则捕获组。

#### 2.2.2 main.ts 改动

```ts
import './mock-server'   // 必须在任何组件 fetch 之前
import { createApp } from 'vue'
...
```

#### 2.2.3 vite.config.ts 改动

- **删除了 `proxy: { '/api': 'http://localhost:3000' }`**。
- mock-server 在浏览器层拦截 `/api/*`，Vite 端不需要知道后端在哪。

#### 2.2.4 清理与适配

- 删除 `apps/web/src/views/AccountCenter.vue`（之前我自己写的、引用了不存在的 `ConnectedService` 类型，路由里也没注册）。
- 改写 `apps/web/src/composables/useDevices.ts`：`api.devices.*` → `api.userDevices.*`，类型 `DeviceInfo` → `UserDevice`。
- 改写 `apps/web/src/composables/useDeviceControl.ts`：删除 `api.devices.status()` 调用（mock 不暴露这个端点）。
- 改写 `apps/web/src/components/DeviceSidebar.vue`：跟随上面的 API 变化。
- `mock-server.ts` 的 `MockHandler` 类型加上可选第 4 参数（regex match result），让带参路由能拿到 `id`。

### 2.3 TypeScript 状态

- `vue-tsc --noEmit` 通过主源文件。
- **剩余 2 个错误**，都在测试文件里（`ContextPanel.test.ts` 隐式 any），**不影响运行**：
  - `Cannot find module 'vitest'`（旧仓用的测试栈，v2 暂未装）
  - `Cannot find module '@vue/test-utils'`（同上）
  - `Parameter 'option' implicitly has an 'any' type`（缺 vitest 类型导致的连锁）
- 这些会在 v2 引入测试时一起处理。

### 2.4 Dev server 验证

```text
VITE v6.4.3  ready in 1151 ms
➜  Local:   http://localhost:5173/
➜  Network: http://192.168.31.204:5173/
HTTP 200
```

`/src/main.ts`、`/src/mock-server.ts`、`/src/views/DevicesView.vue`、`/src/views/LLMView.vue`、`/src/views/StudioHomeView.vue` 全部 200，Vite 编译无报错。

---

## 3. 已删 / 已砍

| 旧内容 | 状态 | 备注 |
|--------|------|------|
| `AppHomeView.vue` | **在路由里还在**（`/home`） | 用户在 17:02 说“砍掉首页”，**本批次还没动**，留给下一位 |
| `account` 列表式 UI | 已删 | 用户：“为什么还要有账号列表” |
| Login 写在 CLI 内部 | 已脱离 | 归到“已连接服务”面板（设计阶段，未实现） |
| `adbkit` / `miio` native 路径 | 已冻结在旧仓 | 新仓不引入 |
| 后端 NestJS `device-discovery` 模块 | 旧仓冻结 | v2 还没建后端模块 |
| Vite proxy → `localhost:3000` | 已删 | mock 在浏览器层 |

---

## 4. 下一步候选清单（**用户已确认** = ★）

按用户最近的发言排序：

1. ★ **砍掉首页**——移除 `/home` 路由、App.vue 顶导和移动底导的 `home` 项、`APP_DEFAULT_ROUTE` 改 `/chat`、删除或归档 `AppHomeView.vue`。
2. ★ **逐页验收旧前端**——打开每个旧页面，标记保留 / 改写 / 删除。
3. **领域入口重排**为四中心：**已连接服务 / 设备数字孪生 / 能力 / 运行态**。
4. **已连接服务面板**——替代旧的 account list + login from CLI 两种设计。
5. **Capacitor 接入**（决策已定，**未实施**）：把 Vue 应用打包成 iOS / Android。
6. **测试栈重建**：vitest + @vue/test-utils + jsdom（删旧测试文件时一起处理）。
7. **后端是否写**——这是 v2 后半程的决定，本批次**不写后端**。

---

## 5. 风险与坑

### 5.1 mock-server 的盲区

- 它只是**拦 fetch**，不模拟 WebSocket 推送。`useDeviceControl.ts` 的 `connectWS()` 还在尝试连 `ws://...:3000/ws`，会在 console 报错。
- 它的数据是**常量级 mock**，不模拟增量、分页、错误路径。前端如果以后要测错误 UI，要扩 mock。
- 路由表里没有显式 “401 / 500” 模拟，登录态切换是写死常量。

### 5.2 自动合并/覆写的隐患

- 上次会话出现过：用户/编辑器把 `main.ts` 和 `App.vue` 自动用旧版覆盖。
- **保护策略**：每次改 `main.ts` / `App.vue` 后立即 git commit / 备份，避免被“linter 友好”地还原。

### 5.3 旧前端 ≠ 新前端

- 旧前端是为**桌面 + CLI 后端**设计的，UI 假设后端在 localhost:3000。
- v2 一开始是 mobile-first（PWA / Capacitor），旧 UI 顶导 + 移动底导共存已经表达了这种过渡。
- 逐页验收时，**视觉一致性 < 移动端可用性**。

---

## 6. 复现 / 接手命令

```bash
# 进入 v2
cd "D:\files\HomeSense-Studio-v2"

# 启动前端
cd apps/web
pnpm install
pnpm dev

# 浏览器打开
# http://localhost:5173/

# 类型检查
pnpm typecheck
# 或：npx vue-tsc --noEmit
```

mock-server 启动后会在 console 打：

```text
[mock-server] All /api/* requests intercepted — running in offline mode
```

这是 v2 当前阶段的**正确性指示器**——看到这行，说明前端没在打后端。

---

## 7. 上下文补充（给下一位同事）

- 用户是**单兵作战**，强调“前端先行”、“先复用再重画”、“不要后端先行搞领域模型”。
- 用户已经对“AI 帮写整页 UI”失去耐心（“废了”），更信任**逐步接管** + **先砍再改**。
- 用户对**视觉一致性**敏感（顶导绿色、品牌色 `#10a37f`、safe-area inset），新页面要么用既有 CSS 变量，要么明说改。
- 用户对**账号/登录**的 UI 思路已经定型：连接服务面板，不是账号 CRUD。
- 旧仓 `D:\files\HomeSense-Stdio` 是 git 仓库，旧 commit `fbcc934` 是冻结点，**不要在那里继续写代码**。
- 旧仓的 `docs/DEVICE-DIGITAL-TWIN.md` 和 `docs/PYTHON-CLI-FUSION.md` 是 v2 的设计输入，未提交进 v2 仓。

---

## 8. 本批次没做完的事

- **首页没砍**（用户已经在 17:02 下达，但被写文档任务打断）。
- 顶导 / 移动底导的 `home` 项还在。
- `AppHomeView.vue` 文件还在 `views/` 下，没删。
- `APP_DEFAULT_ROUTE` 还是 `/home`，用户打开浏览器看到的第一个页面是首页（不是 chat）。

**这是下一位接手者的第一个任务**——按 §4 候选清单第 1 项收尾。

---

文档结束。
