---
title: 'MyBilibili 项目总文档（交接 · 审计 · 源码级对齐）'
date: 2026-08-13
---

# MyBilibili 项目总文档（交接 · 审计 · 源码级对齐）

> 最后更新: 2026-08-13
> 项目仓库: https://github.com/chentianxiong123/mybilibili
> 旧版微服务: https://github.com/chentianxiong123/mybilibili-cloud（只读参照）
> 本文件合并了：项目交接文档、新旧版本等效性审计报告、源码级全局对齐计划、源码级全局对齐执行手册

---

# 第一部分 项目交接

## 1.1 项目背景

本项目始于一个仿 B 站（哔哩哔哩）视频平台的完整实现。最初采用 **Spring Cloud 微服务架构**（`mybilibili-cloud`，Java 17 + Spring Boot 3.2 + Spring Cloud 2023），包含 12 个后端模块、3 套前端，覆盖视频投稿、弹幕、评论、私信、动态、搜索、直播、视频会议、连麦、AI 字幕/摘要、AI 客服、AI 内容审核等全部核心功能。

微服务版本功能完整但部署运维成本高（12 个 Java 容器 + MySQL + Redis + MongoDB + ES + MinIO + RocketMQ + Nacos），不适合开发/演示环境。

**重构目标**：改为 **Go 单体**（`mybilibili`）——降低部署复杂度（1 个 Go 二进制 + PostgreSQL）、新增 Flutter 移动端、保持功能完整性、统一接口规范。

## 1.2 架构对比

| 维度 | 微服务版 | Go 单体版 |
|------|----------|-----------|
| 后端语言 | Java 17 + Spring Cloud 2023 | Go 1.22 |
| 服务数量 | 12 个独立模块 | 1 个二进制（`cmd/core`） |
| API 网关 | Spring Cloud Gateway | 无（直连 http.ServeMux + 中间件） |
| 认证 | JWT 双 token（2h + 30d）+ RBAC | JWT HS256 双 token（24h + 7d） |
| 关系库 | MySQL 8.0 | PostgreSQL 16 |
| 缓存 | Redis | 无（规划中引入） |
| 文档库 | MongoDB（弹幕/画像/推荐配置） | 无 |
| 搜索 | Elasticsearch | SQL 内存搜索（规划 PG tsvector） |
| 对象存储 | MinIO | 本地文件系统 |
| 消息队列 | RocketMQ | 内存事件总线 |
| 实时通信 | WebSocket | SSE |
| 前端 | web + admin-web + wap + studio-web | web-ts(TS 版) + Flutter + 无管理端 |

## 1.3 Go 单体仓库结构

```
mybilibili/
├── mybilibili-go/                  # Go 后端
│   ├── cmd/core/main.go            # 主服务入口
│   ├── internal/
│   │   ├── core/                   # 核心：用户/稿件/评论/互动/收藏/消息/弹幕
│   │   │   ├── auth_middleware.go        # JWT 认证中间件
│   │   │   ├── manuscript_http_handler.go # 稿件 HTTP JSON 端点
│   │   │   ├── public_api_handler.go     # 评论公开端点
│   │   │   ├── manuscript_service.go     # 稿件服务
│   │   │   ├── manuscript_repository.go  # 稿件仓库
│   │   │   ├── comment_*.go / interaction_*.go
│   │   │   ├── user_extend_handler.go    # 用户扩展端点
│   │   │   └── favorite_handler.go       # 收藏夹
│   │   ├── admin/                  # 管理后台 + 稿件审核
│   │   ├── social/                 # 动态/关注/合集/观看历史
│   │   ├── search/                 # 搜索/推荐
│   │   ├── ai/                     # AI 总结/客服/审核
│   │   ├── live/ meeting/ message/ subtitle/ profile/ support/ studio/ analytics/ moderation/ video/
│   ├── sql/                        # PostgreSQL 迁移（001~017）
│   ├── deploy/                     # Docker Compose
│   └── proto/                      # protobuf 定义
├── mybilibili-web-ts/              # Web 前端（Vue3 + TS，微服务 web 的移植版）
└── mybilibili-app-flutter/         # Flutter 移动端（新增）
```

## 1.4 数据现状

**旧版种子数据**（`mybilibili-cloud/init/mybilibili-mysql.sql`）：39 张表 + 357 条 INSERT —— 4 用户、9 稿件、11 视频、13 评论、62 互动、23 分类、40 标签、19 权限等。

**Go 单体当前**：表结构在 `sql/*.sql` 已建齐，测试种子已手动插入部分（4 用户 / 3 稿件 / 4 视频 / 14 分类 / 3 评论）。可运行：`docker run pgvector/pgvector:pg16` + 迁移 + 启动。

## 1.5 接口规范（已统一）

- **版本前缀**：全用 `/api/v1/`
- **认证**：标准 JWT HS256，`Authorization: Bearer <token>`；兼容 `X-User-Id`；双 token（access 24h / refresh 7d），刷新端点 `POST /api/v1/user/token/refresh`
- **响应格式**：成功 `{code:200, data, message:"ok"}`；错误 `{code, message, data:null}`；分页 `{list, total, page, size}`
- **分页参数**：兼容 `page_size`/`pageSize`/`size`
- **字段**：snake_case；关键对象双写兼容（nickname+name、avatar+avatar_url）

## 1.6 前端关系

- `mybilibili-web-ts` = 微服务 `mybilibili-web` 的 **TypeScript 移植版**（目录结构一致），baseURL `/api/v1`
- `mybilibili-app-flutter` = **新增移动端**，baseUrl `http://localhost:8080/api/v1`
- `mybilibili-admin-web`（旧版管理端）→ Go 版**无对应管理前端**
- web-ts 部分页面（首页/热门）用 mock 数据未接后端

## 1.7 部署

```bash
# 1) 启动 PostgreSQL（命名卷 pg16-data 持久化数据，删容器数据不丢）
docker volume create pg16-data
docker run -d --name pg16 \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=mybilibili \
  -p 5432:5432 \
  -v pg16-data:/var/lib/postgresql/data \
  pgvector/pgvector:pg16

# 2) 按序执行 sql/*.sql 建表（首次）
cd mybilibili-go && for f in sql/*.sql; do docker exec -i pg16 psql -U postgres -d mybilibili < "$f"; done

# 3) 启动后端 :8080（数据已在持久化卷中，无需重灌种子）
PG_DSN="postgres://postgres:postgres@localhost:5432/mybilibili?sslmode=disable" \
JWT_SECRET="dev-secret-change-in-production" \
go run ./cmd/core

# 4) 启动 Web 前端
cd mybilibili-web-ts && pnpm install && pnpm dev
```

> 容器删除重建：`docker rm -f pg16` 后重复第 1 步（卷已命名，数据自动恢复）。

---

# 第二部分 新旧版本等效性审计

## 2.1 审计方法

- 旧版 62 个 Controller → 365 个端点
- 新版 182 个 mux 路由 + 27 个手动 router 分支
- 前缀归一化（/api vs /api/v1）后逐功能域比对

## 2.2 总体结论

> **路由覆盖约 85%，实现等效约 70%——未完全等效。**

| 等级 | 占比 | 含义 |
|---|---|---|
| ✅ 完全等效 | ~60% | 端点存在且逻辑可用 |
| 🟡 部分等效 | ~25% | 占位/简化/依赖 mock |
| ❌ 缺失 | ~15% | 旧版有，新版无 |

## 2.3 按域评分

| 功能域 | 实现等效 | 结论 |
|---|---|---|
| 用户/账号 | 95% | ✅ 等效 |
| 管理员 | 88% | ✅ 基本等效（security-settings 静态） |
| 稿件/视频 | 80% | 🟡 缺 publish/unpublish owner 端点、视频级端点 |
| 互动 | 95% | ✅ 等效 |
| 评论 | 92% | ✅ 基本等效（缺评论详情单端点） |
| **搜索/推荐** | **40%** | ❌ **for-you 空数组、无 ES、无热词、无联想** |
| **AI** | **15%** | ❌ **总结是 stub（"not yet implemented"）** |
| 弹幕 | 90% | ✅ 等效（WS→SSE） |
| 动态/合集/关注 | 85% | ✅ 基本等效 |
| 直播/会议/消息 | 88% | ✅ 基本等效 |
| 字幕/作品集/画像 | 80% | 🟡 画像 init 缺失 |
| **稿件审核流** | **20%** | ❌ **approve/reject/publish/transcode 等 15+ 端点待补** |

## 2.4 重点"假实现"清单

| 端点 | 新版当前行为 | 旧版行为 |
|---|---|---|
| `/api/v1/ai/summary/{id}` | 返回 `"not yet implemented"` | DeepSeek 摘要 |
| `/api/v1/recommend/for-you` | 返回 `[]` | ES 加权个性化推荐 |
| `/api/v1/search/videos` | SQL LIKE | ES 全文检索 |
| `/manuscript/admin/approve/reject/publish/...` | 部分缺失 | 完整审核流转+事件 |

## 2.5 协议差异

- 弹幕/通知/会议信令：旧版 WebSocket → 新版 SSE（功能等效）
- 搜索：ES → SQL。存储：MinIO → 本地。缓存：Redis → 无。MQ：RocketMQ → 无

---

# 第三部分 源码级全局对齐执行手册

> 目标：让 Go 单体在**行为层面**与 Java 微服务逐业务域**源码级对齐**（状态机/业务规则/事件/接口结构/错误语义一致）。
> 改动遵循：**行为等效 + 按核心链路分批 + 基础设施混合**。

## 3.1 分工表（5 批次 27 任务包，按编号顺序推进，严禁跳批次）

### 批次 0 — 底座（0.5-1 周）
| 任务 | 内容 | 输出 |
|---|---|---|
| T0.1 | 建 `docs/alignment/` 目录 | 目录 |
| T0.2 | 写状态机对照表（mcp/版权所有 video 底表） | `state-machines.md` |
| T0.3 | 建契约测试骨架 | `internal/*/contract_test.go` |
| T0.4 | 旧版种子数据在 Go 库跑通一条冒烟链路 | `scripts/smoke.sh` |

### 批次 1 — 稿件生命周期（1-1.5 周）
| 任务 | 旧版源码 | 新版文件 |
|---|---|---|
| T1.1 列表/详情 (pending/processing/all/{id}/statistics) | `ManuscriptServiceImpl`+`ManuscriptAdminController` | `internal/admin/admin_manuscript_handler.go` |
| T1.2 审核流 (approve/reject/approve-with-process/publish/unpublish/retry/take-down) | 同上 | `internal/admin/admin_manuscript_handler.go` |
| T1.3 视频处理 (transcode/extract-audio/generate-subtitle/ai-summary/process-all/reset/video-source) | `ManuscriptServiceImpl`+`VideoProcessProgressController` | `internal/admin/admin_manuscript_handler.go` |
| T1.4 上传会话 (session/chunk/complete/cancel+白名单) | `ManuscriptUploadSessionService`+前端对照 | `internal/core/manuscript_http_handler.go` |
| T1.5 owner 发布/下架 | `ManuscriptServiceImpl` | `internal/core/manuscript_http_handler.go` |

### 批次 2 — 互动/评论/收藏（1 周）
| 任务 | 旧版源码 | 新版文件 |
|---|---|---|
| T2.1 互动幂等+计数+批量状态 | `VideoInteractionServiceImpl`(836) | `internal/core/interaction_*` |
| T2.2 观看历史+播放量防刷 | `WatchHistoryServiceImpl`(181) | `internal/social/dynamic_handler.go` |
| T2.3 评论/回复/点赞/软删/举报 | `CommentServiceImpl`(926) | `internal/core/comment_*` |
| T2.4 违禁词过滤（新版缺失需新建） | `ProhibitedWordController`+`CommentServiceImpl` | `internal/moderation/` |
| T2.5 收藏夹 CRUD+关联+归属校验 | favorite 相关 | `internal/core/favorite_handler.go` |

### 批次 3 — 搜索/推荐（1-1.5 周）
| 任务 | 旧版源码 | 新版文件 |
|---|---|---|
| T3.1 搜索 videos (加权/分页/排序) | `VideoSearchServiceImpl`(264)+`VideoSearchMySqlServiceImpl`(151) | `internal/search/` |
| T3.2 suggest 联想 + hot 热词 | `VideoSearchServiceImpl`+`HotSearchServiceImpl`(132) | `internal/search/` |
| T3.3 **for-you 个性化**（替换 `[]`） | `VideoRecommendServiceImpl`(479) | `internal/search/search_handler.go` |
| T3.4 related / hot-recommend | `VideoRecommendServiceImpl` | `internal/search/` |
| T3.5 用户画像表+行为驱动 (like3/collect5/watch1,衰减0.95) | `UserProfileServiceImpl`(146) | `internal/profile/` |
| T3.6 索引管理 | `ManuscriptIndexServiceImpl`(244) | `internal/search/` |

### 批次 4 — AI（1-1.5 周）
| 任务 | 旧版源码 | 新版文件 |
|---|---|---|
| T4.1 AI 总结 (可配置 channel/SSE/落库) | `AiSummaryServiceImpl`(147)+`AiServiceProvider` | `internal/ai/` |
| T4.2 AI 字幕 (Whisper) | `AiSubtitleServiceImpl`(244) | `internal/ai/` |
| T4.3 AI 客服 | `CustomerServiceAiServiceImpl`(294) | `internal/ai/` |
| T4.4 AI 内容审核 | ContentReview 相关 | `internal/ai/`、`internal/moderation/` |
| T4.5 AI 管理 (channels/skills/usage/configs) | `AdminAiServiceImpl`(224)+`AiSkillServiceImpl`(152) | `internal/ai/` |

### 批次 5 — 实时/社交/消息/管理长尾（1 周）
| 任务 | 旧版源码 | 新版文件 |
|---|---|---|
| T5.1 弹幕 (广播/批量计数/趋势) | `DanmakuServiceImpl`(346) | `internal/core/http_handler.go` |
| T5.2 动态/合集/关注/观看历史 | `DynamicServiceImpl`(357)+`CollectionServiceImpl`(225) | `internal/social/` |
| T5.3 消息 | `MessageServiceImpl`(292) | `internal/core/message_handler.go` |
| T5.4 直播/会议/连麦 | `LiveRoomServiceImpl`(158)+Meeting | `internal/live/`、`internal/meeting/` |
| T5.5 字幕/画像/工单/创作者统计 | `SubtitleServiceImpl`(428)+`CreatorStatsServiceImpl`(493)+`SupportTicketServiceImpl`(151) | `internal/subtitle/` 等 |
| T5.6 管理 RBAC/审计/操作任务 | `AdminUserServiceImpl`(208)+`AuditLogServiceImpl`(150) | `internal/admin/` |

## 3.2 强制对齐流程（每任务必走）

### 六步搬运法
```
步骤1 定位旧版源码  → 用 3.6 源码索引找到对应 .java
步骤2 提取业务逻辑  → 状态流转/事件/SQL 写进搬运对照表
步骤3 映射新版文件  → 分工表找到对应 handler/service
步骤4 实现          → 按对照表逐条翻译成 Go（不跳逻辑）
步骤5 写契约测试    → 断言新旧响应结构一致
步骤6 验收          → 过 3.5 验收标准，不过回步骤4
```

### 搬运对照表模板
文件：`docs/alignment/tasks/T1.2-审核流.md`
```markdown
## 旧版参照（文件:行号）
## 状态流转（照抄旧版常量）
| 操作 | from→to | review_status | 副作用 |
## 业务规则（旧版 if/else 逐条）
## 事件/副作用（旧版触发哪些）
## Go 实现对照（已对齐✅/待补❌）
## 契约断言
```

### 强制规则
1. 旧版状态常量新版必须同名同值，不得改值
2. 旧版事件副作用（通知/索引/状态流水）新版必须落库
3. 旧版有该分支新版缺该分支 = 未完成
4. 禁止 TODO/`not yet implemented`/空数组占位通过验收
5. 新增任何表用 `sql/0xx_*.sql` 迁移文件，别手写建表
6. 一任务一 commit，message 前缀 `align(T批次)任务名`

## 3.3 契约测试机制

目标：让"新旧行为不一致"变成测试失败。每任务写契约测试：
- 断言 HTTP 状态码 / JSON 顶层结构 / 关键字段
- **SQL 直查断言状态最终落库**（权威）
- 断言副作用事件/通知落库
- 列表任务加断言分页/排序行为

运行：`cd /tmp/mybilibili/mybilibili-go && go build ./... && go test ./... -run Contract -vet=off`

## 3.4 状态机对照表（T0.2 产出底表）

| 实体 | 常量 | 值 |
|---|---|---|
| Manuscript | STATUS_PENDING_REVIEW | 0 |
| Manuscript | STATUS_PROCESSING | 1 |
| Manuscript | STATUS_PUBLISHED | 3 |
| Manuscript | STATUS_REJECTED | 4 |
| Manuscript | STATUS_PROCESS_FAILED | 5 |
| Manuscript | STATUS_UNPUBLISHED | -1 |
| Manuscript | REVIEW_STATUS_PENDING/APPROVED/REJECTED | 0/1/2 |
| Video | PROCESS_STATUS_PENDING/TRANSCODING/AUDIO/SUB/AI/COMPLETED | 0/1/2/3/4/5 |
| Video | PROCESS_STATUS_*_FAILED/SUCCESS | 10/11,20/21,30/31,40/41 |

## 3.5 验收标准（全满足才完成）

- [ ] 搬运对照表填写完整逐条打勾
- [ ] Go 代码实现旧版全部业务分支，无 TODO/占位
- [ ] 契约测试通过，`go test -run Contract` 绿
- [ ] 状态机/副作用事件/通知均落库并有断言
- [ ] 手工 curl 冒烟通过
- [ ] `go vet -vet=off ./...` 通过
- [ ] 已 commit（`align(T批次)任务名`）

阶段验收：跑全局契约测试 + 核心链路冒烟，更新 `docs/alignment/progress.md`。

## 3.6 源码索引（旧版 → 新版对照）

### 旧版 ServiceImpl（对齐参考）
| 域 | 旧版文件 | 行数 |
|---|---|---|
| 稿件 | `mybilibili-video-media/.../ManuscriptServiceImpl.java` | 1491 |
| 互动 | `mybilibili-content-interaction/.../VideoInteractionServiceImpl.java` | 836 |
| 评论 | `mybilibili-content-interaction/.../CommentServiceImpl.java` | 926 |
| 创作者统计 | `mybilibili-search-recommend/.../CreatorStatsServiceImpl.java` | 493 |
| 推荐 | `mybilibili-search-recommend/.../VideoRecommendServiceImpl.java` | 479 |
| 字幕 | `mybilibili-video-media/.../SubtitleServiceImpl.java` | 428 |
| 动态 | `mybilibili-content-interaction/.../DynamicServiceImpl.java` | 357 |
| 弹幕 | `mybilibili-content-interaction/.../DanmakuServiceImpl.java` | 346 |
| AI 客服 | `mybilibili-ai/.../CustomerServiceAiServiceImpl.java` | 294 |
| 消息 | `mybilibili-content-interaction/.../MessageServiceImpl.java` | 292 |
| 举报 | `mybilibili-content-interaction/.../ReportServiceImpl.java` | 292 |
| 搜索 | `mybilibili-search-recommend/.../VideoSearchServiceImpl.java` | 264 |
| 索引管理 | `mybilibili-search-recommend/.../ManuscriptIndexServiceImpl.java` | 244 |
| AI 字幕 | `mybilibili-ai/.../AiSubtitleServiceImpl.java` | 244 |
| 管理 | `mybilibili-account-social/.../AdminUserServiceImpl.java` | 208 |
| 观看历史 | `mybilibili-content-interaction/.../WatchHistoryServiceImpl.java` | 181 |
| 画像 | `mybilibili-content-interaction/.../UserProfileServiceImpl.java` | 146 |
| AI 总结 | `mybilibili-ai/.../AiSummaryServiceImpl.java` | 147 |
| 热词 | `mybilibili-search-recommend/.../HotSearchServiceImpl.java` | 132 |

### 新版待改文件
| 新版文件 | 负责批次 |
|---|---|
| `internal/admin/admin_manuscript_handler.go` | 批次1 |
| `internal/core/manuscript_http_handler.go` | 批次1 |
| `internal/core/interaction_*.go` | 批次2 |
| `internal/core/comment_*.go` | 批次2 |
| `internal/core/favorite_handler.go` | 批次2 |
| `internal/moderation/` | 批次2/4 |
| `internal/search/search_*.go` | 批次3 |
| `internal/profile/` | 批次3 |
| `internal/ai/` | 批次4 |
| `internal/core/http_handler.go` | 批次5 |
| `internal/social/` | 批次5 |
| `internal/core/message_handler.go` | 批次5 |
| `internal/live/` `internal/meeting/` | 批次5 |
| `internal/subtitle/` `internal/support/` `internal/analytics/` | 批次5 |
| `internal/admin/` | 批次5 |

## 3.7 基础设施策略（混合）

| 能力 | 做法 | 落地位置 |
|---|---|---|
| 缓存/会话/去重 | 真 Redis（容器化）或 `miniredis`，抽象 `CacheStore` 接口 | `internal/abstraction/` |
| 消息/异步事件 | 内存总线 `EventBus`（Go chan）+ 事件落 `*_events` 表；留 `Publisher` 接口 | `internal/core/event_publisher.go` |
| 搜索 | PG 全文检索 `tsvector`，封装 `SearchEngine` 接口 | `internal/search/` |
| 对象存储 | `StorageService` 接口，本地实现，可插 MinIO | `internal/abstraction/` |
| AI 模型 | 可配置 channel（DeepSeek/OpenAI 兼容），环境变量注入 key，无 key mock | `internal/ai/` |

## 3.8 里程碑

| 里程碑 | 内容 | 预计 |
|---|---|---|
| M0 | 底座+契约测试骨架 | 第1周 |
| M1 | 稿件生命周期对齐 | 第2-3周 |
| M2 | 互动/评论/收藏 | 第4周 |
| M3 | 搜索/推荐（含 for-you） | 第5-6周 |
| M4 | AI | 第7-8周 |
| M5 | 实时/社交/消息/管理长尾 | 第9周 |
| M6 | 全面回归+交付 | 第10周 |

## 3.9 风险应对

| 风险 | 应对 |
|---|---|
| 旧版依赖不可用（Redis/MQ/ES/MinIO/DeepSeek key） | 抽象层+mock 工厂；key 环境变量注入 |
| 状态机细节多漏分支 | 契约测试为护栏，逐方法对照 |
| 数据量小推荐差异无感 | 同一批种子数据输出对比 |
| AI key 缺失 | 可配置 channel 降级 |

---

# 一句话总结

> **旧版源码是王。任何一笔业务逻辑，先在旧版找到出处，填对照表，再写 Go，最后用契约测试锁死。没锁死就是没完成。**