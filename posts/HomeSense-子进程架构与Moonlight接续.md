---
title: 'HomeSense 子进程架构定调 & Moonlight 接续备忘'
date: 2026-06-27
---

# HomeSense 子进程架构定调 & Moonlight 接续备忘

日期：2026-06-27
用途：回去接着干 Moonlight 时先看这篇。

## 1. 已定调

- 能力都在自己的 bin/package，Nest 统一 spawn 子进程，不嵌核心。
- Nest 常驻；慢的是热路上每次冷启动，不是子进程本身。
- 最好：Nest 常开；web-server 跟服务起一次一直跑；只有开流时起 streamer，流结束杀 streamer，别反复重启 web-server。
- ADB：一会话一个子进程。alist/media：可短 spawn，卡了再给单包做常驻 worker。
- 长会话 = 子进程不退出。常驻通用框架可以做，难度大一档；可先 SubprocessPool 只接一个最卡 CLI。

## 2. Moonlight

- web-server：Nest MoonlightWebRuntimeService 常驻 spawn
- streamer：web-server 按 streamer_path spawn，IPC 持续 JSON 行（ServerIpcMessage/StreamerIpcMessage），不是 moonlight-driver 那种 pair CLI
- moonlight-driver：短进程 stdout JSON

## 3. 环境

D:\devtools，参考 D:\files\References\home\moonlight-web-stream，主仓 D:\files\HomeSense-Studio-v2，别动 Trae/VSCode。OpenSSL 动态库，清 cargo cache 后 moonlight-common-sys 静态链补丁会丢。

## 4. Phase 1 已完成

packages/moonlight-streamer：homesense-moonlight-streamer mock，check/release OK。未改 streamer_path，未接 moonlight-common。

构建：
$env:RUSTUP_HOME='D:\devtools\rust'; $env:CARGO_HOME='D:\devtools\.cache\.cargo'; $env:PATH='D:\devtools\cargo\bin;'+$env:PATH
cd D:\files\HomeSense-Studio-v2\packages\moonlight-streamer
cargo +nightly-2026-02-13-x86_64-pc-windows-msvc build --release

## 5. 接续顺序

1. 确认 web-server 不重复冷启动
2. Phase 2：moonlight-streamer 接 moonlight-common-rust
3. data/runtime/moonlight-web + streamer_path 指向自研 exe
4. 可选 IPC 测试脚本
5. 配对仍 moonlight-driver 契约

相关：桌面 HomeSense-Moonlight-AList-重构方案.md、Moonlight自研源码分析.md

一句话：服务常驻 + web-server 常驻 + streamer 按流子进程 + 自研 IPC 替换上游 streamer。
