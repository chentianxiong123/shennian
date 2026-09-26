---
title: 'mybilibili-go 执行计划'
date: 2026-08-14
---

# mybilibili-go 执行计划

> 项目位置：`/tmp/mybilibili/mybilibili-go`
> 微服务版（对照）：`/tmp/mybilibili-cloud`
> 前端 Web：`/tmp/mybilibili/mybilibili-web-ts`
> 前端 App：`/tmp/mybilibili/mybilibili-app-flutter`

## 当前状态

| 维度 | 状态 |
|------|------|
| go build | ✅ 通过 |
| 核心 318 方法对齐 | ✅ 全部完成，非 AI 域零缺口 |
| 与微服务版对比 | ✅ 所有 REST 端点均已覆盖 |
| 新增补齐 | ✅ `/api/v1/interaction/*` 通用点赞 6 端点 |
| AI 后端 | ✅ Ollama caller 接入，环境变量 `OLLAMA_URL` `OLLAMA_MODEL` |
| 可一键运行 | ❌ 无 docker-compose |
| 文档 | ✅ 桌面这份 |

---

## 微服务版对比结论

逐文件对比 Java 全部 62 个 Controller，**Go 版已覆盖所有路由前缀**，仅缺：

| 缺的 | 状态 | 说明 |
|------|------|------|
| `/api/v1/interaction/*` 6 端点 | ✅ 刚补上 | 通用点赞/取消/状态/批量查询 |
| docker-compose / Dockerfile | ❌ | 下一步做 |
| 种子数据 | ❌ | 下一步做 |

其他如 Banner/推荐配置/分片上传/存储迁移/音频提取/AI用量/连麦/会议室，**Go 版全有**。

---

## 下一步：一键跑通（P0）

### 1. Go 后端 Dockerfile
文件：`/tmp/mybilibili/mybilibili-go/Dockerfile`
```dockerfile
FROM golang:1.26-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /core ./cmd/core && \
    CGO_ENABLED=0 go build -o /media ./cmd/media

FROM alpine:3.19
RUN apk add --no-cache ffmpeg ca-certificates tzdata
COPY --from=builder /core /usr/local/bin/core
COPY --from=builder /media /usr/local/bin/media
EXPOSE 8080
CMD ["core"]
```

### 2. docker-compose.yml
文件：`/tmp/mybilibili/mybilibili-go/docker-compose.yml`
```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_DB: mybilibili
      POSTGRES_USER: mybilibili
      POSTGRES_PASSWORD: mybilibili
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./sql:/docker-entrypoint-initdb.d
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U mybilibili"]
      interval: 5s

  backend:
    build: .
    ports:
      - "8080:8080"
    environment:
      PG_DSN: postgres://mybilibili:mybilibili@postgres:5432/mybilibili?sslmode=disable
      OLLAMA_URL: http://ollama:11434
      JWT_SECRET: change-me-in-production
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  pgdata:
```

### 3. 种子数据
文件：`/tmp/mybilibili/mybilibili-go/sql/900_seed.sql`
```sql
INSERT INTO categories (id, name, parent_id, sort_order) VALUES
(1, '动画', 0, 1), (2, '音乐', 0, 2), (3, '游戏', 0, 3),
(4, '知识', 0, 4), (5, '科技', 0, 5), (6, '生活', 0, 6)
ON CONFLICT DO NOTHING;
```

### 4. 验收
```bash
docker compose up -d
sleep 10
curl http://localhost:8080/api/v1/health
# → {"status":"ok","db":true}
curl http://localhost:8080/api/v1/category
# → 返回分类列表
```

---

## 快速索引

```bash
cd /tmp/mybilibili/mybilibili-go
go build ./...                           # 编译检查
go test ./... -run Contract -vet=off     # 跑契约测试

# 查看进度
git log --oneline --graph | head -20
cat docs/decisions/02-对齐成果总结.md
```