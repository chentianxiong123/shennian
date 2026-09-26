---
title: 'HomeSense Studio v2 近期交接文档'
date: 2026-06-18
---

# HomeSense Studio v2 近期交接文档

日期：2026-06-18  
项目路径：`D:\files\HomeSense-Studio-v2`

## 1. 当前背景

HomeSense Studio v2 近期主线已经从“泛化大架构讨论”收回到更具体的设备与系统能力层：

- 认证中心负责真实连接来源：MI、ADB、SSH/SFTP、AList、Sunshine/Moonlight 等。
- 设备管理负责组合这些来源，不直接承担协议注册中心职责。
- 终端保留给人类使用，Agent 未来优先使用封装能力，而不是直接操控 shell。
- 文件、终端、串流都倾向做成单独 session 页面，而不是挤在设备详情页底部。
- HomeSense 作为主体，外部项目只作为参考或 runtime/driver 内核，不让外部系统反客为主。

当前工作区有较多未提交改动，重点集中在：

- ADB 串流 / 文件页面
- SSH/SFTP 文件入口
- 统一存储层
- Sunshine/Moonlight 串流入口
- 启动脚本
- `packages/moonlight-driver` 轻量占位 driver

## 2. 近期已完成或接近完成的内容

### 2.1 ADB

ADB 方向已经形成三个主要入口：

- 控制台：ADB shell，独立 session 页面。
- 串流：基于 scrcpy bridge，独立页面 `AdbStreamSessionView.vue`。
- 文件系统：新增 `AdbFilesSessionView.vue`，默认应围绕 `/sdcard/` 展示。

近期修过的问题：

- scrcpy 串流坐标映射。
- 鼠标拖拽。
- 串流页从工作台拆成单独 session。
- ADB 文件路径重复 `/sdcard//sdcard` 的问题方向已明确，需要继续检查路径 join。

### 2.2 SSH / SFTP

方向已经定为：SSH 和 SFTP 共用同一套认证来源，在认证中心显示为 `SSH/SFTP`。

相关改动：

- `terminal/target-resolver.ts` 支持从 `ssh_target_id` / `ssh_authorization_id` 解析。
- `storage` 增加设备文件入口。
- 新增 `DeviceFilesSessionView.vue`，用于 SSH/SFTP 设备文件操作。

待继续验证：

- SSH 控制台是否还能稳定打开。
- SFTP 文件入口是否能绑定到同一 SSH/SFTP 认证。
- 不要补兜底掩盖问题，要查为什么 target/credential 缺失。

### 2.3 统一文件系统

目标是让不同协议进入同一套前端文件管理视图：

- ADB 文件
- SSH/SFTP 文件
- AList / WebDAV / SMB 等后续来源

已开始做统一存储层：

- `apps/server/src/storage/*`
- `apps/web/src/api/storage.ts`
- `StorageCredentialsPanel.vue`

近期 TODO：

- 继续统一前端文件表格/路径栏/操作按钮。
- 跨协议复制是需要做的能力，但不要一次做太大。
- 先保证 list / download / upload / mkdir / remove 稳定。

### 2.4 Sunshine / Moonlight 串流

当前状态：

- Sunshine 主机不再作为普通设备新增，而是进入 `streaming_hosts` 来源表。
- 认证中心的 Sunshine/Moonlight 面板已经简化成类似 ADB 的布局：
  - 扫描
  - 候选列表
  - 保存主机
  - 主机列表
  - 探测 / Wake / 串流 / 删除
- 默认扫描网段固定为 `192.168.31.0/24`。
- 默认扫描端口：`47990` 和 `47989`。
- `47990` 使用 `https://`，能扫到本机 Sunshine：`https://192.168.31.204:47990`。
- 探测已处理 Sunshine 自签 HTTPS 证书问题，`401/404` 这类 `<500` 状态视为可达。

已新增：

- `StreamingSessionView.vue`
- `/sessions/streaming`
- `POST /api/streaming-gateway/scan`
- `GET /api/streaming-gateway/hosts/:id/session-entry`
- `POST /api/streaming-gateway/hosts/:id/pair`

注意：

- 当前 `packages/moonlight-driver` 是轻量占位 driver。
- 它会生成 PIN、写三份占位 PEM 文件，并标记 `mock_pairing: true`。
- 这不是 Moonlight/Sunshine 的真实证书配对。

## 3. Moonlight 当前关键决策

目前讨论出两条路线：

### 路线 A：直接接 `moonlight-web-stream` release/runtime

优点：

- 不需要本机编译 Rust。
- 最快看到真实串流画面。
- 真实配对、WebRTC、键鼠控制都交给现成 runtime。

缺点：

- 配对、用户、主机状态主要在 runtime 内部。
- HomeSense 更像统一入口，而不是完全掌控底层能力。

当前建议：

- 短期优先走这条。
- HomeSense 只保存 runtime URL，例如 `MOONLIGHT_WEB_RUNTIME_URL=http://localhost:8080`。
- UI 提供“打开 runtime / 去配对 / 去串流”。

### 路线 B：内置真实 `moonlight-driver`

优点：

- HomeSense 能掌控配对、证书、主机状态、后续 Agent 能力。
- 跟 `adb-cli / mi-cli / media-cli` 的子进程模式一致。

缺点：

- 需要 Rust/Cargo/OpenSSL 编译环境。
- 要从 `moonlight-web-stream` / `moonlight-common` 中抽真实 pairing。

当前状态：

- 后端已经预留 driver 边界。
- 默认回退 Python 占位 driver。
- 可通过 `MOONLIGHT_DRIVER_BIN` 指向未来真实 driver。

建议：

- 不要现在强行大改。
- 先用 release runtime 验证体验。
- 如果串流体验值得深入，再单独做 Rust driver。

## 4. 近期最重要 TODO

### P0：先稳定当前可手测能力

1. 启动前后端，手动测试：
   - 认证中心 MI 是否能出设备/能力。
   - ADB 设备绑定、控制台、串流、文件。
   - SSH/SFTP 控制台与文件入口。
   - Sunshine 扫描、保存、探测、打开串流页。

2. 明确哪些是“真能力”，哪些是“占位能力”：
   - Sunshine scan/probe 是真。
   - Moonlight pairing 当前是占位。
   - Moonlight runtime 串流需要接 release runtime。

3. 修掉明显卡顿和路径 bug：
   - ADB shell 回车缓冲问题。
   - ADB 文件 `/sdcard/` 路径重复。
   - 设备详情页能力/绑定加载慢的问题，应该以后端缓存或手动刷新解决，不要用 localStorage。

### P1：接 moonlight-web-stream runtime

目标不是 fork 它，而是把它当串流 runtime。

要做：

- 在认证中心增加 runtime URL 配置或读取环境变量。
- `runtimeStatus()` 检测 `http://localhost:8080` 是否在线。
- 主机行按钮从“轻量配对”调整为“打开配对 / 打开 runtime”。
- 串流页 iframe 或新区域打开 runtime 对应页面。
- 不再把 Python mock pairing 展示成真实成功。

参考路径：

- `D:\files\References\home\moonlight-web-stream`
- 重点：
  - `README.md`
  - `src/api/host.rs`
  - `src/api/stream.rs`
  - `web/api.ts`

### P2：文件管理统一

目标：

- ADB / SSH-SFTP / AList / WebDAV 进入统一文件视图。
- 统一路径栏、文件列表、上传、下载、新建目录、删除。
- 先不要过度设计跨协议复制 UI，但后端接口可以继续补。

### P3：清理大组件

当前大文件很多，但不要大拆。

优先只拆近期触碰的区域：

- `AuthorizationsView.vue`
- `DeviceDetailView.vue`
- `AdbWorkbench.vue`
- `StorageCredentialsPanel.vue`
- `GameStreamWorkbenchView.vue`

原则：

- 拆组件，不发明总线。
- 只拆明显重复 UI 和表格/弹窗。
- 不碰 LLM Studio / 记忆 / studio 大画布那边。

## 5. 当前风险点

1. 工作区改动较多，提交前要认真分组。
2. `packages/moonlight-driver` 当前是 mock，不可宣传为真实 Moonlight 配对。
3. `streaming-gateway.service.ts` 已经偏大，后续可以拆 runtime/probe/host/pairing helper，但不要大重构。
4. Windows 下 Rust/OpenSSL 编译会卡时间，短期不建议作为主线。
5. Sunshine 端口：
   - `47990` 多数是 HTTPS Web UI。
   - `47989` 也可能可达，但不一定是主要 Web UI。
6. Sunshine 自签证书要允许后端探测，不代表浏览器 iframe 一定能无感加载。

## 6. 推荐下一步

最推荐下一步：

1. 下载或运行 `moonlight-web-stream` release。
2. 确认 `http://localhost:8080` 能打开。
3. 在 HomeSense 里把 Sunshine/Moonlight 面板改成 runtime 入口：
   - 检测 runtime
   - 打开 runtime
   - 打开配对页
   - 打开串流页
4. 暂时弱化/隐藏当前 mock pairing。
5. 手测真实串流体验，再决定是否做内置 Rust driver。

一句话结论：

近期主线不是继续扩架构，而是把“设备能力 + 文件 + 串流”稳定成可手测、可演示的系统能力。Moonlight 先接 runtime，后续再决定是否内化成 driver。
