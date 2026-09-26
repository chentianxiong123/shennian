---
title: 'MyBilibili 重构：职责划分与技术选型'
date: 2026-08-05
---

# MyBilibili 重构：职责划分与技术选型

## 1. 背景与动机

### 1.1 当前架构

当前 MyBilibili 微服务版本基于 Spring Cloud Alibaba 构建：

| 组件 | 用途 | 问题 |
|------|------|------|
| Nacos | 服务发现 + 配置管理 | Java 实现，重量级，需要独立服务器 |
| RocketMQ | 消息队列 | Java 实现，重量级，需要独立服务器 |
| MySQL | 关系数据库 | 需要独立服务器 |
| Redis | 缓存 | 需要独立服务器 |
| MongoDB | 文档存储 | 需要独立服务器 |
| Elasticsearch | 搜索引擎 | Java 实现，重量级，需要独立服务器 |
| Feign | 服务间调用 | Spring 生态绑定 |

### 1.2 问题

1. **重量级组件**：Nacos、RocketMQ、ES 都是 Java 应用，内存占用大，不适合弱设备
2. **生态锁定**：Spring Cloud Alibaba 绑定 Java 生态，无法使用 Go 等轻量语言
3. **资源浪费**：为百万级并发设计的组件，用来处理几千几万的量级
4. **部署限制**：无法部署在 Android 盒子、老电脑等弱设备上

### 1.3 目标

1. **云原生标准**：CNCF 项目优先，K8s 生态对齐
2. **轻量化**：所有组件都可以在弱设备上运行
3. **可插拔**：抽象基础设施层，支持多种实现
4. **二进制化**：Go 原生二进制 + Java GraalVM Native Image
5. **双模式**：支持嵌入式部署（盒子）和企业级部署（云服务器）

---

## 2. 服务职责划分

### 2.1 设计原则

1. **按资源需求分**：不同资源需求的服务分开部署
2. **职责单一**：每个服务只做一件事
3. **语言适配**：轻量服务用 Go，复杂业务用 Java
4. **独立部署**：每个服务可以独立启动、停止、扩容

### 2.2 服务列表（7个服务）

| 服务 | 语言 | 职责 | 资源需求 |
|------|------|------|----------|
| **gateway** | Traefik（配置） | 路由、认证、限流、证书 | 低 CPU、低内存 |
| **core** | Go | 用户、关注、内容 CRUD、评论、点赞、收藏、分享 | 低 CPU、低内存 |
| **realtime** | Go | 弹幕、消息、通知（WebSocket） | 低 CPU、中内存、高网络 |
| **search** | Go | 搜索、推荐、热榜、数据分析 | 中 CPU、高内存 |
| **media** | Java | 视频转码、直播、AI 字幕（Whisper）、AI 总结（DeepSeek） | 高 CPU、高内存 |
| **ads** | Go | 广告投放、展示计费、点击计费 | 低 CPU、低内存 |
| **store** | Java | 商城、虚拟商品、订单、支付、退款、对账 | 低 CPU、低内存 |

### 2.3 分类说明

**在线轻量服务（Go）：**
- core、realtime、search、ads
- 资源占用低，可以部署在 Android 盒子上
- Go 原生二进制，启动快，内存小

**网关（Traefik）：**
- 不写代码，纯配置
- Go 单二进制，~30MB 内存
- K8s Gateway API 标准实现

**业务复杂服务（Java）：**
- store
- 支付链路需要事务保证
- Spring 生态对支付、安全支持更好
- GraalVM 编译成二进制，不需要 JVM

**批处理服务（Java）：**
- media
- 视频转码、AI 处理需要 CPU/GPU
- FFmpeg/Whisper 用子进程调用
- GraalVM 编译成二进制

**搜索服务（Go）：**
- search
- 用 Bleve（Go 实现）替代 Elasticsearch
- 内存占用从 500MB 降到 50MB

---

## 3. 技术选型

### 3.1 网关：Traefik vs Spring Cloud Gateway

| 指标 | Traefik | Spring Cloud Gateway |
|------|---------|---------------------|
| 语言 | Go | Java |
| 内存占用 | ~30MB | ~200MB |
| 配置方式 | YAML 配置 | 代码/配置 |
| gRPC 支持 | 原生（h2c） | 不原生 |
| etcd 集成 | 原生 | 需插件 |
| JWT 认证 | 内置中间件 | 需代码 |
| 自动证书 | Let's Encrypt 内置 | 需 Nginx 配合 |
| K8s 标准 | Gateway API 官方实现 | 非标准 |

**选择 Traefik：**
- K8s Gateway API 标准实现，55k stars
- Go 单二进制，盒子跑得动
- 配置即用，不写代码

### 3.2 消息队列：NATS vs RocketMQ

| 指标 | NATS | RocketMQ |
|------|------|----------|
| 语言 | Go | Java |
| 内存占用 | ~20MB | 几百 MB |
| 吞吐量 | 百万级/秒 | 十万级/秒 |
| 延迟 | 亚毫秒级 | 毫秒级 |
| 持久化 | JetStream 落盘 | 磁盘 |
| CNCF 标准 | 孵化项目 | 非 CNCF |
| 部署复杂度 | 单文件 ~20MB | 需要独立服务器 |

**选择 NATS：**
- CNCF 孵化项目，云原生标准
- 盒子友好，20MB 内存
- JetStream 持久化，积压不占内存

### 3.3 缓存：Redis

| 指标 | Redis |
|------|-------|
| 语言 | C |
| 类型 | 独立服务器 |
| 内存占用 | ~100MB（老电脑，管够） |
| 持久化 | RDB/AOF |

**选择策略：**
- 老电脑部署，内存管够
- 只做缓存/锁/计数，不做 MQ
- 盒子无状态，读远端 Redis

### 3.4 搜索引擎：Bleve vs Elasticsearch

| 指标 | Bleve | Elasticsearch |
|------|-------|---------------|
| 语言 | Go | Java |
| 类型 | 嵌入式 | 独立服务器 |
| 内存占用 | 几十 MB | 几百 MB |
| 功能 | 基础搜索 | 全文搜索、聚合、分析 |
| 部署复杂度 | 无（库） | 需要独立服务器 |

**选择策略：**
- 盒子部署：Bleve（零依赖，嵌入 search 服务）
- 企业级部署：Elasticsearch（功能更全，通过 SearchEngine 抽象切换）

### 3.5 文档存储：SQLite vs MongoDB

| 指标 | SQLite | MongoDB |
|------|--------|---------|
| 类型 | 嵌入式 | 独立服务器 |
| 内存占用 | 几 MB | 几百 MB |
| 部署复杂度 | 无（文件） | 需要独立服务器 |

**选择策略：**
- 盒子本地缓存：SQLite（零依赖，文件型）
- 主库：MySQL（老电脑）

### 3.6 服务间通信：gRPC vs Feign

| 指标 | gRPC | Feign |
|------|------|-------|
| 协议 | HTTP/2 | HTTP/1.1 |
| 序列化 | Protobuf | JSON |
| 跨语言 | 支持 | Java Only |
| 性能 | 高 | 中 |
| CNCF 标准 | 毕业项目 | 非 CNCF |

**选择 gRPC：**
- CNCF 毕业项目，云原生标准
- Go 和 Java 都支持
- 性能更高（Protobuf 序列化）
- 跨语言通信标准

### 3.7 可观测性

| 组件 | 职责 | 标准 |
|------|------|------|
| Prometheus | 指标采集 | CNCF 毕业 |
| Grafana | 可视化面板 | 事实标准 |
| Loki | 日志聚合 | CNCF 毕业 |
| OpenTelemetry | 链路追踪 | CNCF 毕业 |

---

## 4. 抽象基础设施层

### 4.1 设计原则

1. **接口定义**：每个基础设施组件定义标准接口
2. **多实现**：每个接口有多个实现（嵌入式/企业级）
3. **配置驱动**：通过配置文件选择实现
4. **运行时切换**：改配置就能切换实现，不用改代码

### 4.2 接口定义

| 接口 | 职责 | 嵌入式实现 | 企业级实现 |
|------|------|-----------|-----------|
| ServiceDiscovery | 服务注册/发现 | 文件配置 | etcd / Nacos / Consul |
| MessageQueue | 消息发布/订阅 | NATS / 内存 | Kafka / RocketMQ |
| CacheStore | 缓存读写 | 本地内存 | Redis |
| SearchEngine | 索引/搜索 | Bleve / SQLite FTS | Elasticsearch |
| DocumentStore | 文档存储 | SQLite | MongoDB |
| StorageService | 文件上传/下载 | 本地文件系统 | MinIO / S3 / OSS |

### 4.3 配置示例

```yaml
infrastructure:
  servicediscovery:
    type: etcd      # etcd / nacos / file
    endpoint: http://localhost:2379
  messagequeue:
    type: nats      # nats / kafka / rocketmq / memory
    url: nats://localhost:4222
  cachestore:
    type: redis     # redis / memory
    endpoint: localhost:6379
  searchengine:
    type: bleve     # bleve / elasticsearch
    indexpath: /var/data/search.bleve
  documentstore:
    type: sqlite    # sqlite / mongodb
    path: /var/data/app.db
  storageservice:
    type: minio     # local / minio / oss
    endpoint: http://localhost:9000
```

---

## 5. 二进制化策略

### 5.1 Go 服务

- 天然编译成原生二进制
- 交叉编译：`GOOS=linux GOARCH=arm64 go build`
- 无运行时依赖，单文件部署

### 5.2 Java 服务

- 使用 GraalVM Native Image 编译
- 启动时间：毫秒级（vs JVM 秒级）
- 内存占用：几十 MB（vs JVM 几百 MB）
- 无 JVM 依赖，单文件部署

### 5.3 FFmpeg/Whisper

- 使用子进程调用（ProcessBuilder / exec.Command）
- 不使用 JNI，避免反射配置问题
- FFmpeg/Whisper 本身是原生二进制
- Java/Go 只是"指挥"它们工作

---

## 6. 部署策略

### 6.1 按设备能力分配

| 设备类型 | 适合的服务 | 原因 |
|----------|-----------|------|
| Android 盒子（1GB RAM） | Traefik + core + realtime + ads | 轻量，无状态，可扩缩 |
| 老电脑（2-4GB RAM） | MySQL + Redis + etcd + NATS | 有状态基础设施 |
| 主力机 | media + store + MinIO | 需要 CPU 算力和存储 |

### 6.2 集群管理

- 老电脑集中管理数据，盒子只跑业务
- 业务服务无状态，任意盒子可扩缩
- 支付/订单强一致链路走 MySQL 事务
- 网关多副本（Traefik）高可用

### 6.3 扩容策略

| 场景 | 方案 |
|------|------|
| 流量增大 | 加 Traefik 实例 / 加 core 实例 |
| 转码慢 | 加 media worker，NATS 队列分发 |
| 搜索慢 | 加 search 实例，Bleve 分片 |
| WebSocket 连接多 | 加 realtime 实例，NATS 广播 |

---

## 7. 最终架构

```
用户请求 → 公网
    ↓
Traefik 网关（盒子1-2，多副本高可用）
    ├── JWT 认证（内置中间件）
    ├── 限流（内置中间件）
    ├── 自动证书（Let's Encrypt）
    └── gRPC 路由转发
            ↓
    ┌───────┼───────┐
    ▼       ▼       ▼
  core   realtime  ads
  (Go)   (Go)      (Go)
    │       │       │
    └───┬───┘       │
        │           │
        ▼           ▼
    ┌───────┐   ┌───────┐
    │ 老电脑 │   │ 主力机 │
    │ MySQL  │   │ media │
    │ Redis  │   │ store │
    │ etcd   │   │ MinIO │
    │ NATS   │   │       │
    └───────┘   └───────┘
```

---

## 8. 技术栈汇总

| 层 | 组件 | 标准 | 部署位置 |
|----|------|------|----------|
| 网关 | Traefik | K8s Gateway API 实现 | 盒子 |
| 服务发现 | etcd | K8s 底层 | 老电脑 |
| RPC | gRPC | CNCF 毕业 | 服务间 |
| 消息队列 | NATS | CNCF 孵化 | 老电脑 |
| 缓存 | Redis | 事实标准 | 老电脑 |
| 主库 | MySQL | 事实标准 | 老电脑 |
| 本地库 | SQLite | 嵌入式 | 盒子 |
| 搜索 | Bleve | Go 嵌入式 | search 服务内 |
| 存储 | MinIO | S3 兼容 | 主力机 |
| 监控 | Prometheus | CNCF 毕业 | 老电脑/主力机 |
| 日志 | Loki | CNCF 毕业 | 老电脑/主力机 |
| 追踪 | OpenTelemetry | CNCF 毕业 | 全链路 |

---

## 9. 总结

1. **CNCF 标准优先**：etcd / gRPC / NATS / Prometheus / Loki / OpenTelemetry
2. **K8s 生态对齐**：Traefik（Gateway API）
3. **数据集中**：MySQL + Redis + etcd 放老电脑，好管
4. **业务无状态**：盒子随便扩缩，挂了换一个
5. **抽象接口**：所有组件可切换，不锁死
6. **二进制化**：Go 原生 + Java GraalVM
7. **双模式部署**：盒子（轻量）和云（企业级）都能跑