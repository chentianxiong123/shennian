---
title: 'HomeSense Moonlight 接续大纲（当前会话）'
date: 2026-02-13
---

# HomeSense Moonlight 接续大纲（当前会话）

## 工具状态
- Shell / 写文件：正常（本机用 PowerShell Set-Content 落盘）
- apply_patch：需标准 `*** Begin Patch` 头，偶发失败时用 Shell 改文件
- Rust：`D:\devtools\rust` + nightly-2026-02-13-msvc

## 已完成
1. 新建 `packages/moonlight-driver-rust`：真实配对 CLI（moonlight-common + OpenSSL），stdout 两行 JSON + PEM 落盘
2. Nest `pairHost` 改为 `startDriverPairTask`，优先 `packages/moonlight-driver-rust/target/release/moonlight-driver.exe`，否则 Python mock
3. `resolveMoonlightDriverCommand` 增加 bundled Rust 路径

## 未完成（你本机跑）
### A. 编译 driver
```powershell
powershell -ExecutionPolicy Bypass -File D:\files\HomeSense-Studio-v2\packages\moonlight-driver-rust\build-release.ps1
& D:\files\HomeSense-Studio-v2\packages\moonlight-driver-rust\target\release\moonlight-driver.exe health
```

### B. 编译 streamer（勿 MOONLIGHT_COMMON_NO_VENDOR=1）
```powershell
powershell -ExecutionPolicy Bypass -File D:\files\HomeSense-Studio-v2\packages\moonlight-streamer\build-release.ps1
```
成功标志：exe > 10MB（当前 285184 = mock/失败产物）。参考上游参考树 release streamer ~14MB。

### C. 切换 runtime
- 复制 `homesense-moonlight-streamer.exe` + OpenSSL DLL 到 `data\runtime\moonlight-web\package\`
- `config.json` → `"streamer_path": "./homesense-moonlight-streamer.exe"`

### D. 验收
- 配对：`mock_pairing: false`，不走 `/api/pair`
- 串流：web-server 子进程拉起自研 streamer IPC

## 架构（不变）
- Nest 常驻 + web-server 常驻（过渡）+ streamer 按会话 + driver 短任务
- 最终可砍 moonlight-web 登录面；配对已切 driver 子进程

