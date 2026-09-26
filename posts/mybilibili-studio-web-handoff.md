---
title: 'mybilibili-studio-web 交接文档（AI-to-AI）'
date: 2026-06-04
---

# mybilibili-studio-web 交接文档（AI-to-AI）

> 最后更新：2026-06-04 | 分支：feature/manuscript-edit-review-20260531

---

## 1. 项目定位

mybilibili-studio-web 是 mybilibili-cloud 中的独立前端项目。
核心策略：**源码级 fork openreel-video，保留完整 React/TSX 工程，通过 React-in-Vue 桥接方案逐步蚕食翻译为 Vue 3**。

openreel-video 是 130k+ 行的专业浏览器视频编辑器，包含多轨道时间轴、关键帧动画、WebCodecs/WebGPU 渲染、色彩校正、音频混合、WASM 节拍检测、AI 增强等功能。直接用 Vue 重写会丢失 90% 的已有代码。

---

## 2. 目录结构

```
mybilibili-studio-web/                    # pnpm monorepo 根目录
  apps/web/                               # 主应用（React 18 + Vue 3 混合）
    src/
      App.tsx                             # React 应用根组件（保留，未改动）
      App.vue                             # Vue 应用根组件（新创建，通过 ReactAdapter 挂载 ReactApp）
      main.tsx                            # 入口文件（待重写为 Vue bootstrap）
      components/
        ReactAdapter.vue                  # React-in-Vue 桥接组件（新创建）
        editor/                           # React 编辑器核心组件
          EditorInterface.tsx             # 主编辑界面（Grid 布局 + 面板缩放）
          Preview.tsx                     # Canvas/WebGPU 预览区
          Timeline.tsx                    # 多轨道时间轴
          InspectorPanel.tsx              # 属性检查面板
          AssetsPanel.tsx                 # 素材管理面板
          Toolbar.tsx                     # 顶部工具栏
          KeyframeEditorPanel.tsx         # 关键帧编辑器
        audio-mixer/                      # 音频混合器
        inspector/                        # 检查器子面板（50+ 子组件）
        preview/                          # 预览子组件（Canvas 渲染器等）
        timeline/                         # 时间轴子组件（Playhead, TimeRuler 等）
        tour/                             # 新手引导
        welcome/                          # 欢迎屏幕
      stores/                             # Zustand 状态管理
        project-store.ts                  # 项目数据
        timeline-store.ts                 # 时间轴状态
        ui-store.ts                       # UI 状态
        engine-store.ts                   # 引擎状态
        kieai-store.ts                    # AI 功能状态
        tts-store.ts                      # TTS 状态
      bridges/                            # 引擎桥接层（纯 TS，不依赖 UI 框架）
        playback-bridge.ts                # 播放控制
        media-bridge.ts                   # 媒体加载
        render-bridge.ts                  # 渲染管线
        effects-bridge.ts                 # 特效处理
        transition-bridge.ts              # 转场效果
        audio-bridge.ts                   # 音频处理
      hooks/                              # React 自定义 Hooks
      services/                           # 服务层（API、键盘快捷键、录屏等）
      utils/                              # 工具函数
      config/                             # API 端点配置
      pages/                              # 页面组件（SharePage）
  packages/core/                          # 引擎核心包 (@mybilibili-studio/core)
    src/
      media/                              # 媒体处理（WebCodecs, FFmpeg）
      audio/                              # 音频处理
      wasm/                               # AssemblyScript WASM 模块
  packages/ui/                            # UI 基础组件包 (@mybilibili-studio/ui)
```

---

## 3. 技术栈

| 层面 | 技术 |
|------|------|
| UI 框架（当前） | React 18 + TypeScript |
| UI 框架（目标） | Vue 3 + TypeScript + `<script setup>` |
| 状态管理（当前） | Zustand |
| 状态管理（目标） | Pinia 或 Vue 组合式 API |
| 样式 | Tailwind CSS 3 + Radix UI |
| 构建 | Vite 5（已配置双框架：@vitejs/plugin-react + @vitejs/plugin-vue） |
| 渲染引擎 | WebCodecs + WebGPU + Three.js + Canvas 2D |
| 音视频 | WebAV SDK + FFmpeg WASM |
| WASM | AssemblyScript（FFT/WAV/Beat Detection） |
| 包管理 | pnpm 11.5.1 + pnpm workspace |

---

## 4. 端口分配

| 服务 | 端口 |
|------|------|
| mybilibili-admin-web | 3002 |
| mybilibili-web | 5173 |
| mybilibili-wap | 5174 |
| mybilibili-studio-web | 5180 |

---

## 5. 启动命令

```powershell
cd D:\files\mybilibili-next\mybilibili-cloud\mybilibili-studio-web
pnpm install          # 安装依赖（581+ 包）
pnpm run dev          # 启动开发服务器 -> http://127.0.0.1:5180/
pnpm run build        # Vite 构建 -> apps/web/dist/
pnpm run build:wasm   # WASM 构建（AssemblyScript）
pnpm run typecheck    # TypeScript 类型检查（已通过）
```

---

## 6. 已完成的工作

### 6.1 Fork 与品牌替换（上一轮 AI 完成）
- 源码级 fork openreel-video -> mybilibili-studio-web
- `@openreel/core` -> `@mybilibili-studio/core`（202 个文件）
- `@openreel/ui` -> `@mybilibili-studio/ui`
- 包名、标题、端口全部改完
- PostHog/Wrangler/ServiceWorker 已移除
- pnpm install/build/dev 全部通过

### 6.2 TypeScript 错误修复（本轮 AI 完成）
**问题**：重命名后 tsconfig.json 中的 paths 映射仍指向 `@openreel/*`，导致 `@mybilibili-studio/core/media` 等子路径无法解析。

**修复的文件**：
1. `tsconfig.base.json` — `@openreel/*` -> `@mybilibili-studio/*`
2. `apps/web/tsconfig.json` — 同上 + `src/**/*.vue` 加入 include
3. `packages/core/tsconfig.json` — 同上
4. `packages/ui/tsconfig.json` — 同上
5. `apps/web/src/utils/load-audio-buffer.ts` — 为 `onProgress` 回调参数添加显式类型 `{ progress: number }`

**验证**：`pnpm run typecheck` 全部通过（packages/core, packages/ui, apps/web）。

### 6.3 React + Vue 3 混合环境配置（本轮 AI 完成）
**安装的依赖**：
- `vue`（运行时）
- `@vitejs/plugin-vue`（开发依赖）

**创建/修改的文件**：
1. `apps/web/vite.config.ts` — 添加 `vue()` 插件到 plugins 数组
2. `apps/web/src/vue-env.d.ts` — Vue SFC 类型声明（`declare module "*.vue"`）
3. `apps/web/tsconfig.json` — include 中加入 `"src/**/*.vue"`

### 6.4 React-in-Vue 桥接组件（本轮 AI 完成）
**创建了 `apps/web/src/components/ReactAdapter.vue`**：
- 使用 React 18 的 `createRoot` API
- 通过 Vue 的 `onMounted` 挂载 React 组件
- 通过 `watch` 监听 props 变化自动重新渲染
- 通过 `onBeforeUnmount` 调用 `root.unmount()` 正确清理
- 接受 `component` 和 `componentProps` 两个 props

### 6.5 Vue 根组件（本轮 AI 完成）
**创建了 `apps/web/src/App.vue`**：
- 作为 Vue 应用的根组件
- 通过 `ReactAdapter` 挂载整个 React 应用（`ReactApp.tsx`）
- 使用 `markRaw()` 包装 React 组件，避免 Vue 响应式系统深度追踪
- 未来可在此组件中加入 Vue 路由、AI 工作流面板等

### 6.6 入口重写为 Vue bootstrap（本轮 AI 完成）
**重写入口文件**：
- `App.tsx` 重命名为 `ReactApp.tsx`（避免与 `App.vue` 冲突）
- `main.tsx` 删除，创建 `main.ts` 作为 Vue 引导入口
- `index.html` 中的 `<script>` 引用改为 `/src/main.ts`
- `main.ts` 使用 `createApp(App).mount(root)` 挂载 Vue 根组件

---

## 7. 当前状态

### 已通过验证
- [x] `pnpm install` 通过
- [x] `pnpm run typecheck` 通过（三个子项目全部 OK）
- [x] `pnpm run build` 通过（Vite 构建成功，3627 个模块）
- [x] `pnpm run dev` 可启动（端口 5180，Vite v5.4.21）
- [x] Vue + React 双框架共存环境搭建完成
- [x] ReactAdapter 桥接组件工作正常

### 进行中
- （无）

---

## 8. 下一步待办

### 短期（逐步蚕食阶段 1-2）
1. 用 Vue 重写简单组件：`Toolbar.tsx` -> `Toolbar.vue`
2. 用 Vue 重写 `AssetsPanel.tsx` -> `AssetsPanel.vue`
3. 引入 Vue Router 做页面级路由（替代 React 内部的 hash-based `useRouter`）
4. 引入 Pinia，开始将 Zustand stores 逐步迁移

### 中期（逐步蚕食阶段 3-4）
5. 重写 `InspectorPanel.tsx` -> `InspectorPanel.vue`
6. 重写 `Preview.tsx` -> `Preview.vue`（核心是暴露 Canvas ref 给 Bridge）
7. 接入 vue-flow 做 AI 工作流面板
8. 建 mybilibili-creator 后端服务（项目表 + 草稿保存 API）

### 长期
9. 重写 `Timeline.tsx` -> `Timeline.vue`（最复杂的组件，涉及拖拽/缩放/多轨道）
12. 移除不再需要的 React 依赖
13. 移除 Cloudflare wrangler 相关配置和代码

---

## 9. 关键技术决策

### 为什么用 React-in-Vue 桥接而不是直接重写？
- openreel-video 有 130k+ 行代码，核心引擎（WebCodecs/WebGPU/WASM）完全不依赖 UI 框架
- 直接重写会丢失大量经过验证的交互逻辑和边界情况处理
- 桥接方案允许渐进式替换：先把外壳 Vue 化，再逐个组件替换
- `Bridges` 层是纯 TypeScript，Vue/React 切换零成本

### Zustand -> Pinia 迁移策略
- Zustand 的 `createStore` 可以一对一映射到 Pinia 的 `defineStore`
- 过渡期可以通过发布订阅机制让两个状态库共享数据
- 或者直接在 React 组件中使用 Pinia store（通过外部订阅）

### Tailwind CSS 兼容性
- React 和 Vue 组件都使用 Tailwind CSS，样式系统完全兼容
- 未来可以引入 Shadcn Vue 或 Radix Vue 替换 Radix UI

---

## 10. Git 状态

- 分支：`feature/manuscript-edit-review-20260531`
- 大量 untracked 文件：`mybilibili-studio-web/` 整个目录（包含 node_modules/ 之外的所有文件）
- 大量 deleted 文件：旧的 Vue 原型文件（`src/imports/openreel/` 下的旧拷贝、`src/views/studio/` 下的旧 Vue 文件）
- 未提交的修改：`.npmrc`、`package.json`（根目录）
- 本轮新增的文件：`main.ts`、`App.vue`、`ReactAdapter.vue`、`vue-env.d.ts`
- 本轮重命名的文件：`App.tsx` -> `ReactApp.tsx`
- 本轮删除的文件：`main.tsx`
- 建议提交信息：`feat(studio): fork openreel, fix tsconfig, Vue 3 bootstrap with React-in-Vue bridge`

---

## 11. 注意事项

1. **不要删除 `ReactApp.tsx`**（React 根组件）—— 它现在被 `App.vue` 通过 `ReactAdapter` 引用。原文件名是 `App.tsx`，已重命名为 `ReactApp.tsx` 以避免与 `App.vue` 冲突
2. **`packages/core` 的媒体子路径导出**（如 `@mybilibili-studio/core/media`）在 TypeScript 中工作正常，但 Vite build 跳过了 `tsc --noEmit` 检查
3. **WASM 构建**需要先运行 `pnpm run build:wasm` 才能使用 FFT/Beat Detection 功能
4. **dev server 使用 strictPort 5180**，如果端口被占用会启动失败
5. **COOP/COEP headers** 已在 Vite 配置中设置，支持 SharedArrayBuffer（FFmpeg WASM 需要）
6. **`mybilibili-studio-web-vue-prototype/`** 是旧的简化版 Vue 原型，可以安全删除
7. **入口文件已改为 `main.ts`**（Vue 引导），不再使用 `main.tsx`（React 引导）
