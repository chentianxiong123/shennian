---
title: 'MyBilibili 技术选型最终决定'
date: 2026-08-05
---

# MyBilibili 技术选型最终决定

## 1. 选型原则

1. **弱设备可跑**：所有组件内存占用低，盒子/手机能运行
2. **CNCF 标准**：优先采用 CNCF 毕业/孵化项目
3. **云原生标准**：采用 K8s 生态验证过的组件
4. **跨语言**：Go + Java 都能接入
5. **可插拔**：每个组件可通过配置切换实现

## 2. 组件选型表

| 组件 | 决定 | 替代掉 | 原因 |
|------|------|--------|------|
| 服务发现/配置 | **etcd** | Nacos | K8s 底层就是 etcd，Raft 强一致，Go 实现 |
| 消息队列 | **NATS** | RocketMQ | CNCF 孵化项目，Go 单二进制 ~20MB，JetStream 持久化 |
| 缓存 | **Redis** | - | 保留，部署在老电脑，内存管够 |
| 主数据库 | **MySQL** | - | 保留，部署在老电脑，支付强一致 |
| 本地缓存 | **SQLite** | MongoDB | 盒子本地，零依赖，文件型 |
| 服务调用 | **gRPC** | Feign | CNCF 毕业项目，HTTP/2 + Protobuf，跨语言 |
| 网关 | **Traefik** | Spring Cloud Gateway | K8s Gateway API 官方实现，Go 单二进制 ~30MB |
| 对象存储 | **MinIO** | 自建文件 | 标准 S3 协议，可迁移云 OSS |
| 搜索 | **Bleve** | Elasticsearch | Go 嵌入式，盒子用 Bleve；电脑可用 ES（抽象兜底） |
| 任务调度 | **NATS JetStream** | XXL-Job | 复用 MQ 消费组 |
| 监控 | **Prometheus + Grafana** | - | CNCF 毕业项目，标准可观测性 |
| 日志 | **Loki** | ELK | CNCF 毕业项目，轻量，与 Prometheus 同一套标签 |
| 链路追踪 | **OpenTelemetry** | - | CNCF 毕业项目，标准遥测 API |

## 3. 各组件理由详述

### 3.1 etcd（服务发现/配置）

**为什么：**
- K8s/云原生事实标准，文档、生态、工具链成熟
- Go 实现，单二进制，几十 MB 内存
- Raft 协议，强一致，Leader 选举
- 天然支持 watch（配置热更新、服务变更通知）
- 支持租约（服务心跳 + 自动清理死实例）

**部署：** 老电脑单节点即可；需要高可用时 3 节点

### 3.2 NATS（消息队列）

**为什么不用 RocketMQ：**
- RocketMQ 需独立几百 MB 内存 + 专用服务器
- Java 应用，盒子跑不动

**为什么不用 Redis Stream：**
- Redis 内存有限，队列积压会挤占缓存空间
- 盒子 1GB RAM，Redis 既要缓存又要 MQ，两头不到岸

**为什么用 NATS：**
- CNCF 孵化项目，云原生标准
- Go 单二进制 ~20MB，盒子跑得动
- JetStream 持久化落盘，积压不占内存
- Queue Group 天然负载均衡
- 延迟亚毫秒级

**部署：** 老电脑单节点

### 3.3 Traefik（网关）

**为什么不用自写网关：**
- 自写网关需要维护路由/JWT/限流/服务发现等逻辑，成本高

**为什么用 Traefik：**
- K8s Gateway API 官方实现（55k stars，CNCF 项目）
- Go 单二进制 ~30MB，盒子跑得动
- 原生支持 gRPC 路由（h2c 协议）
- 直接对接 etcd 做服务发现
- 内置 JWT 认证、限流、熔断中间件，配置即用
- 自动 Let's Encrypt 证书管理

**部署：** 盒子1-2 做入口，多副本高可用

### 3.4 MySQL + SQLite 双库

**MySQL（主库 - 老电脑）：**
- 存储：用户、内容、订单、支付、对账
- 事务保障（支付/库存）
- 所有盒子通过内网读写

**SQLite（本地缓存 - 盒子）：**
- 每台盒子本地文件
- 存储：本地浏览历史、设置、断点缓存、离线数据
- 网络断开时兜底，恢复后同步

### 3.5 gRPC（服务调用）

**为什么不用 Feign：**
- Feign 绑定 Spring/Java，Go 服务无法调用
- HTTP/1.1 + JSON，性能一般

**为什么用 gRPC：**
- HTTP/2 多路复用，Protobuf 二进制序列化，性能高
- Go/Java 官方支持
- 自动生成客户端/服务端代码
- 流式调用（SSE 替代、大文件传输）

**实现细节：**
- 服务名 → 地址：对接 etcd
- 负载均衡：round-robin
- 超时重试：可配置

### 3.6 MinIO（对象存储）

**为什么：**
- S3 兼容 API，未来可无缝切云 OSS/S3
- 单二进制，几十 MB 内存
- 自带 Web 管理台
- 现有代码已有 MinioStorageService 实现

### 3.7 Bleve（搜索）

**为什么不用 ES：**
- ES 是 Java 应用，500MB+ 内存，盒子跑不动

**为什么用 Bleve：**
- 零部署，库级别集成进 search 服务
- 支持中文分词
- 内存占用几十 MB

**备选：** 企业级部署时可切 ES（SearchEngine 抽象）

### 3.8 可观测性（Prometheus + Loki + OpenTelemetry）

| 组件 | 职责 | 说明 |
|------|------|------|
| **Prometheus** | 指标采集 | CNCF 毕业，监控 CPU/内存/QPS/延迟 |
| **Grafana** | 可视化面板 | 设备总览、服务健康、请求量 |
| **Loki** | 日志聚合 | CNCF 毕业，轻量，与 Prometheus 同一套标签 |
| **OpenTelemetry** | 链路追踪 | CNCF 毕业，标准遥测 API，跨服务追踪 |

**部署：** 老电脑/主力机跑 Prometheus + Loki，盒子只暴露 metrics 端点

## 4. 语言选型

### 4.1 服务语言分配

| 服务 | 语言 | 原因 |
|------|------|------|
| gateway | **Traefik（配置即用）** | 不写代码，纯配置 |
| core | **Go** | 大量 CRUD + 缓存，Go 足够 |
| realtime | **Go** | WebSocket 高并发，goroutine 天然适配 |
| search | **Go** | Bleve 是 Go 库，天然集成 |
| ads | **Go** | 简单计数/计费，Go 足够 |
| media | **Java (GraalVM)** | FFmpeg/Whisper 子进程 + AI 集成，Java 生态 |
| store | **Java (GraalVM)** | 支付事务、Spring 生态成熟 |

### 4.2 为什么混合语言

| 语言 | 优势 | 劣势 |
|------|------|------|
| Go | 单二进制、内存小、并发强、编译快 | 生态不如 Java 成熟（支付/安全库） |
| Java | 生态全（支付/安全/AI）、成熟 | 启动慢、内存大（GraalVM 缓解） |

**策略：** 在线轻量服务用 Go（跑盒子），复杂业务用 Java GraalVM（跑电脑）。

### 4.3 GraalVM 注意事项

- Lombok 反射需要 `reflect-config.json`
- 动态代理需要 `proxy-config.json`
- FFmpeg/Whisper 用**子进程**调用，避免 JNI 反射配置
- Spring Boot 3 + GraalVM 支持良好（AOT）

## 5. 中间件汇总（最终清单）

| 组件 | 版本/类型 | 部署位置 | 内存 |
|------|-----------|----------|------|
| etcd | v3.x | 老电脑 | ~50MB |
| Redis | 7.x | 老电脑 | ~100MB |
| MySQL | 8.x | 老电脑 | ~200MB |
| NATS | 2.x | 老电脑 | ~20MB |
| MinIO | latest | 主力机 | ~100MB |
| SQLite | 嵌入式 | 每台设备 | 0（文件） |
| Bleve | Go 库 | search 服务内 | ~50MB |
| SRS | v6 | 主力机/盒子 | ~50MB |
| Traefik | v3 | 盒子入口 | ~30MB |
| Prometheus | latest | 老电脑/主力机 | ~100MB |
| Loki | latest | 老电脑/主力机 | ~50MB |

**全部基础设施内存合计：老电脑 ~520MB，盒子 ~230MB（含业务），1GB 盒子无压力。**

## 6. 对比总结（旧 vs 新）

| 维度 | 旧（Spring Cloud Alibaba） | 新（云原生标准） |
|------|---------------------------|------------------|
| 服务发现 | Nacos（几百 MB） | etcd（几十 MB） |
| 消息队列 | RocketMQ（几百 MB） | NATS（几十 MB，CNCF 孵化） |
| 搜索 | ES（500MB+） | Bleve（几十 MB，可切 ES） |
| 文档库 | MongoDB（几百 MB） | SQLite（0） |
| 服务调用 | Feign（Java only） | gRPC（跨语言，CNCF 毕业） |
| 网关 | Spring Cloud Gateway | Traefik（K8s Gateway API 实现） |
| 语言 | Java 全栈 | Go + Java GraalVM |
| 内存合计 | 2GB+ | 老电脑 ~520MB，盒子 ~230MB |
| 弱设备 | 不可行 | 可行 |
| 云迁移 | 绑定阿里云 | 标准云原生，可上 K8s |

## 7. 结论

1. **核心思路：CNCF 标准优先**，Nacos→etcd，RocketMQ→NATS，Feign→gRPC，SC Gateway→Traefik
2. **Redis 只做缓存**：不再当 MQ 用，避免两头不到岸
3. **Go 优先**：在线服务全 Go，Java 只留给需要生态的 media/store
4. **抽象兜底**：所有组件通过抽象层（03 文档）可切换，不锁死
5. **可观测性标配**：Prometheus + Loki + OpenTelemetry
6. **可上云**：架构符合 K8s 标准，未来迁云只换配置