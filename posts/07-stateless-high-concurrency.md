---
title: 'MyBilibili 无状态与高并发设计'
date: 2026-07-31
---

# MyBilibili 无状态与高并发设计

## 1. 核心目标

在弱设备（盒子/手机）组成的集群上，实现：
1. **无状态**：任何服务实例可随时启停、替换，不影响系统
2. **高并发**：在有限资源下榨干性能，支撑万人级在线
3. **可扩展**：加实例即扩容，改配置即部署

## 2. 无状态设计

### 2.1 原则

**服务不保存任何与请求绑定的状态。** 状态全部外置：

| 状态类型 | 存储位置 | 说明 |
|----------|----------|------|
| 用户会话 | Redis | 登录态，含 JWT 黑名单 |
| WebSocket 连接 | Redis Pub/Sub | 跨实例消息广播 |
| 任务进度 | Redis Stream | 转码/导出任务 |
| 计数器 | Redis | 点赞/收藏/播放量 |
| 缓存 | Redis | 热点数据 |
| 数据库 | MySQL | 持久化业务数据 |

### 2.2 会话管理

**传统方案（有状态）：**
```
用户 → 网关 → 服务A（保存 session）→ 下次请求必须再打服务A
```

**无状态方案：**
```
用户 → 网关 → JWT 校验（Redis 查会话）→ 任意服务实例均可处理
```

实现：
- 登录成功 → 生成 JWT + 在 Redis 写会话（userId → token, expires）
- 每次请求 → 网关校验 JWT 签名 + 查 Redis 会话有效性
- 登出/踢人 → 删除 Redis 会话（JWT 进黑名单）
- 服务实例重启 → 会话在 Redis，不受影响

### 2.3 WebSocket 跨实例广播

盒子重启、实例漂移，连接会断开重连：

```
客户端A ──WS──▶ realtime-1 ──┐
                              ├── Redis Pub/Sub ──▶ realtime-2 ──WS──▶ 客户端B
                              └──（弹幕/通知广播）
```

- 每个 realtime 实例订阅 Redis 主题
- 发消息只往 Redis Publish，所有实例收到后推给本地连接
- 实例增减不影响广播

### 2.4 任务处理

转码等异步任务：

```
用户上传 → gateway → Redis Stream(enqueue 转码任务)
                        ↓
media-1 消费 ── 处理 ── 结果写回 Redis/MySQL
media-2 消费（并行）
```

- 任务在 Redis Stream，实例崩溃后任务被其他实例消费（redelivery）
- 消费组保证每个任务只被一个实例处理

## 3. 高并发设计

### 3.1 分层缓存

```
请求 → Nginx(静态缓存) → gateway(本地内存缓存) → Redis(共享缓存) → MySQL
```

| 层 | 内容 | 命中率 | 说明 |
|----|------|--------|------|
| Nginx | 静态资源 | 高 | 视频封面、JS/CSS |
| 本地内存 | 配置、热数据 | 中 | Go 自带，TTL 短 |
| Redis | 通用缓存 | 高 | 读多写少数据 |
| MySQL | 最终数据 | - | 兜底 |

### 3.2 热点处理

- **热点视频**：计数在 Redis 累积，定时刷 MySQL
- **弹幕**：WebSocket 直推，不进数据库（可选落盘）
- **排行榜**：Redis ZSET 实时维护，定时持久化
- **防刷**：Redis 滑动窗口限流

### 3.3 并发控制

| 场景 | 方案 |
|------|------|
| 点赞去重 | Redis SETNX 幂等 |
| 库存扣减 | Redis 原子减 + 异步对账 |
| 评论限流 | Redis INCR + TTL |
| 分布式锁 | Redis SET NX EX |

### 3.4 数据库优化

- 连接池：每实例最小连接，避免盒子内存不足
- 读写分离：可加从库（老电脑够时）
- 分页优化：深分页用游标
- 慢查询：MySQL slow log 定期分析

## 4. 可扩展性

### 4.1 水平扩展

| 瓶颈 | 扩容方式 |
|------|----------|
| 入口流量 | 加 gateway 实例，Nginx/负载均衡分摊 |
| WS 连接多 | 加 realtime 实例（Redis Pub/Sub 天然支持） |
| 搜索慢 | 加 search 实例 |
| 转码排队 | 加 media worker（消费组自动分摊） |

### 4.2 优雅缩容

- 实例下线前：从 etcd 反注册（新请求不再路由过来）
- 等待存量连接处理完（graceful shutdown）
- Redis Stream 消费组：实例退出后任务自动转移

## 5. 关键技术：Redis 作为消息队列（Stream）

### 5.1 为什么用 Redis Stream 而不是 RocketMQ

| 指标 | Redis Stream | RocketMQ |
|------|--------------|----------|
| 内存 | 复用 Redis | 独立几百 MB |
| 部署 | 已在跑 Redis | 额外服务器 |
| 延迟 | 亚毫秒 | 毫秒 |
| 消费者组 | 支持 | 支持 |
| 失败重试 | XACK/XCLAIM | 支持 |
| 弱设备 | 可跑 | 不现实 |

### 5.2 用法要点

```
XADD tasks * type=transcode videoId=123     # 入队
XGROUP CREATE tasks workers 0               # 创建消费组
XREADGROUP GROUP workers consumer-1 COUNT 1 # 消费
XACK tasks workers msg-id                    # 确认
XCLAIM tasks workers other 60000 msg-id     # 认领超时任务
```

- 消费者组 + XCLAIM 实现可靠投递
- 消息保留在 Redis，实例崩溃不丢
- 定时清理已 ACK 的消息（XTRIM）

## 6. 数据一致性

### 6.1 最终一致

- 缓存与 DB：Cache Aside（先更 DB，再删缓存）
- 计数：Redis 累积 → 定时批量刷 DB
- 异步任务：Stream + ACK，失败重试

### 6.2 强一致（支付）

- 支付、扣库存用 MySQL 事务
- 订单状态机：待支付 → 已支付 → 已发货 → 已完成
- 对账：每日脚本比对 MySQL 订单与支付记录

## 7. 性能预算（盒子）

| 指标 | 目标 |
|------|------|
| 单个 gateway 并发 | 2000+ |
| 单个 realtime WS 连接 | 5000+ |
| core QPS | 5000+ |
| 整体在线用户 | 万人级 |
| 内存占用（全部服务） | < 1GB/盒 |

## 8. 总结

1. **无状态**是弱设备集群的根基：会话/连接/任务全部外置 Redis
2. **Redis 一鱼多吃**：缓存 + MQ（Stream）+ 锁 + 计数器，避免额外组件
3. **Redis Pub/Sub** 解决 WS 跨实例广播，这是实时系统的关键
4. **消费组**让任务系统天然可扩展、可容错
5. **分层缓存 + 限流** 保证并发下的稳定性
