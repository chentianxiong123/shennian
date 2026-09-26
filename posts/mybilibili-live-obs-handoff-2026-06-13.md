---
title: 'mybilibili-live-obs 交接文档'
date: 2026-06-13
---

# mybilibili-live-obs 交接文档

- 日期: 2026-06-13 15:26 (Asia/Shanghai)
- 决策状态: 方向已切换，废弃原方案
- 工作区根目录: D:\files\mybilibili-next\mybilibili-cloud

## 1. 决策摘要

放弃在 **Streamlabs Desktop 上持续砍商业化代码** 的修补路线。

原版 Streamlabs Desktop 是为直播商业化场景高度耦合过的复合体（30+ 商业服务、Vue/React 混用、依赖注入框架、自定义协议 slbundle://、多 worker window 架构），在它之上做减法的收益急剧递减，砍一处牵连三处：UI 仍频繁报红、SourceSelector 缺模块、IPC 路由断、CSP 错误反复。

新方向: **基于 obs-studio-node (osn) 从零自建一个轻量级 OBS 推流器**。把 OBS C++ 核心通过官方 Node binding 暴露出来，UI 层用现代栈自己写，做到只保留推流/录制场景，不带任何商业化包袱。

## 2. 现有项目快照

| 路径 | 角色 | 当前状态 |
| --- | --- | --- |
| D:\files\mybilibili-next\mybilibili-cloud\mybilibili-live-desktop | 早期基于 Streamlabs 二开的尝试 | 废弃。已发 3 个 commit（initial bulk cut、rounds 2-6、ignore compile logs），仍无法稳定运行 |
| D:\files\mybilibili-next\mybilibili-cloud\references\streamlabs-desktop | Streamlabs Desktop 1.21.3 原版 | 未改动，仅作源码参考。不作为新项目的源码基线 |
| D:\files\mybilibili-next\mybilibili-cloud\references\editly 等其他 | 之前调研的备选方案 | 仅参考，与新方向无关 |

桌面上的历史交接文档 (mybilibili-handoff-2026-06-08.md、mybilibili-live-desktop-OBS启动问题交接.md) 作废，以下面这份为准。

## 3. 失败原因归档（避免重蹈覆辙）

逐条都是用时间换来的教训，新项目必须显式规避：

1. **架构不能改**。Streamlabs 用了主进程 + 1 个 worker window + 多个 renderer window 组合，osn 只允许在 worker 进程里 require。试图删模块时把这条链搞断过两次，每次都要花数小时恢复。
2. **Vue + React 混用**。app/components/ 是 Vue，app/components-react/ 是 React，桥接层用 vue-tsx 和 tsx-component.ts 适配。删一个 Vue 组件会带着它的 React 包装一起炸。
3. **DI 框架与全局注册**。app-services.ts 和 services-manager.ts 把 60+ 个 service 集中注入，谁被谁依赖要靠运行时反射查；grep 不到 import 不代表没用到。
4. **自定义协议 slbundle://**。webpack 产物通过自定义协议加载，调试和切包成本极高。renderer 报的 CSP 错误有相当一部分来自这里，不是真 bug。
5. **Electron 29 的 console-message 兼容**。Streamlabs 的 crash logger 抓 console 异常时会改写调用栈，定位真问题要绕一层。
6. **商业化模块互相伪装**。grow、highlighter、restream、marketplace、layout-editor 表面看独立，实则共享 widgets/、platforms/、user/ 下的私有 hook，删一个触发雪崩。
7. **S3 资源**。obs-studio-node 与 crash-handler 都从 Amazon S3 拉 tar.gz，国内下载和 CI 都坑，版本号永远是 0.0.0。
8. **资源文件**。vendor/threejs、shared-resources 体积大、引用乱；i18n 资源跨多个目录散落。

经验: 二开这种规模的项目 ROI 已经为负。**先把架构自己画出来再写代码**，不要在被别人的架构拖着走。

## 4. 新方向：基于 osn 自建轻量推流器

### 4.1 目标

一个本地 Windows 桌面应用，启动后:

- 列出当前场景与源 (sources)
- 添加/删除 常见源 (显示器采集、摄像头、图片、文字、窗口/游戏采集)
- 调整源的位置/缩放/裁剪
- 切换场景
- 配置推流 (RTMP) 和本地录制
- 实时预览
- 保存/加载场景集合

**不做**: 云端账号、订阅、商城、聊天、虚拟形象、布局编辑器、高光集锦、捐赠/打赏、录播自动上传、跨平台（先只 Windows）。

### 4.2 核心依赖

- obs-studio-node: 直接从 stream-labs/obs-studio-node GitHub release 拉（避开 S3 URL），用 osn-0.26.x 或更高稳定版
- electron: 最新稳定版（参考项目用 29，新项目可用 30/31）
- 前端栈: React 18 + TypeScript + Vite（或自选轻打包方案）
- 状态管理: Zustand 或 Redux Toolkit（避免引入 MobX 这类反射型框架）
- 样式: Tailwind 或原生 CSS（不要复制 Streamlabs 的 less 体系）

### 4.3 osn 的能力映射

osn 直接暴露的 C++ 模块在主进程（Electron 27+ 支持 native addon in main process）可用，对应推流器功能:

| osn 模块 | 推流器功能 |
| --- | --- |
| Video | 全局视频设置、输出尺寸、FPS |
| Audio | 推流音轨、监控设备、静音/音量 |
| Scene / SceneItem | 场景列表、源叠加、变换矩阵 |
| Input (Source) | 添加各种源、属性编辑 |
| Filter | 源滤镜（噪声抑制、色彩等） |
| Transition | 场景切换转场 |
| Output (StreamOutput, RecordOutput) | RTMP 推流 + MP4 录制 |
| Display / SourceTexture | 预览窗口渲染（需绑定 HWND） |

### 4.4 推荐架构

```
[主进程 main.ts]
  ├── BrowserWindow (主窗口, React UI, contextIsolation=true)
  ├── 加载 osn, 创建 Scene/Output 等
  ├── IPC handlers: scene.*, source.*, output.*, settings.*
  └── Crash-safe 重启 worker
[Preload]
  └── 暴露 window.api.* 给 renderer
[Renderer]
  ├── React 18 + TS
  ├── Zustand store 镜像 osn 状态
  └── 组件树: 场景列表 / 源列表 / 预览 / 属性面板 / 输出控制
```

关键点:
- osn 仍在主进程加载（Electron 27+ 支持 native addon in main process），不再复制 Streamlabs 的多 window 模式
- 预览通过 BrowserWindow 的 webContents + canvas, 或直接用 HWND 子窗口嵌入 (后续可选)
- IPC schema 用 zod 校验，类型前后端共享

### 4.5 模块拆分（自建项目骨架）

```
mybilibili-live-obs/
├── package.json
├── electron-builder.yml
├── tsconfig.json
├── vite.config.ts
├── src/
│   ├── main/                  # Electron 主进程
│   │   ├── index.ts
│   │   ├── obs/
│   │   │   ├── video.ts
│   │   │   ├── audio.ts
│   │   │   ├── scenes.ts
│   │   │   ├── sources.ts
│   │   │   ├── filters.ts
│   │   │   ├── transitions.ts
│   │   │   ├── output-stream.ts
│   │   │   ├── output-record.ts
│   │   │   └── settings.ts
│   │   ├── ipc/
│   │   │   ├── index.ts
│   │   │   └── handlers.ts
│   │   ├── windows/
│   │   │   ├── main-window.ts
│   │   │   └── preview-window.ts  # 可选
│   │   ├── store/             # 持久化 (electron-store)
│   │   └── lifecycle.ts
│   ├── preload/
│   │   └── index.ts           # contextBridge.exposeInMainWorld
│   ├── shared/
│   │   ├── ipc-channels.ts
│   │   ├── schemas.ts         # zod
│   │   └── types.ts
│   └── renderer/              # React UI
│       ├── main.tsx
│       ├── App.tsx
│       ├── store/             # zustand
│       ├── components/
│       │   ├── SceneList.tsx
│       │   ├── SourceList.tsx
│       │   ├── Preview.tsx
│       │   ├── PropertyPanel.tsx
│       │   ├── OutputControls.tsx
│       │   └── SettingsDialog.tsx
│       └── styles/
└── resources/
    └── icon.ico
```

### 4.6 实施路标

| 阶段 | 目标 | 验收 |
| --- | --- | --- |
| P0 脚手架 | electron + vite + react + ts 跑通空白窗口 | yarn dev 弹出窗口，控制台无错 |
| P1 osn 接入 | 主进程 require obs-studio-node 不报错，能创建 Scene/Input | 单元测试断言 scene 数 |
| P2 IPC + 状态镜像 | renderer 通过 IPC 列出场景/源，zustand store 同步 | UI 显示空场景列表 |
| P3 源管理 | 添加显示器采集/摄像头/图片/文字，删除，编辑属性 | 真机能预览 |
| P4 场景编辑 | 拖拽缩放源、切场景、转场 | 主预览能切换 |
| P5 推流 | 配置 RTMP URL/Key，启动/停止推流 | 能推到本地 SRS 验证 |
| P6 录制 | mp4 本地录制，编码可配 | 能产出可播放文件 |
| P7 持久化 | 场景集合 + 设置存盘，重启恢复 | 关闭重开场景完整 |
| P8 打包 | electron-builder 出 Windows 安装包 | 安装后能启动 |

每个阶段结束都做一次完整回测，**不通不进下一阶段**。任何 UI 异常先在 MinimalSceneList + MinimalPreview 上加 error boundary 隔离，再排真问题。

### 4.7 不做清单（明确砍掉）

- 任何形式的账号/登录
- 订阅/付费/打赏
- 主题/皮肤市场
- 第三方集成 (YouTube/Twitch/Facebook 双开)
- 多平台同步推流 (restream)
- 聊天/弹幕/连麦
- AI 高光集锦
- 虚拟形象 / VTuber
- 移动端 / macOS / Linux（先 Windows）
- 自动更新（先手写覆盖安装）

## 5. osn 安装注意事项

1. **不要**使用 https://s3-us-west-2.amazonaws.com/obsstudionodes3.streamlabs.com/osn-0.0.0-release.tar.gz。该 URL 解析慢、版本号永远 0.0.0、CI 易失败。
2. 推荐改用 GitHub release 资源或本地 prebuild-install。在 package.json 中:
   ```json
   "obs-studio-node": "https://github.com/stream-labs/obs-studio-node/releases/download/<ver>/osn-<ver>-release.tar.gz"
   ```
3. Windows 上需要 Visual Studio 2022 Build Tools + Windows SDK；只跑预编译包则无需。
4. crash-handler 可暂时不引入，主进程 try/catch + 简易日志即可。

## 6. 关键风险与缓解

| 风险 | 缓解 |
| --- | --- |
| osn 升级后 API 变 | 锁定到具体版本，CI 中跑 smoke test |
| 预览窗口性能差 | P3 之前不接 Display，先用 1Hz 截图验证数据通路 |
| electron 与 osn node 版本不匹配 | 用 engines 锁 Node 版本, electron 28+ 内置 Node 18+ |
| Windows 高分屏 DPI 错位 | 主进程启用 setVisualZoomLevelLimits 与 manifest 兼容 |
| S3 资源打不开 | 不要在代码里 import 任何来自 Streamlabs 的 vendor 文件 |

## 7. 文件路径速查

- 历史交接（已作废）: C:\Users\a1\Desktop\mybilibili-handoff-2026-06-08.md
- Streamlabs 原版源码（仅作读参考）: D:\files\mybilibili-next\mybilibili-cloud\references\streamlabs-desktop
- 已废弃的 mybilibili-live-desktop: D:\files\mybilibili-next\mybilibili-cloud\mybilibili-live-desktop
- 新项目落地位置（建议）: D:\files\mybilibili-next\mybilibili-cloud\mybilibili-live-obs
- osn 上游: https://github.com/stream-labs/obs-studio-node
- OBS WebSocket 文档（参考协议）: https://obsproject.com/kb/websocket-protocol

## 8. 下一会话接手提示

1. 确认 P0 脚手架放在 mybilibili-live-obs/ 下，与 mybilibili-live-desktop/ 平级。
2. 不要复用任何 mybilibili-live-desktop 内的代码。mybilibili-live-desktop/ 在新项目启动后归档或删除。
3. 任何对 osn 的封装都集中在 src/main/obs/，不在主进程散落。
4. 跨进程 schema 全部走 src/shared/schemas.ts + zod，禁止手写 JSON.stringify。
5. 每周一个 P 阶段，不在 P0/P1 留尾巴。

— 结束 —