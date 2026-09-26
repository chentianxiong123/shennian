---
title: '微服务抽取路线图：从胖单体到 ARM 集群'
date: 2026-08-16
---

# 微服务抽取路线图：从胖单体到 ARM 集群

## 0. 架构原则

1. **算力可插拔**：core/ai 通过 MQ 下发任务，本地 compute-worker 与云端 compute-worker 是同一接口的不同实现，切换只需改 MQ 订阅方，不涉及架构重构
2. **播放源可切换**：视频 URL 存相对路径，渲染时拼 endpoint；切云 CDN 只改拼接逻辑，不改服务拆分
3. **边界由三问决定**：资源隔离、故障隔离、变更节奏——共享事务/身份核的数据不拆
4. **SSE 替代 WebSocket**：单 HTTP 长流，易代理、易鉴权、NAT 友好
5. **PG 替代 ES**：不要额外组件，PG FTS + zhparser 全文搜索 + pg_trgm 模糊/补全，零组件运维

## 1. 现状

### 1.1 Java 事实源（6 个物理服务）

| 服务 | 端口 | 职责 | 备注 |
|------|------|------|------|
| gateway | 8080 | Spring Cloud Gateway，路由转发，Nacos 注册 | 用脚投票：ai/search 确实独立 |
| account-social | 8081 | 用户/角色/验证码/关注/隐私/审计/操作任务 | |
| video-media | 8082 | 稿件/视频/分类/轮播/字幕/创作/统计 | live/meeting 塞这里 |
| content-interaction | 8085 | 评论/弹幕/互动/收藏/历史/动态/消息/举报/审核/画像 | |
| search-recommend | 8084 | 搜索/热榜/推荐/索引/创作者统计/运营工单 | analytics 塞这里 |
| ai | 8088 | AI 摘要/审核/客服/渠道/用量 | 有独立业务价值的服务 |
| mq | — | 消息 payload 公共库（非服务） | |

### 1.2 Go 单体现状

一个二进制 `core` 装 21 域：core/video/search/social/live/admin/ai/analytics/moderation/meeting/profile/studio/subtitle/support。进程内广播器（danmaku/notification）+ 内存 MQ + pg-fts + Redis 缓存。Makefile 已就位，产物落 `/tmp/`。

### 1.3 两版差距

- **该学的**：ai、search 独立是真实资源边界
- **不该抄的**：account 与 interaction 分开、analytics 塞 search、live 塞 video-media——这些都是部署时的权宜，不是设计

## 2. 目标拓扑：1 核心 + 2 业务 + 1 算力

```
主控（大算力专用机）
├─ core (业务核心 :8080)
│    account + interaction + social + admin + moderation
│    + studio + subtitle + profile + support + video/稿件元数据
│    ├─ SSE 端点（订阅 Redis pub/sub 推给本节点客户端）
│    ├─ pg-fts 搜索入口
│    └─ gRPC/HTTP 出站调用，算力任务入 MQ
├─ ai (AI 业务服务 :8088)
│    摘要/审核/客服/技能/渠道/提示词/用量/缓存
│    ├─ 业务 API 暴露
│    └─ 向 MQ 下发 ai_* 算力任务，订阅结果落库
├─ search (搜索服务 :8084)
│    PG FTS(zhparser) + pg_trgm 热补全
│    推荐 SQL + 创作者统计 + 运营工单
│    索引重建定期任务，主控低峰执行
├─ compute-worker (算力，无端口，MQ 消费)
│    ffmpeg → HLS 分片 | Whisper → 字幕 | Ollama → 摘要/审核/客服
│    结果回写 MinIO / PG，进度事件回 MQ
└─ nginx :80 LB（到各 ARM 节点 core 实例）

ARM 节点（盒子 / 手机，全部跑服务）
└─ core 无状态实例 ×N
    ├─ JWT 自验，连主控的 PG/Redis/MinIO/MQ
    ├─ SSE 弹幕/通知（Redis pub/sub 全节点 fanout）
    └─ 任意节点被 nginx 路由到

共享件：PG（主控）· Redis · MinIO · MQ
```

## 3. 边界哲学

拆不拆只问三个问题：

1. **资源隔离**：CPU/GPU/Mem 密集的活 → 拆（转码、AI 推理、索引重建）
2. **故障隔离**：长连接/高并发/易崩形态 → 拆（live/meeting/SSE 流）
3. **变更节奏**：schema/配置独立演进、需独立重启 → 拆

共享事务、共享身份核的数据 → **留在原地**。

### 逐域判定

| 域 | 资源 | 故障 | 变更 | 判定 |
|----|:---:|:---:|:---:|------|
| compute-worker（ffmpeg/Whisper/Ollama） | ★★★ | ★★★ | ★★★ | **独立进程，无端口，MQ 驱动** |
| ai 业务 | ★ | ★★ | ★★★ | **独立服务 :8088** |
| search/recommend | ★★ | ★★ | ★★★ | **独立服务 :8084** |
| live/meeting（SSE 化后） | ★★ | ★★ | ★★ | 默认留 core，负载起来再抽 |
| account + interaction + social | ☆ | ☆ | ☆ | **合并留 core** |
| admin/moderation/studio/subtitle/profile/support | ☆ | ☆ | ☆ | 并入 core |

## 4. 算力可插拔设计

```
core/ai → MQ 任务（transcode / ai_summary / ai_review / extract_audio / generate_subtitle）
       ↓
本地 compute-worker（ffmpeg + Ollama + Whisper）
       ↓ 切换只需：
云端 compute-worker（云转码 API + 云 LLM + 云 ASR）
       ↓ 或直接：
播放端直连云端 CDN（MinIO → 云存储，URL 拼接逻辑改一下）
```

**MQ 接口 = 抽象层**。本地 worker 和云端 worker 是同一 MQ task 类型的不同实现。core/ai 不关心谁在算。切换是 MQ 订阅方的配置变化，不是架构重构。

## 5. SSE 替换 WebSocket

| 现 Java WS 通道 | 目标 |
|-----------------|------|
| `/ws/danmaku` | `POST /api/danmaku/send` + `GET /sse/danmaku?video_id=X`（已有） |
| `/ws/notification` | `GET /sse/notify`（已有） |
| `/ws/meeting` 信令 | WebRTC 信令改 SSE + HTTP POST 往返 |

**广播器外置化改造：**
- `DanmakuBroadcaster`（进程内 map+chan）→ **Redis pub/sub**
- `NotificationBroadcaster`（进程内 map+chan）→ **Redis pub/sub**
- 任一节点收事件 → 发 redis → 所有 core 实例 SSE 推给本节点客户端

## 6. PG 替代 ES

| 层 | 方案 | 状态 |
|----|------|------|
| 全文检索 | `tsvector` + GIN 索引 | 已用 pg-fts |
| 中文分词 | zhparser 扩展 + textsearch_config | 未做，需 docker PG 镜像编译 C 扩展 |
| 模糊/纠错/补全 | pg_trgm GIN(gist) | 未做 |

**代价：** zhparser 需在 PG 镜像里编译安装；中文切词效果上限取决于词典，需维护热词表。

## 7. 横向前置改造清单（多实例 core 前的必选项）

| 当前 | 问题 | 改法 | 优先级 |
|------|------|------|--------|
| MQ `Type:"memory"` | 各实例 MQ 独立，任务链跨实例丢失 | Redis Streams / RabbitMQ | P0 |
| 弹幕广播器（进程内 map+chan） | 连 core-A 看不到 core-B 的弹幕 | Redis pub/sub | P0 |
| 通知广播器（进程内 map+chan） | 同上 | Redis pub/sub | P0 |
| 评论频控（内存 map+mutex） | 多实例各自算账，防刷失效 | Redis 计数 | P1 |
| PG 连接池 `MaxOpen=20` | 多实例叠加撞 PG 上限 | 按实例数调参 + PgBouncer | P1 |
| `handleSSEDanmaku:290` 直接订阅进程内 channel | 随广播器一起改 | 随广播器改造 | P0 |

## 8. msg-danmaku 服务抽离方案

### 目标

将弹幕（danmaku）+ 消息/通知（message）从 `internal/core/` 抽出为独立服务 `cmd/msg-danmaku/`，端口 `:8086`。

### 新服务职责

- 弹幕 CRUD + SSE 实时推流（`/sse/danmaku`）
- 消息/会话 CRUD + 通知 SSE 推流（`/sse/notify`）
- `DanmakuBroadcaster` / `NotificationBroadcaster`（进程内 map+chan，留在此服务，单实例够用）
- 独立 PG 连接

### Core 拿掉的内容

从 `internal/core/` 删除：
- `danmaku_repository.go`（含 DanmakuBroadcaster、DanmakuEvent）
- `danmaku_service.go`
- `message_repository.go`（含 MessageRepository、Conversation、Message、NotificationBroadcaster、NotificationEvent）
- `message_handler.go`（MessageHTTPHandler）
- `http_handler.go` 中所有 danmaku/message/SSE 路由

### Core 的改动

**问题：** `comment_service.go` 和 `interaction_service.go` 通过 `messageRepo.DB()` 拿 `*sql.DB` 查非 message 表，同时调 `messageRepo.SendMessage()` 发通知。

**改法：**
1. `messageRepo.DB()` → 直接给 comment/interaction service 传 `*sql.DB`（本来就该有的依赖）
2. `messageRepo.SendMessage()` → 改为发布 MQ 事件（`comment-reply` / `like` 等），msg-danmaku 服务消费后落库 + SSE 推

**通信方式：MQ（异步解耦）。** core 不关心通知何时送达，msg-danmaku 消费 MQ 事件后自行落库和 SSE 推流。

### 实施步骤

| 步 | 内容 |
|----|------|
| 1 | 新建 `internal/msg-danmaku/`，从 `internal/core/` 搬入 danmaku + message 代码，拆成独立包 |
| 2 | 新建 `cmd/msg-danmaku/main.go`，启动 HTTP 服务 `:8086` |
| 3 | 给 `comment_service.go` / `interaction_service.go` 直接传 `*sql.DB`，去掉 `messageRepo.DB()` |
| 4 | `sendLikeNotification` / `sendReplyNotification` / `sendCommentLikeNotification` 改为发 MQ 事件 |
| 5 | msg-danmaku 订阅 MQ 事件，落库 message + SSE 推 |
| 6 | 从 core 的 HTTP handler 中去掉 danmaku/message/SSE 路由注册 |
| 7 | 更新 Makefile 加 `build-msg-danmaku` target |
| 8 | 验证：弹幕发送 → SSE 收到；评论回复 → 通知 SSE 收到 |

## 9. 分阶段迁移（更新版）

| 阶段 | 内容 | 验收 |
|------|------|------|
| **P0**（已完） | Makefile 统一构建；二进制落 /tmp；media 独立进程 | `make build` 出 core+media |
| **P1** | media → compute-worker 定型（MQ 任务类型表 + 无端口 + 进度回传） | 盒子跑 worker 能接到转码任务 |
| **P2** | PG FTS 中文分词落地（zhparser/trigram） | 中文搜索返回正确结果 |
| **P3** | SSE 迁移：弹幕/通知/会议信令，广播器改 Redis pub/sub | 全网 SSE 正常，WS 通道下架 |
| **P4** | ai 服务抽离（搬 internal/ai → cmd/ai + :8088，Ollama 交给 worker） | ai 独立进程跑，core 走 API/MQ |
| **P5** | search 抽离（:8084） | 搜索/热榜/推荐独立进程 |
| **P6** | msg-danmaku 抽离（:8086，MQ 驱动通知） | 弹幕/消息独立服务，core 不再直连 message 表 |
| **P7** | nginx LB + 多 core 实例横向 | ARM 节点各跑 core，nginx 轮询 |

## 10. 验收标准（整体）

- 任意 ARM 节点冷启动 → 注册 core 实例 → 从 nginx 接到请求
- 主控 core 重启，弹幕/通知不丢不重（Redis pub/sub 兜底）
- 不加 ES/不加 WS，PG 一家把搜索与推荐跑通
- `make build` 一次出全部 4 个二进制：core / ai / search / compute-worker
- MQ 切换：将 compute-worker 的订阅从"本地"改为"云端"，不碰 core/ai 代码