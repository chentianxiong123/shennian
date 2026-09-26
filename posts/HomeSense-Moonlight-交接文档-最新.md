---
title: 'HomeSense Moonlight 交接文档（最新）'
date: 2026-06-27
---

# HomeSense Moonlight 交接文档（最新）

> 生成时间：2026-06-27  
> 用途：接替会话时**以本文为准**；桌面旧稿若与本文冲突，**作废旧稿对应段落**。

---

## 1. 用户目标（已锁定，勿改义）

1. **自研、自编译、可裁剪**：Moonlight 能力归 HomeSense 管，工具链集中在 `D:\devtools`，**不装 MSYS2**，**不搞 Trae/IDE 配置**。
2. **去掉 Moonlight 产品登录面**：不要 moonlight-web 用户/管理员体系；**HomeSense 是唯一 UX**。
3. **三模块边界**（用户多次确认）：

| 模块 | 只负责 | 绝不负责 |
|------|--------|----------|
| **Auth** | HomeSense 谁有权配对/开流/控制 | Sunshine PIN 协议细节、Moonlight 站点登录 |
| **Moonlight** | **一个包**、**独立子进程/CLI**：对 Sunshine 的 pair/apps/stream IPC | Nest 里长期实现配对协议、Moonlight Web 整站代理当产品 |
| **Streaming** | 会话编排、起停流、控制通道、把 viewer/control 交给前端 | 用户登录 Moonlight；**用户说 WS/桥接几个月前已搞定，勿重讲架构** |

4. **实施方式**：在**上游参考源码整包复制**到 `packages/moonlight` 上改，**禁止**再拆多顶层包、**禁止** 87 行 `lib.rs` 拆 crate 导致 264 错。

---

## 2. 旧文档核对结论（桌面 + docs）

| 文档 | 状态 | 说明 |
|------|------|------|
| `HomeSense-三模块边界-串流Moonlight.md` | **部分过期** | 边界仍对；文中 `moonlight-driver-rust` / `moonlight-streamer` / Python mock **已不存在** |
| `HomeSense-Moonlight-接续大纲-工具恢复后.md` | **过期** | 全程指向已回收的 driver-rust + moonlight-streamer |
| `HomeSense-Moonlight-一天落地大纲.md` | **过期** | 阶段 A/B 路径仍是旧 packages |
| `HomeSense-Moonlight-先砍登录-改动说明.md` | **待对照** | 若涉及 `apps/server` 改动，以 **git master 已还原** 为准 |
| `HomeSense-子进程架构与Moonlight接续.md` | **原则有效** | 子进程思路仍对；具体包名改为 `packages/moonlight` |
| `docs/HomeSense-Streaming-Moonlight-三模块边界.md` | **与桌面边界稿同源** | 同步更新包路径时改这一份 |
| `HomeSense-Moonlight-AList-重构方案.md` | **另一主题** | AList/存储重构，与 Moonlight 并行，勿混进 Moonlight 实施 |

**已执行且与旧稿不一致的事实（以仓库为准）：**

- 已回收：`packages/moonlight-streamer`、`packages/moonlight-driver-rust`、`packages/moonlight-driver`（目录 **不存在**）。
- 已新建：`packages/moonlight/` = 参考树 `common` + `streamer` 整包复制。
- `apps/server`：**已恢复 origin/master**（`streaming-gateway` 等勿擅自再改；改前须用户点名文件）。
- `data/runtime/moonlight-web/package/`：**当前仅有** `web-server.exe` + `static/` + `server/`，**无** `streamer.exe` / 自研 exe（旧 exe 已按用户要求进回收站）。

---

## 3. 当前仓库结构（Moonlight 唯一源码树）

```
D:\files\HomeSense-Studio-v2\packages\moonlight\
├── Cargo.toml              # workspace members: common, streamer（已去掉 web-server crate）
├── rust-toolchain.toml     # nightly-2026-02-13
├── Cargo.lock              # 自参考树复制
├── common/                 # ipc、api_bindings（与上游一致）
└── streamer/
    └── src/main.rs         # #[tokio::main] stdin/stdout IPC 循环（上游形态，无 health 子命令）
```

**参考源（只读对照）：** `D:\files\References\home\moonlight-web-stream`  
**证明环境可用：** 参考树 `target\release\streamer.exe` 约 **14MB**（非 285KB）。

**Git：** `packages/moonlight/` 当前为 **未跟踪** `??`；提交前需用户决定是否纳入版本库。

---

## 4. 编译环境（每次编 Rust 前设置）

```powershell
$env:RUSTUP_HOME='D:\devtools\rust'
$env:CARGO_HOME='D:\devtools\.cache\.cargo'
$env:PATH='D:\devtools\cargo\bin;'+$env:PATH
$env:OPENSSL_DIR='D:\devtools\OpenSSL-Win64'
$env:OPENSSL_LIB_DIR='D:\devtools\OpenSSL-Win64\lib'
$env:OPENSSL_INCLUDE_DIR='D:\devtools\OpenSSL-Win64\include'
$env:OPENSSL_NO_VENDOR='1'
$env:LIBCLANG_PATH='D:\devtools\LLVM\bin'
Remove-Item Env:MOONLIGHT_COMMON_NO_VENDOR -ErrorAction SilentlyContinue

cd D:\files\HomeSense-Studio-v2\packages\moonlight
cargo +nightly-2026-02-13-x86_64-pc-windows-msvc build --release -p streamer
```

**产物：** `packages\moonlight\target\release\streamer.exe`  
**验收：** 文件大小 **> 10MB**；旁路复制 `libcrypto-3-x64.dll`、`libssl-3-x64.dll`（OpenSSL-Win64\bin）到 runtime 同目录。

**勿做：** `MOONLIGHT_COMMON_NO_VENDOR=1` 且无 `MOONLIGHT_COMMON_LIB`；拆 `streamer` 源码为多 crate 小文件再编。

---

## 5. 功能取舍（用户口径：要什么 / 不要什么）

### 要（留在自研链里）

- 配对（PIN → PEM 落盘 `data/streaming/moonlight/<host-key>/`）
- 列应用 / 开流编排所需的 Sunshine 客户端能力
- **Streamer IPC**（父进程 spawn，stdin/stdout JSON 协议，`common::ipc`）
- HomeSense Nest **仅通过 spawn + stdout JSON + 环境变量** 耦合（待用户允许改 server 时再接线）

### 不要（裁剪目标）

- moonlight-web **web-server 产品面**：登录、用户表、admin、`/api/pair` 作为**长期**配对入口
- 多顶层包：`moonlight-driver-rust`、`moonlight-streamer`、Python mock driver
- 在 Streaming 里**重新设计** WebSocket/桥接（已有实现，只接 spawn 路径）
- Trae / VS IDE 全家桶往 D 盘搬（用户已有 VS Build Tools，工具在 devtools）

### 尚未并入单包、但逻辑上属于 Moonlight 子进程

- **pair / apps** 短生命周期 CLI：以前在已回收的 `moonlight-driver-rust`；下一步应在 **`packages/moonlight`  workspace 内** 增加成员（如 `driver` crate）或 **同一 repo 第二 bin**，**不要**再建 `packages/moonlight-driver-*`。

**stdout 合同（恢复接线时用）：**

```json
// pair 两行
{"code":0,"stage":"pin","pin":"1234"}
{"code":0,"stage":"paired","data":{"status":"paired","mock_pairing":false,"client_certificate_ref":"...","client_private_key_ref":"...","server_certificate_ref":"..."}}

// apps 一行
{"code":0,"data":{"apps":[{"app_id":1,"name":"..."}]}}
```

**streamer：** 默认进程 = **仅 IPC**（无 `health` 子命令，除非用户以后明确要求）。

---

## 6. 运行时与数据路径

| 路径 | 角色 |
|------|------|
| `data/streaming/moonlight/<host-key>/` | 配对 PEM：`client.crt.pem`、`client.key.pem`、`server.crt.pem` |
| `data/runtime/moonlight-web/package/` | **过渡**：`web-server.exe` + **待放入** 自研 `streamer.exe` + static |
| `apps/server/src/streaming/` | **master 基线**：编排、网关；**未**接新 driver 路径（还原后） |

`config.json` 中 `streamer_path` 目标指向自研 exe 文件名（如 `./streamer.exe` 或重命名后的 `homesense-moonlight-streamer.exe`）。

---

## 7. 明确踩过的坑（下一位勿重复）

1. 拆 streamer → `lib.rs` + `streamer_app.rs` + 脚本拆 crate → **264 个 rustc 错误**。
2. 用正则改 `streaming-gateway.service.ts` → 类被截断 → **`git restore` 救回**。
3. 多包并行（streamer + driver-rust + Python）→ 用户 **全部否决**。
4. 285KB 级 exe = **错误/ mock 产物**，不可当 streamer 用。
5. 对用户讲 Phase0/health/stream.html 桥接教程 → **用户已具备**，只需 **编译 + 裁剪 + spawn 路径**。

---

## 8. 优先级下一步（按顺序）

1. **本机验证编译** `packages/moonlight` → `streamer.exe` **>10MB**；失败则看完整 `cargo` 日志（agent 短超时需用户本地跑完）。
2. **拷贝 runtime**：`streamer.exe` + OpenSSL DLL → `data/runtime/moonlight-web/package/`，改 `config.json` 的 `streamer_path`。
3. **在 `packages/moonlight` 内** 恢复 pair/apps（从 git 历史/回收站逻辑或 `moonlight-common` `client-tokio` 示例移植），**仍是一个 workspace 根目录**。
4. **仅当用户点名允许**：改 Nest `pairHost` / driver 解析为 spawn 新 bin；**禁止**未授权再动 `apps/server` 其它模块。
5. 可选：release 二进制重命名、砍掉 web-server 登录相关静态资源（先砍登录再瘦 gateway）。

---

## 9. 与用户沟通偏好

- 中文可；**少废话**；**诚实**说明卡在哪一步（编译/权限/路径）。
- 改代码前：**说清改哪个路径**；`apps/server` 默认 **不动**。
- 用户要求「动手」= 改 `packages/moonlight` 或跑编译验证，不是重写 Streaming 架构文档。

---

## 10. 快速路径索引

| 项 | 路径 |
|----|------|
| 唯一 Moonlight 源码 | `D:\files\HomeSense-Studio-v2\packages\moonlight` |
| 上游参考 | `D:\files\References\home\moonlight-web-stream` |
| 工具链根 | `D:\devtools`（rust / OpenSSL / LLVM / VSBuildTools） |
| 项目根 | `D:\files\HomeSense-Studio-v2` |
| 本交接稿 | `C:\Users\a1\Desktop\HomeSense-Moonlight-交接文档-最新.md` |

---

*文档结束。接续会话请先 `Test-Path packages\moonlight` 与 `Get-Item target\release\streamer.exe`，再执行第 8 节。*
