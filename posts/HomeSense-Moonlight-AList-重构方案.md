---
title: 'HomeSense 串流 & 网盘重构方案'
date: 2026-06-25
---

# HomeSense 串流 & 网盘重构方案

> 生成时间：2026-06-25

---

## 一、项目背景

HomeSense 是一个智能家居中枢系统，当前有两个外部依赖以 sidecar（子进程 exe）方式运行：

| 组件 | 当前方式 | 二进制位置 |
|------|----------|-----------|
| **AList**（百度网盘等云盘） | 启动 `alist-driver.exe`，内部跑完整 AList 服务 | `bin/alist-driver.exe` |
| **Moonlight**（串流） | 启动 `web-server.exe`，内部再 spawn `streamer.exe` | `data/runtime/moonlight-web/package/` |

### 当前痛点
- 两个外部 exe 是预编译的黑盒，无法定制、无法从源码控制
- AList 启动一个完整的 HTTP 服务（端口 15244），仅为了调几个 API
- Moonlight 也启动一个 HTTP 服务（端口 18080），存在认证跳转等体验问题
- 每次更新需要手动替换二进制文件

---

## 二、决策结论

### AList → 用 TypeScript 直接调用百度网盘 API（废弃 Go 二进制）

**可行性：高**

AList 的百度网盘驱动本质是纯 HTTP REST API 调用：
- 认证：`https://openapi.baidu.com/oauth/2.0/token`（标准 OAuth2 刷新令牌）
- 文件列表：`https://pan.baidu.com/rest/2.0/xpan/file?method=list`
- 下载链接：`https://pan.baidu.com/rest/2.0/xpan/multimedia?method=filemetas`
- 上传：precreate → 分片上传 → create 三步走

核心代码仅 4 个文件约 600 行，全部是 HTTP + JSON。TypeScript 可以完全替代。

百度网盘 OAuth2 参数（来自 AList 源码）：
- Client ID: `hq9yQ9w9kR4YHj1kyYafLygVocobh7Sf`
- Client Secret: `YH2VpZcFJHYNnV6vLfHQXDBhcE7ZChyE`

### Moonlight → 保持子进程，从源码自行编译

**可行性：高（但必须保留原生二进制）**

Moonlight 的 streamer 部分涉及：
- H264/H265 视频硬解码
- Opus 音频解码
- WebRTC 底层传输
- Moonlight 二进制协议（UDP/TCP）
- 原生输入注入（鼠标、键盘、手柄、触摸）

**这些全部不可能用 TypeScript 实现。** 也没有任何 Node.js 版本的 Moonlight 实现存在。

当前 Moonlight 架构：
```
web-server (actix-web HTTP)
  └── spawn streamer (stdin/stdout IPC)
       ├── moonlight-common (Rust crate，Moonlight 协议)
       ├── WebRTC 传输层
       ├── H264/H265 视频解码
       ├── Opus 音频解码
       └── 原生输入注入
```

streamer 已经通过 stdin/stdout IPC 通信，不暴露端口。暴露端口的是 web-server 那层。

---

## 三、已安装的编译环境

所有工具统一在 `D:\devtools` 管理（2026-06-27 已复核）。

| 组件 | 版本 | 路径 |
|------|------|------|
| Rust nightly (MSVC) | nightly-2026-02-13 | 默认工具链，`D:\devtools\cargo\bin` |
| Rustup / Cargo | 1.29.0 / 1.95.0-nightly | `D:\devtools\rust` / `D:\devtools\.cache\.cargo` |
| VS Build Tools | 2022 (C++ 已装) | `D:\devtools\VSBuildTools` |
| Windows SDK | 10.1.26100.7705 | 实体在 `D:\devtools\WindowsKits\10`，C 盘为 Junction |
| OpenSSL Dev | 3.5.3 | `D:\devtools\OpenSSL-Win64` |
| LLVM / libclang | 22.1.8 | `D:\devtools\LLVM` |
| Node / pnpm | v22.22.2 / 11.5.1 | `D:\devtools` 下 Node 管理 |
| Java (主) | ms-21 | `D:\devtools\Java\ms-21`，`JAVA_HOME` 已指向此处 |
| Java (兼容保留) | Corretto 8 | `D:\devtools\Java\corretto-1.8.0_472` |
| Go / CMake / Git / uv / ffmpeg | 已装 | `D:\devtools\` 对应目录 |

**已验证：** `cl.exe` / `link.exe` / `rc.exe` 可用；最小 C 与 Rust MSVC 编译通过；Moonlight `cargo check` 与 `cargo build --release` 已通过。

**环境变量（新终端建议）：**
```powershell
$env:RUSTUP_HOME = "D:\devtools\rust"
$env:CARGO_HOME  = "D:\devtools\.cache\.cargo"
$env:OPENSSL_ROOT_DIR = "D:\devtools\OpenSSL-Win64"
$env:OPENSSL_DIR = "D:\devtools\OpenSSL-Win64"
$env:OPENSSL_NO_VENDOR = "1"
$env:OPENSSL_LIB_DIR = "D:\devtools\OpenSSL-Win64\lib"
$env:OPENSSL_INCLUDE_DIR = "D:\devtools\OpenSSL-Win64\include"
$env:LIBCLANG_PATH = "D:\devtools\LLVM\bin"
$env:PATH        = "D:\devtools\cargo\bin;D:\devtools\LLVM\bin;D:\devtools\OpenSSL-Win64\bin;$env:PATH"
cmd /c "call D:\devtools\VSBuildTools\VC\Auxiliary\Build\vcvars64.bat >nul && set"
```

**主路线：** MSVC + VS Build Tools；不再依赖 MSYS2 / GNU 默认链。

**已清理冗余：** Rust GNU 工具链、`D:\devtools\mingw64`、`StrawberryPerl`、`perl-msys-lib`、`make-shim`、`D:\devtools\Java\corretto-17`。

---

## 四、Moonlight 源码编译步骤

源码位置：`D:\files\References\home\moonlight-web-stream`

### 4.1 项目结构

```
moonlight-web-stream/
├── Cargo.toml          # workspace 根
├── Cargo.lock
├── rust-toolchain.toml # 指定 nightly-2026-02-13
├── common/             # 共享类型和 IPC
├── streamer/           # 串流器（核心，不可替代）
├── src/                # web-server（HTTP 服务）
├── web/                # 前端 TypeScript
├── build-windows.ps1   # Windows 构建脚本
└── buildAll.ps1        # 跨平台构建脚本
```

### 4.2 构建命令

```powershell
# 设置环境
$env:RUSTUP_HOME = "D:\devtools\rust"
$env:CARGO_HOME  = "D:\devtools\.cache\.cargo"
$env:OPENSSL_ROOT_DIR = "D:\devtools\OpenSSL-Win64"
$env:OPENSSL_DIR = "D:\devtools\OpenSSL-Win64"
$env:OPENSSL_NO_VENDOR = "1"
$env:OPENSSL_LIB_DIR = "D:\devtools\OpenSSL-Win64\lib"
$env:OPENSSL_INCLUDE_DIR = "D:\devtools\OpenSSL-Win64\include"
$env:LIBCLANG_PATH = "D:\devtools\LLVM\bin"
$env:PATH = "D:\devtools\cargo\bin;D:\devtools\LLVM\bin;D:\devtools\OpenSSL-Win64\bin;$env:PATH"

# 加载 MSVC 环境
cmd /c "call D:\devtools\VSBuildTools\VC\Auxiliary\Build\vcvars64.bat >nul && set" | ForEach-Object {
  if ($_ -match '^([^=]+)=(.*)$') { Set-Item -Path "Env:$($matches[1])" -Value $matches[2] }
}

# 进入源码目录
cd D:\files\References\home\moonlight-web-stream

# 编译
cargo build --release
```

### 4.3 产出物

编译产出在 `target/release/` 下：
- `web-server.exe` — HTTP 服务 + 前端
- `streamer.exe` — 串流核心

需要复制到 HomeSense 的 `data/runtime/moonlight-web/package/` 目录。

### 4.4 当前 HomeSense 中的 Moonlight 调用链

```
HomeSense (NestJS)
  └── MoonlightWebRuntimeService
       ├── ensureStarted() → spawn web-server.exe
       ├── proxyHttp() → 代理 HTTP 请求到 127.0.0.1:18080
       ├── proxyUpgrade() → 代理 WebSocket
       └── 内部认证 → homesense-auth.json
```

文件：`apps/server/src/streaming/moonlight-web-runtime.service.ts`

---

## 五、百度网盘 TypeScript 重写计划

### 5.1 当前 AList 调用链

```
HomeSense (NestJS)
  └── AlistService
       ├── startDriver() → spawn alist-driver.exe (端口 15244)
       └── 转发请求到 127.0.0.1:15244
```

### 5.2 替换方案

直接在 HomeSense 内部实现百度网盘 API：

1. **认证模块** — OAuth2 令牌刷新
2. **文件列表** — xpan/file?method=list
3. **下载链接** — xpan/multimedia?method=filemetas + 302 跳转
4. **上传** — precreate + 分片上传 + create

### 5.3 百度网盘 API 关键点

- 下载大于 20M 的文件需要 User-Agent: `pan.baidu.com`
- 上传分片大小：普通用户 4MB，会员 16MB，超级会员 32MB
- MD5 校验有加密/解密逻辑（见 AList 源码 `DecryptMd5` / `EncryptMd5`）
- 302 跳转获取真实下载链接

---

## 六、下一步行动

1. **编译 Moonlight** — MSVC + vcvars64 + OpenSSL 3.5.3 + LLVM/libclang，执行 `cargo build --release`
2. **复制产出** — 将编译好的 exe 放到 HomeSense 运行目录
3. **验证串流** — 确认从源码编译的版本能正常工作
4. **TypeScript 百度网盘** — 在 HomeSense 内部实现百度网盘 API，废弃 alist-driver
5. **清理** — 删除 `bin/alist-driver.exe`，移除 AList sidecar 相关代码

---

## 七、参考资料

| 资源 | 路径 |
|------|------|
| AList 百度网盘驱动源码 | `D:\files\References\alist\drivers\baidu_netdisk\` |
| AList 百度网盘文档 | `D:\files\References\alist-docs\docs\zh\guide\drivers\baidu.md` |
| AList 驱动接口定义 | `D:\files\References\alist\internal\driver\driver.go` |
| Moonlight 源码 | `D:\files\References\home\moonlight-web-stream\` |
| Moonlight streamer | `D:\files\References\home\moonlight-web-stream\streamer\` |
| HomeSense Moonlight 服务 | `D:\files\HomeSense-Studio-v2\apps\server\src\streaming\` |
| HomeSense AList 服务 | `D:\files\HomeSense-Studio-v2\apps\server\src\alist\` |


