---
title: '工位 1 提示词 — core 模块：消灭 0% 覆盖包子包'
date: 2026-09-17
---

# 工位 1 提示词 — core 模块：消灭 0% 覆盖包子包

你在 /home/a1/mybilibili 仓库，负责提升 services/core 模块（module mybilibili/core，go 1.26.5）的测试覆盖率。
本工位目标是消灭 0% 子包并提升残余缺口。

## 目标任务（按优先级）

### 1. internal/clients（当前 0.0%）→ 目标 60%+
目录：`/home/a1/mybilibili/services/core/internal/clients/`，4 个文件：
- `ai_client.go`（调 ai 服务的 grpc/http client）
- `msg_danmaku_client.go`（调 msg-danmaku 服务）
- `profile_recorder.go`（画像记录）
- `search_client.go`（调 search 服务）
先读这些文件，弄清它们调用外部服务的方式（grpc client？http？）。用 fake/stub 或 httptest 构造响应来测成功/失败/超时/错误码分支。若构造了具体 grpc client 导致难 mock，报告说明即可，不要为测试改生产代码加接口。

### 2. internal/coreapi（当前 0.0%）→ 目标 70%+
文件：`/home/a1/mybilibili/services/core/internal/coreapi/http_handler.go`。
这是核心 HTTP API 层。读源码找到所有 handler 函数（grep "func.*Handler"），用 httptest + http.NewServeMux 注册后发请求。若依赖 DB/外部服务，用 go-sqlmock 注入 `*sql.DB`（注意 lib/pq 的 `id = ANY($1)` 数组参数需要 `sqlmock.ValueConverterOption` 自定义 converter 把 `[]int64` 转 `"{1,2}"` 字符串，`WithArgs("{1,2}")` 匹配）。

### 3. internal/manuscript（当前 0.0%）→ 目标 60%+
目录：`/home/a1/mybilibili/services/core/internal/manuscript/`，7 个文件：
- `admin_handler.go`、`manuscript_handler.go`、`manuscript_http_handler.go`、`video_process_admin_handler.go`（HTTP handler，用 httptest）
- `manuscript_service.go`（业务逻辑，注入 fake repository）
- `manuscript_repository.go`（DB，用 go-sqlmock）
- `event_writer.go`（事件写入，用 fake notifier/publisher 接口或直接调用内存实现）
先读源码确定结构（构造函数/依赖注入方式）再写测试。

### 4. internal/support（63.4%）→ 目标 75%
已有 `support_handler_test.go`。读 `support_handler.go` + `support_repository.go` 找未覆盖分支（go-sqlmock 补 DB 方法，handler 补未测路由）。

### 5. internal/social（57.0%）→ 目标 75%
已有 follow/interaction/dynamic 等多文件测试。只补缺口：用 `go test -cover ./internal/social/` 找出未覆盖函数，针对性补（不要重写已有测试，不要动已有测试文件）。

## 技术要点
- go-sqlmock v1.5.2 + testify 已是 core 直接依赖（go.mod 已含）。
- 测试文件放同目录，命名 `xxx_test.go`。
- **绝不修改已有测试文件**，也尽量不改生产代码；遇到编译错误且确定是 bug 才最小修改并在报告说明。
- 每完成一个子包立刻验证：`cd /home/a1/mybilibili/services/core && go test ./internal/<pkg>/...`
- 验收覆盖用：`cd /home/a1/mybilibili/services/core && go test ./internal/<pkg>/... -cover | grep coverage`
- 最终 `cd /home/a1/mybilibili/services/core && go test ./...` 与 `go vet ./...` 必须通过。

## 报告内容
- 每个子包覆盖率 before/after
- 新建测试文件清单
- 遇到的问题与处理（尤其难 mock 的地方）
- 不要 git commit/push。
