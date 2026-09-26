---
title: 'Moonlight 自研源码分析'
date: 2026-06-27
---

# Moonlight 自研源码分析

> 时间：2026-06-27
> 目标：不是继续把上游当黑盒，而是拆清楚哪些层可以自己造、哪些层必须分阶段替换。

---

## 1. 当前源码真实结构

`moonlight-web-stream` 不是一个单体程序，而是三层：

| 层 | 位置 | 作用 | 自研难度 |
|---|---|---|---|
| web-server | `src/` | 账户、配置、HTTP API、Web UI、启动 streamer | 低 |
| common | `common/` | API 类型、配置、stdin/stdout IPC | 低 |
| streamer | `streamer/` | 串流核心：Moonlight 协议、WebRTC/WebSocket transport、输入转发、音视频转发 | 高 |
| moonlight-common-rust | cargo git dependency | 配对、host HTTP API、RTSP/ENet/RTP/FEC、C bridge | 最高 |
| moonlight-common-c | dependency submodule | Limelight C 实现，真正成熟的 Moonlight streaming core | 最高 |

结论：如果要“自己造”，不能从 UI 或 web-server 开始冒充重写。真正的核心在 `streamer` 和 `moonlight-common-rust/moonlight-common-c`。

---

## 2. web-server 做了什么

入口：`src/main.rs`

web-server 负责：

- 读取配置
- 初始化日志
- 启动 Actix HTTP/HTTPS 服务
- 挂载 API 和前端静态资源
- 在 `/host/stream` WebSocket 收到用户请求时启动 streamer 子进程

关键文件：`src/api/stream.rs`

流程：

1. 浏览器连接 `/host/stream`
2. 第一条 WebSocket 消息必须是 `StreamClientMessage::Init`
3. web-server 根据用户、host、app 查配置和配对证书
4. `Command::new(config.streamer_path)` 启动 `streamer.exe`
5. web-server 和 streamer 之间通过 stdin/stdout 传 JSON line
6. 浏览器 WebSocket 文本/二进制消息被转发给 streamer
7. streamer 返回的文本/二进制消息再转发给浏览器

这层本质是“控制壳 + 子进程管理 + IPC 转发”。它不是串流核心。

自研策略：可以直接重写成 HomeSense 内部 TypeScript/Rust service，但第一阶段没有必要。

---

## 3. IPC 协议

位置：`common/src/ipc.rs`

IPC 非常简单：

- stdin/stdout
- 每条消息是一行 JSON
- stderr 用于日志

主要消息：

```text
ServerIpcMessage::Init
ServerIpcMessage::WebSocket(StreamClientMessage)
ServerIpcMessage::WebSocketTransport(Bytes)
ServerIpcMessage::Stop

StreamerIpcMessage::WebSocket(StreamServerMessage)
StreamerIpcMessage::WebSocketTransport(Bytes)
StreamerIpcMessage::Stop
```

这意味着我们可以先“自己造 streamer”，但保持同一套 IPC，这样 web-server 和前端暂时不用大改。

这是最好的第一刀。

---

## 4. streamer 做了什么

入口：`streamer/src/main.rs`

启动流程：

1. 通过 stdin/stdout 建立 IPC
2. 等待 `ServerIpcMessage::Init`
3. 用配对证书构造 `MoonlightHost`
4. 加载 WebRTC ICE server
5. 等浏览器选择 transport：`WebRTC` 或 `WebSocket`
6. 收到 `StartStream` 后构造 `MoonlightStreamSettings`
7. 调用 `host.start_stream(...)`
8. 调用 `moonlight_instance.start_connection(...)`
9. Moonlight C/Rust core 回调 video/audio/input/status
10. streamer 把 video/audio 包转成 WebRTC track 或 WebSocket binary 给浏览器

核心结构：

```text
StreamConnection
  MoonlightHost
  MoonlightInstance
  MoonlightStream
  transport_sender
  StreamVideoDecoder
  StreamAudioDecoder
  StreamConnectionListener
```

注意：`StreamVideoDecoder` 并不真正解码视频。它接收 host 发来的 compressed decode unit，然后交给 transport，最终由浏览器解码。

所以这个项目的 streamer 更准确叫：

```text
Moonlight protocol bridge -> browser transport bridge
```

不是传统意义的本地解码播放器。

---

## 5. transport 层

位置：

- `streamer/src/transport/mod.rs`
- `streamer/src/transport/webrtc/`
- `streamer/src/transport/web_socket/`
- `web/stream/transport/`

通道划分通过 `TransportChannelId`：

- `HOST_VIDEO`
- `HOST_AUDIO`
- `GENERAL`
- `STATS`
- 鼠标、键盘、手柄、触摸、RTT 等输入通道

浏览器端：

- WebRTC 模式：视频/音频走 MediaStreamTrack，输入和控制走 DataChannel
- WebSocket 模式：音视频和输入都走 WebSocket binary

streamer 端：

- 收到浏览器输入包后调用 `MoonlightStream` 的输入 API
- 收到 Moonlight video/audio 回调后调用 transport 的 `send_video_unit` / `send_audio_sample`

自研时 transport 可以保留，先换 Moonlight core。

---

## 6. 真正最难的是 moonlight-common

当前 workspace 依赖：

```toml
moonlight-common = { git = "...moonlight-common-rust...", features = [
  "tokio",
  "tokio-hyper",
  "openssl",
  "stream-c",
  "serde",
] }
```

其中 `stream-c` 会引入：

```text
moonlight-common-sys
  moonlight-common-c
    Connection.c
    ControlStream.c
    InputStream.c
    AudioStream.c
    VideoStream.c
    VideoDepacketizer.c
    RtspConnection.c
    PlatformCrypto.c
    ...
```

也就是说：

- Rust 层负责高级 API、HTTP、类型包装
- C 层负责成熟串流连接、RTSP、RTP/UDP、ENet、FEC、输入、音视频包处理

如果要彻底自己造，最终要替掉 `moonlight-common-c`。

但第一阶段不应该直接重写全部 C core。应该先造一个兼容壳，逐步替换模块。

---

## 7. 自研路线判断

不建议路线：

```text
直接从零写完整 Moonlight 客户端
```

原因：

- 配对流程涉及证书、PIN、加密握手
- 启动流程涉及 Sunshine/NVIDIA GameStream HTTP API
- streaming 涉及 RTSP、UDP/RTP、FEC、重传、控制通道
- 音视频需要正确 packetize/depacketize
- 输入注入协议复杂
- WebRTC 再转发又是一层复杂度

推荐路线：

```text
先自己造 streamer 壳，再逐步替换 moonlight-common
```

---

## 8. 第一阶段：造自己的 streamer

目标：

```text
homesense-streamer
```

要求：

- 保持现有 IPC 协议兼容
- 保持前端 WebSocket/WebRTC 协议兼容
- 暂时仍调用 moonlight-common-rust
- 把当前 streamer 的大文件拆成清晰模块

建议结构：

```text
crates/homesense-streamer/
  src/main.rs
  src/ipc_bridge.rs
  src/session.rs
  src/moonlight/
    mod.rs
    host.rs
    stream.rs
    input.rs
  src/transport/
    mod.rs
    webrtc.rs
    websocket.rs
  src/media/
    video.rs
    audio.rs
  src/stats.rs
```

第一阶段不是功能创新，而是“控制权迁移”：

- 你自己的 crate
- 你自己的目录
- 你自己的构建脚本
- 你自己的 IPC 协议定义
- 你自己的模块边界
- 但底层先复用 moonlight-common

成功标准：

- 能编译
- 能启动
- web-server 能 spawn 新 streamer
- 前端能完成 transport 协商
- 能走到 `ConnectionComplete`

---

## 9. 第二阶段：替换 web-server

等自研 streamer 稳定后，再把 web-server 去掉或内嵌到 HomeSense：

```text
HomeSense server
  /moonlight/hosts
  /moonlight/apps
  /moonlight/pair
  /moonlight/stream
  spawn homesense-streamer
```

这一步难度低，因为 web-server 只是业务壳。

---

## 10. 第三阶段：替换 moonlight-common-rust 的 Rust 层

可以先自己实现：

- serverinfo
- applist
- pair
- launch
- cancel
- resume

这些本质是 HTTP/HTTPS + XML/JSON + 证书签名。

这一步完成后，你就不需要 `MoonlightHost` 高级 API。

---

## 11. 第四阶段：替换 moonlight-common-c

这是最终核心：

- RTSP session
- control stream
- video stream
- audio stream
- input stream
- FEC
- ENet
- RTP packet queue
- crypto

这一步不能一口吃。建议顺序：

1. 输入通道
2. RTSP/control
3. audio
4. video depacketizer
5. FEC/retransmit

每替一个模块，都必须保留旧 C core 作为对照测试。

---

## 12. 当前最应该做的下一步

下一步不要继续改原来的 `streamer/src/main.rs`。

应该新建自己的 crate：

```text
D:\files\HomeSense-Studio-v2\packages\moonlight-streamer
```

先做“兼容 streamer 壳”：

1. 复制 `common` 里的 IPC 类型或在 HomeSense 里定义等价类型
2. 新 streamer 接收 `ServerIpcMessage::Init`
3. 新 streamer 返回 DebugLog / Setup
4. 先不连真实 Moonlight，做 mock transport 协商
5. 再接入 moonlight-common
6. 最后替换 HomeSense 配置里的 streamer 路径

这个路线最符合“自己造”：不是直接改上游，而是自己建立主工程，然后逐步吸收、替换、删除上游依赖。

