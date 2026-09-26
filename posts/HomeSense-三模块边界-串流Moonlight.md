---
title: 'HomeSense 串流架构边界（认证 / Moonlight 子进程 / Streaming）'
date: 2026-02-13
---

# HomeSense 串流架构边界（认证 / Moonlight 子进程 / Streaming）

> 状态：已对齐原则，**代码已恢复至 master**；本文仅作实施蓝图，改代码前需你点名文件。

## 1. 三句话原则

| 模块 | 只负责 | 绝不负责 |
|------|--------|----------|
| **认证（Auth）** | HomeSense 用户/设备授权、会话、谁能操作哪台主机 | Moonlight PIN、PEM、Sunshine 协议、串流 IPC |
| **Moonlight（接口层）** | 对 Sunshine 的协议能力，**独立子进程/CLI**：pair、apps、health、ipc/stream | HomeSense 登录页、Nest 整站代理 `/moonlight`、业务 DB |
| **Streaming（接流+控制）** | 会话生命周期、起停流编排、控制通道（键鼠/手柄/WoL 等控制侧）、把观看/控制端点交给前端 | 用户登录 Moonlight、在 Nest 里实现配对协议 |

**数据流（目标）**

```
用户 → Auth 通过
     → Streaming：创建/查询会话（已授权 host）
     → spawn Moonlight CLI（读 PEM：data/streaming/moonlight/<host>/）
     → spawn Streamer / 附着 web-server 过渡
     → 返回 viewer_url + control_url（HomeSense 域名）
```

---

## 2. 仓库目录归属（D:\files\HomeSense-Studio-v2）

### 2.1 认证（Auth）

- **归属**：`apps/server` 里现有鉴权/授权模块（如 authorizations、API guard、session），**独立演进**。
- **对外**：REST/WS 只暴露 HomeSense token/session；Streaming 模块 **只消费**「该用户能否操作 host_id X」。
- **禁止**：在 `moonlight-web-runtime` 里维护 `homesense-auth.json` 作为**面向用户**的登录；若短期仍需 server→web-server 桥接，应标为 **internal bridge**，且不进产品文档。

### 2.2 Moonlight（子进程 / CLI）

| 路径 | 角色 |
|------|------|
| `packages/moonlight-driver-rust`（待建） | 真配对、列应用、health；stdout 两行 JSON（pair）/ 一行 JSON（apps） |
| `packages/moonlight-driver`（Python） | 仅 **合同 mock** 或删除；生产只认 Rust 或你指定的单一 binary |
| `packages/moonlight-streamer` | 上游 IPC 形态 streamer + `homesense-moonlight-streamer` CLI |
| `data/streaming/moonlight/<host-key>/` | **配对产物**：client/server PEM（refs 进 DB，私钥不出浏览器） |
| `data/runtime/moonlight-web/package/` | **过渡**：`web-server.exe` + `streamer.exe` + static；最终可缩为 static + 自研 gateway |

- **环境**：`MOONLIGHT_DRIVER_BIN`、`MOONLIGHT_STREAMER_BIN`（或 runtime 目录约定），统一 `D:\devtools` 编译。
- **禁止**：在 `StreamingGatewayService` 内直接 `requestJsonStream(''/pair'')` 走 Moonlight **产品** API 作为长期方案。

### 2.3 Streaming（接流 + 控制）

| 路径 | 应保留的职责 |
|------|----------------|
| `apps/server/src/streaming/streaming-gateway.service.ts` | 主机 CRUD、扫描、WoL、**编排** spawn、会话 entry、控制/监控 URL |
| `apps/server/src/streaming/streaming-control.gateway.ts` 等 | 控制 WS |
| `apps/server/src/streaming/moonlight-web-runtime.service.ts` | **过渡**：仅「起 web-server 子进程 + 代理 stream 静态/WS」；目标缩小或替换为 thin gateway |

- **禁止**：配对协议、Moonlight 用户注册、默认 admin 同步（`first_login_*`）作为产品能力。

---

## 3. CLI 合同（Nest 与子进程唯一耦合面）

### 3.1 moonlight-driver `pair`

```bash
moonlight-driver pair --host <ip> --port <47989|47990> --output-dir <dir>
```

stdout（两行）：

```json
{"code":0,"stage":"pin","pin":"1234"}
{"code":0,"stage":"paired","data":{"status":"paired","mock_pairing":false,"client_certificate_ref":"...","client_private_key_ref":"...","server_certificate_ref":"..."}}
```

### 3.2 moonlight-driver `apps`（待实现）

```bash
moonlight-driver apps --host <ip> --port <port> --pairing-dir <dir>
```

stdout（一行）：

```json
{"code":0,"data":{"apps":[{"app_id":1,"name":"Desktop",...}]}}
```

### 3.3 homesense-moonlight-streamer

- `health` / `version`：一行 JSON
- 默认 `ipc`：与 upstream `ServerIpcMessage` / `StreamerIpcMessage` 兼容（web-server 或未来 gateway spawn）

### 3.4 Nest 调用方式

- `spawn(file, args)` + 解析 stdout；**热路径**可改为常驻 driver pool（后续优化）。
- 环境变量指向 `D:\files\HomeSense-Studio-v2\packages\...\target\release\*.exe`。

---

## 4. 当前 master 与目标的差距（恢复后实况）

| 能力 | master 现状 | 目标 |
|------|-------------|------|
| 配对 | `pairHost` → web-server `/api/pair` | Auth 登记主机后，Streaming **只** spawn `moonlight-driver pair` |
| 列应用 | `listHostApps` → web `/api/apps?host_id=` | spawn `moonlight-driver apps` + PEM |
| 浏览器入口 | `main.ts` 代理整站 `/moonlight`，308 到 index | 用户只见 HomeSense；仅 `stream.html`+静态 **可选** 代理 |
| 登录 | `MoonlightWebRuntimeService` internal login | Auth 模块唯一；web-server session = internal bridge only |
| Streamer | runtime `streamer.exe` | 自编译 `homesense-moonlight-streamer.exe`，`streamer_path` 可切换 |

---

## 5. 实施阶段（建议顺序）

### Phase 0 — 文档与合同（当前）

- [x] 三模块边界（本文）
- [ ] 你确认：播放页短期是否仍用 bundled `stream.html`

### Phase 1 — Moonlight 子进程（不动 Nest 或只加 spawn 胶水）

1. 新建 `packages/moonlight-driver-rust`，实现 `health` / `pair` / `apps`
2. `packages/moonlight-streamer` release 编译（>10MB），拷贝 OpenSSL DLL
3. 本机手测 CLI，不依赖 Nest

### Phase 2 — Streaming 编排（最小改 Nest）

1. `StreamingGatewayService.pairHost` → spawn driver only（删除对 `/pair` 依赖）
2. `listHostApps` → spawn driver `apps`
3. 配对成功后 **可选** 同步 web-server host 表（仅为了 `stream.html` 的 `hostId`，标为过渡）

### Phase 3 — 砍 Moonlight 产品面

1. `main.ts`：根 `/moonlight` 404 或重定向 HomeSense
2. `moonlight-web-runtime`：白名单仅 stream 静态 + `/moonlight/api`（Nest 注入 internal cookie，用户无登录 UI）
3. `config.json`：`first_login_create_admin` = false

### Phase 4 — 认证与 Streaming 解耦

1. 所有「谁能配对/谁能起流」走 Auth API
2. 移除 streaming 内与 Moonlight 用户体系相关的逻辑
3. 评估卸 `web-server`，换 thin gateway + 自研 streamer 常驻

---

## 6. 编译与环境（D:\devtools）

- Rust：`nightly-2026-02-13-x86_64-pc-windows-msvc`，`RUSTUP_HOME=D:\devtools\rust`
- OpenSSL：`D:\devtools\OpenSSL-Win64`，`OPENSSL_NO_VENDOR=1`
- **勿**设 `MOONLIGHT_COMMON_NO_VENDOR=1`（除非提供 `MOONLIGHT_COMMON_LIB`）
- 参考成功体积：streamer release ~14MB+（非 285KB）

---

## 7. 改动前清单（你点头再动）

| 文件 | Phase |
|------|-------|
| `packages/moonlight-driver-rust/*` | 1 |
| `packages/moonlight-streamer/*`（已有） | 1 |
| `apps/server/src/streaming/streaming-gateway.service.ts` | 2 |
| `apps/server/src/streaming/moonlight-web-runtime.service.ts` | 3 |
| `apps/server/src/main.ts` | 3 |
| `data/runtime/moonlight-web/server/config.json` | 3 |
| Auth 模块（待你指路径） | 4 |

---

## 8. 验收（整体）

- [ ] 用户浏览器**看不到** Moonlight 登录/首页/admin
- [ ] 配对 `mock_pairing: false`，PEM 在 `data/streaming/moonlight/`
- [ ] 列应用不依赖 Nest 调 web `/api/apps`（长期）
- [ ] 串流可用：HomeSense 入口 → stream + 控制
- [ ] Auth 与 Streaming、Moonlight 三者 import/职责无交叉（代码审查）

---

*文档版本：2026-06-27 · 代码基线：HomeSense-Studio-v2 master（server 已 git restore）*
