---
title: 'MyBilibili 企业级部署方案'
date: 2026-08-05
---

# MyBilibili 企业级部署方案

## 1. 目标

在无云服务器、只有本地 12 台设备的环境下，构建一个**接近企业级**的部署体系，同时保持方案可迁移到真实云环境。

**硬件清单：**
- 4 台 Android 盒子（1GB RAM，eMMC/SD，Arm）
- 6 台手机（Android，可 Linux 化）
- 2 台电脑（1 台 AMD 主力机做 media 转码）

## 2. 部署原则

- **老电脑**：跑有状态基础设施（MySQL / Redis / etcd / NATS / MinIO）
- **盒子**：跑无状态业务（gateway/core/realtime/ads），挂了换一个
- **主力机**：跑重业务（media/store），需要 CPU 算力
- **手机**：跑冗余/冷备（realtime/search 副本）

## 3. 服务到设备分配

### 3.1 分配原则

1. 老电脑集中管理数据，盒子只跑业务
2. 业务服务无状态，任意盒子可扩缩
3. 支付/订单强一致链路走 MySQL 事务
4. 网关多副本（Traefik）高可用

### 3.2 分配表

| 设备 | 资源 | 运行服务 | 说明 |
|------|------|----------|------|
| 盒子1（1GB） | arm64 | Traefik（入口） | 网关，暴露公网 |
| 盒子2（1GB） | arm64 | Traefik + ads | 网关冗余 |
| 盒子3（1GB） | arm64 | core ×1 | 核心业务 |
| 盒子4（1GB） | arm64 | core ×1 + realtime | 互动 |
| 手机1-3 | arm64 | realtime ×3 | WS 长连接分摊 |
| 手机4-6 | arm64 | search ×3 | 搜索分片 |
| 老电脑（2-4GB） | amd64 | MySQL + Redis + etcd + NATS | 基础设施 |
| 主力机（8GB+） | amd64 | media + store + MinIO | 重业务/存储 |
| 备用电脑 | amd64 | admin-web + 监控 | 管理/可观测性 |

### 3.3 数据流

```
用户请求 → Traefik（盒子入口）
    → JWT 认证 / 限流
    → gRPC 转发 → core/realtime/ads（盒子业务）
        → MySQL/Redis/NATS（老电脑基础设施）
            → 支付走 MySQL 强一致事务
            → 评论/点赞/弹幕走 NATS 最终一致
            → 缓存走 Redis
```

## 4. 基础设施部署

### 4.1 MySQL（老电脑）

```
docker run -d --name mysql \
  -e MYSQL_ROOT_PASSWORD=xxx \
  -p 3306:3306 \
  -v /data/mysql:/var/lib/mysql \
  mysql:8.0
```

- 主数据库：用户、内容、订单、支付
- 支付事务：强一致 ACID
- 盒子业务直连 MySQL（内网低延迟）

### 4.2 Redis（老电脑）

```
docker run -d --name redis -p 6379:6379 -v /data/redis:/data redis:7
```

用途：
- 缓存（CacheStore）
- 分布式锁
- 会话存储（无状态化关键）
- 限流计数

### 4.3 etcd（老电脑）

```
etcd --listen-client-urls http://0.0.0.0:2379 \
     --advertise-client-urls http://192.168.31.xxx:2379
```

- 服务发现
- 配置中心（集中管理所有服务配置）

### 4.4 NATS（老电脑）

```
docker run -d --name nats -p 4222:4222 nats:latest --jetstream
```

- 消息队列
- 任务分发
- 弹幕/通知广播
- JetStream 持久化，积压不占内存

### 4.5 MinIO（主力机）

```
docker run -d --name minio \
  -p 9000:9000 -p 9001:9001 \
  -v /data/minio:/data \
  minio/minio server /data --console-address ":9001"
```

- 视频文件、封面、头像对象存储

### 4.6 Traefik（盒子）

```
docker run -d --name traefik \
  -p 80:80 -p 443:443 \
  -v /etc/traefik/traefik.yml:/etc/traefik/traefik.yml \
  traefik:latest
```

- 网关入口（暴露公网）
- HTTP → gRPC 转换
- JWT 认证中间件
- 限流中间件
- 自动 Let's Encrypt 证书

### 4.7 其他

- **SRS**：直播流服务器（主力机或盒子），`srs.conf` 已有
- **Prometheus**：指标采集（老电脑/主力机）
- **Grafana**：可视化面板（老电脑/主力机）
- **Loki**：日志聚合（老电脑/主力机）

## 5. 设备 Agent 设计

每台设备运行一个轻量 agent（Go 单二进制）：

### 5.1 职责

| 功能 | 实现 |
|------|------|
| 服务注册 | 调用 etcd，上报本机服务实例 |
| 健康检查 | 定期探活本机服务，异常上报 |
| 日志收集 | 采集本机日志 → 转发 Loki |
| 配置拉取 | 从 etcd 拉取本机服务配置 |
| 版本更新 | 检测新版本，rsync 拉取并重启 |
| 指标暴露 | Prometheus metrics 端点 |

### 5.2 Agent 命令

```bash
agent register   # 注册服务
agent health     # 健康检查
agent update     # 更新服务
agent log        # 采集日志
```

## 6. 监控与告警

### 6.1 Prometheus + Grafana

- 老电脑/主力机跑 Prometheus（node_exporter + 各服务 metrics）
- 指标：CPU/内存/磁盘/网络、QPS、延迟、错误率、队列长度
- Grafana 面板：设备总览、服务健康、请求量

### 6.2 告警

- 设备离线（agent 心跳丢失）
- 服务重启频繁
- 磁盘/内存超阈值
- NATS 队列积压

### 6.3 轻量替代

盒子资源不足时：
- 单节点 Prometheus 已经够轻
- 或只用 agent 上报 + 定时 curl 抓取

## 7. 日志方案

参考 02-logging-strategy.md：

| 环境 | 方案 |
|------|------|
| 盒子（eMMC） | RingBufferLogger（内存），错误级写文件 |
| 电脑 | FileLogger + lumberjack 轮转 |
| 集中分析 | Loki 聚合 |

## 8. 备份策略

| 数据 | 备份频率 | 位置 |
|------|----------|------|
| MySQL | 每日 | 主力机磁盘 + 移动硬盘 |
| MinIO 文件 | 每日增量 | 主力机另一目录 |
| etcd | 每日快照 | 主力机 |
| NATS JetStream | 每日 | 主力机 |
| 配置 | 每次变更 | git 仓库 |

## 9. 安全

- 内网部署，服务间走内网 IP
- 公网暴露：仅 Traefik 端口 + HTTPS（自动 Let's Encrypt）
- 认证：JWT 双端校验 + Redis 会话
- 密钥：`.env` 管理，不入 git
- 防火墙：只开放必要端口

## 10. 云环境迁移（可选）

未来上云时，架构不变，只换基础设施：

| 本地 | 云 |
|------|----|
| etcd 单节点 | etcd 集群 / K8s 内置 |
| MySQL 自建 | 云 RDS |
| MinIO | 云 OSS/S3 |
| NATS 自建 | 云 NATS / Kafka |
| Traefik | K8s Ingress / Gateway API |
| 设备 agent | K8s DaemonSet |
| Prometheus 自建 | 云监控 / Prometheus Operator |
| SRS 自建 | 云直播/CDN |

抽象层（03 文档）保证：**换实现只改配置，不改业务代码。**