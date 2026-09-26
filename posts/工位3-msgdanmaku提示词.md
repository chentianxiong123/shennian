---
title: '工位 3 提示词 — msg-danmaku：message 包提升 + danmaku 补洞'
date: 2026-09-17
---

# 工位 3 提示词 — msg-danmaku：message 包提升 + danmaku 补洞

你在 /home/a1/mybilibili 仓库，负责提升 services/msg-danmaku（module mybilibili/msg-danmaku，go 1.26.5）的测试覆盖率。
本工位重点是把 `internal/message` 从 67% 提到 80%+，并检查 `internal/danmaku`（88.7%）的明显漏洞。

## 目标任务

### 1. internal/message（当前 67.0%）→ 目标 80%+
目录：`/home/a1/mybilibili/services/msg-danmaku/internal/message/`，文件：
- `message_handler.go`（HTTP/ws handler）
- `message_repository.go`（DB，go-sqlmock）
- `grpc_server.go`（grpc 服务端，可用 bufconn 或直接构造 server 调 handler）
- `unread_cache.go`（redis 缓存，用 miniredis 或接口 stub）
- 已有 `handler_test.go`，**不要修改它**，只补缺口。

先读这些源文件 + 已有测试，用 `go test -cover ./internal/message/` 找出未覆盖函数/分支：
- repository 的未覆盖 SQL 方法（go-sqlmock）
- handler 的未测路由/参数校验分支（httptest）
- grpc server 的方法（构造 grpc.Server 注册后，用 client 调用；或直接调业务方法）
- unread_cache 的 get/set/incr/过期分支

### 2. internal/danmaku（88.7%）→ 检查明显漏洞
目录：`/home/a1/mybilibili/services/msg-danmaku/internal/danmaku/`。
用 `go test -cover ./internal/danmaku/` 看是否有明显的未覆盖关键函数（弹幕核心逻辑、持久化、发送流程）。若覆盖良好则报告"无需补充"，**不要为了凑数乱加测试**。

## 技术要点
- msg-danmaku go.mod 已有 go-sqlmock + testify 直接依赖。
- 测试放同目录，命名 `xxx_test.go`。
- **绝不修改已有测试文件和生产代码**；编译错误确认为 bug 才最小修并报告。
- 每完成一个子包验证：`cd /home/a1/mybilibili/services/msg-danmaku && go test ./internal/message/...`
- 验收覆盖：`cd /home/a1/mybilibili/services/msg-danmaku && go test ./internal/message/... ./internal/danmaku/... -cover | grep coverage`
- 最终 `cd /home/a1/mybilibili/services/msg-danmaku && go test ./...` 与 `go vet ./...` 必须通过。
- 若需要 miniredis/nats-server 等依赖，先查 go.mod/go.sum，允许加直接依赖并 `go mod tidy`。

## 报告内容
- 每个子包覆盖率 before/after
- 新建测试文件清单
- 遇到的问题与处理
- 不要 git commit/push。