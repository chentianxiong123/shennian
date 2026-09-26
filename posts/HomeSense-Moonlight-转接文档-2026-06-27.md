---
title: 'HomeSense Moonlight 转接文档（2026-06-27）'
date: 2026-06-27
---

# HomeSense Moonlight 转接文档（2026-06-27）

> **用途**：接替会话时以本文 + 桌面 `HomeSense-Moonlight-交接文档-最新.md` 为准。  
> **工作区**：仅 `D:\files\HomeSense-Studio-v2\packages\moonlight`（不要擅自改 `apps/server`）。

---

## 1. 用户当前诉求（本段会话）

1. **完成一次完整 workspace 编译**，对比产物体积（含 `streamer` + 根包 `web-server`）。
2. **弄清「大小是否和官方一样」**：官方 Release 是 **GNU** 包，本地按交接文档用 **MSVC** 编，**不能直接比字节数**。
3. **能否打开测试**：`streamer.exe` **不是**双击 GUI，是 **stdin/stdout JSON IPC 子进程**；要测需按协议喂 JSON 或接父进程 spawn。

---

## 2. 已核实事实（以本机为准）

| 项 | 状态 |
|----|------|
| 源码树 | 已从 `D:\files\References\home\moonlight-web-stream` **整包复制**到 `packages\moonlight`（已排除 `.git`、`target`） |
| 旧手改 `Cargo.toml` | 用户要求 **删掉重拷**，当前为 **上游未裁剪** 根 `Cargo.toml` |
| `cargo build --release -p streamer` | **已成功** |
| 本地 `streamer.exe` | `packages\moonlight\target\release\streamer.exe`，**14,288,384 bytes（约 14.3MB）**，MSVC |
| `cargo build --release`（完整 workspace） | **截至写稿未完成**；`target\release\` 下 **无** `web-server.exe` |
| 官方 Release | v2.10.0，资产 `moonlight-web-x86_64-pc-windows-gnu.zip`（zip 约 23.97MB） |
| 官方 zip 内（解压后） | `package/streamer.exe` **36,846,356**；`package/web-server.exe` **35,601,218**（**GNU**） |

**结论（体积）**：本地 14.3MB vs 官方 36.8MB **不等于编译失败**；target（MSVC vs GNU）+ release 链接/strip 策略不同。交接文档验收是 **>10MB 且非 285KB mock**——当前 streamer **达标**。

---

## 3. 为什么曾只编 streamer（勿误解为漏编）

桌面《交接文档-最新》要求：**去掉 moonlight-web 登录产品面**，Moonlight 模块只保留 **子进程/CLI + IPC**。因此曾用 `-p streamer` 验证子进程链。  
用户后续要求 **完整编译看体积** → 应跑 **无 `-p`** 的 `cargo build --release`，会同时编 `web-server`（仅作基线/体积对照，**不代表**接回 HomeSense 产品登录）。

---

## 4. 编译环境（每次编 Rust 前）

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
```

**仅 streamer：**

```powershell
cargo +nightly-2026-02-13-x86_64-pc-windows-msvc build --release -p streamer
```

**完整 workspace（用户当前目标）：**

```powershell
cargo +nightly-2026-02-13-x86_64-pc-windows-msvc build --release
```

编完后：

```powershell
Get-ChildItem .\target\release\*.exe | Select-Object Name,Length,LastWriteTime
```

**勿做**：`MOONLIGHT_COMMON_NO_VENDOR=1` 且无 `MOONLIGHT_COMMON_LIB`；拆 streamer 为多 crate 小文件（历史 **264 错**）。

---

## 5. 本段会话踩坑（下一位勿重复）

1. Agent 曾误用 **`open` 工具读本地路径**（`open` 仅支持 http(s) URL）→ 多轮中断；读文件/跑编译必须用 **`shell_command`**。
2. 未授权即改 `Cargo.toml`、越界动 `apps/server` → 用户叫停；**先报告改哪、再动手**。
3. 用官方 **GNU** zip 内 exe 大小对比本地 **MSVC** exe → 口径错误，易误判「编坏了」。

---

## 6. 建议下一步（按顺序）

1. **跑完整 `build --release`**，记录 `streamer.exe` + `web-server.exe` 体积。
2. **最小 IPC smoke**：读 `streamer\src\main.rs` / `common` IPC 类型，stdin 写一行 JSON，看 stdout 是否响应（勿期待双击界面）。
3. **裁剪（用户确认后）**：再从 workspace 去掉 `web-server` crate 或成员，保持 **单目录 `packages/moonlight`**；pair/apps 在 workspace **内**加 bin/crate，不建 `moonlight-driver-*` 顶层包。
4. **runtime**：拷贝 exe + OpenSSL DLL → `data/runtime/moonlight-web/package/`；改 `config.json` 的 `streamer_path`。
5. **Nest**：仅用户点名允许时再改 `apps/server` spawn 接线。

---

## 7. 路径索引

| 项 | 路径 |
|----|------|
| Moonlight 工作区 | `D:\files\HomeSense-Studio-v2\packages\moonlight` |
| 上游参考（只读） | `D:\files\References\home\moonlight-web-stream` |
| 工具链 | `D:\devtools` |
| 项目根 | `D:\files\HomeSense-Studio-v2` |
| 边界/原则长文 | `C:\Users\a1\Desktop\HomeSense-Moonlight-交接文档-最新.md` |
| 本转接稿 | `C:\Users\a1\Desktop\HomeSense-Moonlight-转接文档-2026-06-27.md` |

---

*写稿时间：2026-06-27。接续请先 `Test-Path packages\moonlight` 与 `Get-ChildItem target\release\*.exe`。*
