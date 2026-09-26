---
title: 'Go 后端测试派发计划（第二轮）'
date: 2026-09-17
---

# Go 后端测试派发计划（第二轮）

> 目标：消灭 0% 覆盖率的子包，把全部业务子包推到 75%+
> 日期：2026-09-17

## 一、覆盖率基线（按包粒度，2026-09-17 实测）

**注意：** `go test ./...` 的整体百分比会被 `cmd/`（main 入口，无测试）和生成代码（`pb/` 9500 行）稀释，
本计划一律按**子包粒度**统计与验收。

| 模块 | 子包 | 当前覆盖 | 目标 | 备注 |
|------|------|----------|------|------|
| shared/pkg | abstraction | 63.0% | 85%+ | 11 个文件未测（见下） |
| shared/pkg | auth | 70.3% | 85%+ | jwt/middleware |
| shared/pkg | repository | 66.7% | 85%+ | metrics.go |
| core | internal/clients | **0.0%** | 60%+ | ai_client / msg_danmaku_client / profile_recorder / search_client |
| core | internal/coreapi | **0.0%** | 70%+ | http_handler.go |
| core | internal/manuscript | **0.0%** | 60%+ | 7 个文件（repo/service/handler/event） |
| core | internal/social | 57.0% | 75%+ | 已有多文件测试，补残余分支 |
| core | internal/support | 63.4% | 75%+ | support_handler / support_repository |
| msg-danmaku | internal/message | 67.0% | 80%+ | grpc_server / message_repository / unread_cache |
| 其余 | studio/work/live/search/ai/bili-proxy | 80%+ | 达标 | 不动 |

## 二、工位派发

### 工位 1：core 模块 — 消灭 0% 包
- `internal/clients`（ai_client / msg_danmaku_client / profile_recorder / search_client）
- `internal/coreapi`（http_handler.go）
- `internal/manuscript`（admin_handler / event_writer / manuscript_handler / manuscript_http_handler / manuscript_repository / manuscript_service / video_process_admin_handler）
- 顺带：`internal/support` 63.4%→75%，`internal/social` 57%→75%（只补缺口，不重写已有测试）

### 工位 2：shared/pkg — abstraction 全量补齐
- `abstraction` 未测的 11 个文件：
  - `minio_storage.go`（MinIO 存储）
  - `nats_queue.go`（NATS 队列，用 NATS 内存 server 或 nats.go 的 test server）
  - `redis_cache.go`（redis，用 miniredis 或接口 stub）
  - `cache_store.go` / `document_store.go` / `message_queue.go`（接口与内存实现）
  - `search_engine.go` / `service_caller.go` / `service_discovery.go`（grpc/服务发现，用 fake/stub）
  - `pg_jsonb.go` / `storage_service.go`
- `auth` 70.3%→85%（jwt 剩余分支、middleware 错误路径）
- `repository` 66.7%→85%（metrics.go）

### 工位 3：msg-danmaku + 残余提升
- `internal/message` 67%→80%（grpc_server / message_repository 的未覆盖 SQL 分支 / unread_cache）
- 顺带清理：检查 `internal/danmaku` 88.7% 是否有明显洞

## 三、通用技术要求

1. **不修改任何已有测试文件与生产代码**（`.go` 非 `_test.go`），只新建 `xxx_test.go`；
   除非遇到编译错误且确认为 bug，才最小修改并报告。
2. mock 手段优先级：优先接口注入 / 内存实现（abstraction 已有 stubs.go）→ 其次
   `go-sqlmock`（DB）→ 再次 miniredis（redis）、nats test server（NATS）、httptest（HTTP client）。
3. 用 `testify/assert` + `require`。
4. 每个文件写完立刻跑该包测试：
   - 工位 1：`cd /home/a1/mybilibili/services/core && go test ./internal/clients/... ./internal/coreapi/... ./internal/manuscript/...`
   - 工位 2：`cd /home/a1/mybilibili/shared/pkg && go test ./abstraction/... ./auth/... ./repository/...`
   - 工位 3：`cd /home/a1/mybilibili/services/msg-danmaku && go test ./internal/message/...`
5. 验收覆盖：`go test ./<子包>/... -cover | grep coverage`
6. **不要执行 `go mod tidy` 改动 go.mod 之外的依赖**；如缺依赖先查 go.work.sum 是否存在，再加为直接依赖（加进对应 go.mod 的 require 块）。
7. **不要 git commit/push**。

## 四、验收

各工位完成时报告：
- 每个目标子包覆盖 before/after
- 新建测试文件清单
- 相关 `go test ./...`（含 go vet）通过
- 遇到的问题与处理

全量回归（在 /home/a1/mybilibili 下）：
```bash
for d in shared/pkg services/core services/search services/ai services/live services/msg-danmaku services/studio services/work services/bili-proxy; do
  cd $d && go test ./... && cd ../..
done
```
