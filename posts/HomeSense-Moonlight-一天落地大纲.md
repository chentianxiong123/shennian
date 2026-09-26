---
title: 'HomeSense Moonlight 一天落地大纲'
date: 2026-06-27
---

# HomeSense Moonlight 一天落地大纲

日期：2026-06-27
目标：自己掌握编译；去掉 moonlight-web 登录与用户体系；对接只认 HomeSense。

---

## 0. 原则

| 要 | 不要 |
| ---- | ---- |
| HomeSense 登记主机、配对、开流、浏览器看画面 | 用户再用 Moonlight Web 账号 |
| 子进程：moonlight-driver（短）+ homesense-moonlight-streamer（ipc）+ 薄网关（过渡可用 web-server） | 整站 moonlight-web-stream 当产品 |
| 证书在 data/streaming/moonlight | 绑上游 data.json 用户表 |
| 工具链 D:\devtools | MSYS2 / 重复 IDE |

---

## 1. 仓库现状

- packages/moonlight-streamer：已拆 cli / homesense/contract / streamer_app；build-release.ps1；勿用 285KB mock exe。
- packages/moonlight-driver：Python mock，待换 moonlight-driver-rust。
- Nest：pairHost 仍走 web-server /api/pair → 必须改 spawn driver。
- Runtime：streamer_path 用 ./streamer 或 ./homesense-moonlight-streamer.exe（自研编过后）。

---

## 2. 编译环境（每次编 Rust）

```
$env:RUSTUP_HOME='D:\devtools\rust'
$env:CARGO_HOME='D:\devtools\.cache\.cargo'
$env:PATH='D:\devtools\cargo\bin;' + $env:PATH
$env:OPENSSL_DIR='D:\devtools\OpenSSL-Win64'
$env:OPENSSL_LIB_DIR='D:\devtools\OpenSSL-Win64\lib'
$env:OPENSSL_INCLUDE_DIR='D:\devtools\OpenSSL-Win64\include'
$env:OPENSSL_NO_VENDOR='1'
$env:LIBCLANG_PATH='D:\devtools\LLVM\bin'
```

不要设 MOONLIGHT_COMMON_NO_VENDOR。exe 旁放 OpenSSL 两个 dll。

---

## 3. 执行顺序（今天照做）

### 阶段 A — 自研 streamer（1～2h）

1. cd D:\files\HomeSense-Studio-v2\packages\moonlight-streamer
2. powershell -ExecutionPolicy Bypass -File .\build-release.ps1
3. 成功：exe >10MB，health 一行 JSON
4. 拷到 data\runtime\moonlight-web\package\，config.json → "streamer_path": "./homesense-moonlight-streamer.exe"
5. 试开流（web-server + 自研 streamer）

### 阶段 B — 真配对 CLI（2～4h，核心）

1. 新建 packages/moonlight-driver-rust，bin 名 moonlight-driver
2. 照 moonlight-common 的 examples/client-tokio.rs：OpenSSLCryptoBackend、pair、PairPin
3. stdout 两行 JSON：stage:pin → stage:paired，mock_pairing:false，PEM 写 output_dir
4. MOONLIGHT_DRIVER_BIN=...\moonlight-driver.exe
5. 改 streaming-gateway.service.ts：pairHost spawn driver，删掉 requestJsonStream('/pair')

### 阶段 C — 砍对用户可见的登录（1～2h）

1. 代理只留 stream.html + stream WebSocket + stream/* 静态
2. 不代理 index.html / admin.html
3. 主机只认 streaming_hosts 表

### 阶段 D — 薄网关（有余力再做）

packages/moonlight-gateway：只 stream + 静态，无 auth。可当天跳过。

---

## 4. 环境变量

```
MOONLIGHT_DRIVER_BIN=...\moonlight-driver.exe
MOONLIGHT_WEB_RUNTIME_BIN=...\web-server.exe
MOONLIGHT_WEB_RUNTIME_PORT=18080
```

---

## 5. 当天验收

- [ ] streamer 真开流（非 mock）
- [ ] pair 真配对，mock_pairing: false
- [ ] 不再调 web /api/pair
- [ ] 用户不见 Moonlight 登录页

---

## 6. 之后

driver apps、替换 streamer_app 模块、瘦网关替代 web-server、HomeSense 自有 StreamViewer。

---

## 7. 一句话

今天：编过自研 streamer → 真 driver 配对 → Nest 改 spawn → 用户只走 HomeSense；web 登录对用户死亡。
