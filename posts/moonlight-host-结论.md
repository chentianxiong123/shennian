---
title: 'moonlight-host 开发结论'
date: 2026-06-28
---

# moonlight-host 开发结论

## 最终产出的二进制（minimal standalone）

**`moonlight-host.exe`** — 10.5 MB，单文件，无外部 DLL 依赖

- 工具链：Rust nightly + MinGW-w64 GCC 16.1.0 + LLVM 19.1.7
- 目标：`x86_64-pc-windows-gnu`
- 构建命令：`cargo build -p moonlight-host --target x86_64-pc-windows-gnu --release`
- strip 后大小：10.5 MB（`llvm-strip --strip-all`）
- 功能：`health/pair/apps/cancel/serve` 五个子命令

## 关键问题 & 解决

### 1. openssl-sys 编译失败（GNU target）
- **问题**：openssl-sys 默认尝试 vendored 编译，耗时 >10 分钟且容易失败
- **解决**：
  - `OPENSSL_NO_VENDOR=1` — 强制使用系统 OpenSSL
  - `OPENSSL_ROOT_DIR` + `OPENSSL_LIB_DIR` + `OPENSSL_INCLUDE_DIR` — 指定 MSYS2 UCRT64 路径
  - `BINDGEN_EXTRA_CLANG_ARGS_x86_64_pc_windows_gnu` — 指定 bindgen target

### 2. rustls 运行时 panic
- **问题**：`CryptoProvider` 未初始化（缺少 `ring` feature）
- **解决**：在 host 的 Cargo.toml 中加入 `rustls = { workspace = true }`，确保 feature 传递

### 3. 二进制体积优化
- workspace `[profile.release]`：`strip = "symbols"`, `lto = "fat"`, `codegen-units = 1`, `panic = "abort"`
- moonlight-host 覆写：`opt-level = "z"`
- 最终 **10.5 MB**（vs MSVC 4 MB + 8.7 MB DLL）

### 4. MSVC 方案尝试（放弃）
- MSVC 目标 + clang-cl + lld-link → 4 MB 但需 `libcrypto-3-x64.dll` + `libssl-3-x64.dll`
- vendored OpenSSL 构建失败（缺 perl，超时）
- 结论：**GNU 单文件方案更优**

### 5. 上游 web-server 配置问题
- **streamer_path 指向错误路径**：MSVC 默认路径 `target\release\streamer.exe` 不存在
- **修复**：改为 `target\x86_64-pc-windows-gnu\release\streamer.exe`
- **data.json 用户 ID 不匹配**：config 中 `default_user_id: 4160598498` 但 data.json 实际是 `4058998160`
- **前端 static 目录找不到**：工作目录需指向 `package/`，而非 `server/`

## 最终状态

| 组件 | 状态 |
|------|------|
| `moonlight-host` CLI（health/pair/apps/cancel） | ✅ 全部通过 |
| `moonlight-host serve`（WS↔IPC bridge） | ✅ Handshake + Init 通过 |
| `streamer.exe`（GNU 编译） | ✅ 路径正确，上游 web-server 串流成功 |
| 上游 web-server ↔ Sunshine 串流 | ✅ 视频流输出正常 |
| 二进制部署大小 | 10.5 MB 单文件 |

## 后续方向

1. 用 `moonlight-host serve` 替换上游 web-server，HomeSense 直接启动 moonlight-host 替代 web-server
2. 修改 `streaming-gateway.service.ts`（spawn moonlight-host 替代 web-server）
3. 简化 `moonlight-web-runtime.service.ts`
4. 对比 moonlight-host 与上游 web-server 的串流稳定性