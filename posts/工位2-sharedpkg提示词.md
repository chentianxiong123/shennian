---
title: '工位 2 提示词 — shared/pkg：abstraction 全量补齐 + auth/repository 提升'
date: 2026-09-17
---

# 工位 2 提示词 — shared/pkg：abstraction 全量补齐 + auth/repository 提升

你在 /home/a1/mybilibili 仓库，负责提升 shared/pkg（module mybilibili/pkg，go 1.26.5）的测试覆盖率。
本工位重点是把 `abstraction` 包补齐到 85%+，并把 auth、repository 提到 85%+。

## 目标任务

### 1. abstraction（当前 63.0%）→ 目标 85%+
目录：`/home/a1/mybilibili/shared/pkg/abstraction/`。
已有测试：discovery_memory_test.go、factory_test.go、stubs_test.go、file_queue_test.go、ollama_caller_test.go。
**未测的 11 个文件**：
- `minio_storage.go`（MinIO 存储网关）
- `nats_queue.go`（NATS 队列）
- `redis_cache.go`（Redis 缓存；`go test ./abstraction/... -cover` 会显示 redis 相关行未覆盖）
- `cache_store.go` / `document_store.go` / `message_queue.go`（接口 + 可能有内存/默认实现）
- `search_engine.go` / `service_caller.go` / `service_discovery.go`（抽象接口，可能有 grpc 实现）
- `pg_jsonb.go` / `storage_service.go`

**策略（按优先级）：**
1. **优先测接口约定 + 内存实现**：stubs.go 已提供 memory 实现，先测这些接口的契约行为。
2. **redis_cache**：用 `github.com/alicebob/miniredis/v2`（若不在依赖里，在 go.mod 加直接依赖并 `go mod tidy`）或注入 fake 客户端。
3. **nats_queue**：用 `github.com/nats-io/nats-server/v2` 内嵌 server 或 nats.go 的 ephemeral server。
4. **minio_storage**：若用 minio-go 具体类型且难 mock，可测其接口层分支（nil 检查、错误路径）；确属无法注入的，跳过并报告，不改生产代码加接口。
5. **pg_jsonb / storage_service / search_engine / service_caller / service_discovery**：读源码看是纯数据结构还是抽象声明；纯逻辑直接测，空接口可补契约性示例。

先看 `notimpl.go`、`stubs.go` 了解约定，再逐个文件确认哪些可直接测。

### 2. auth（70.3%）→ 目标 85%+
目录：`/home/a1/mybilibili/shared/pkg/auth/`，已有 jwt_test.go、middleware_test.go。
读 `jwt.go`、`middleware.go` 找未覆盖分支（无 token、过期 token、非法签名、错误 claim、header 缺失等），用 `go test -cover ./auth/` 定位。

### 3. repository（66.7%）→ 目标 85%+
目录：`/home/a1/mybilibili/shared/pkg/repository/`，有 metrics.go、nullutil.go。
已有 nullutil_test.go。读 `metrics.go` 补未覆盖分支。

## 技术要点
- 测试放同目录，命名 `xxx_test.go`；若依赖新库（miniredis、nats-server），先查 go.work.sum/go.mod，决定加直接依赖并跑 `cd /home/a1/mybilibili/shared/pkg && go mod tidy`（只允许加依赖，不乱动 go.mod 其他内容）。
- **绝不修改已有测试文件和生产代码**；编译错误确认为 bug 才最小修并报告。
- 每完成一个文件/子包立即验证：`cd /home/a1/mybilibili/shared/pkg && go test ./abstraction/...`（auth：`./auth/...`，repository：`./repository/...`）。
- 验收覆盖：`cd /home/a1/mybilibili/shared/pkg && go test ./abstraction/... ./auth/... ./repository/... -cover | grep coverage`
- 最终 `cd /home/a1/mybilibili/shared/pkg && go test ./...` 与 `go vet ./...` 必须通过。
- 注意：`pb/`（生成代码）与 `models/` 不要求测试，勿在这两个包浪费时间。

## 报告内容
- 每个子包覆盖率 before/after
- 新建测试文件清单
- 新增的依赖（如有）
- 遇到的问题与处理
- 不要 git commit/push。