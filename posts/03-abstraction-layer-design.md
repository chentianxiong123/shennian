---
title: 'MyBilibili 抽象层设计：基础设施可插拔'
date: 2026-07-31
---

# MyBilibili 抽象层设计：基础设施可插拔

## 1. 设计目标

### 1.1 为什么需要抽象层

当前 MyBilibili 微服务版本直接依赖 Spring Cloud Alibaba 具体实现：

| 组件 | 当前绑定 | 问题 |
|------|----------|------|
| RocketMQTemplate | RocketMQ | 换 MQ 要改业务代码 |
| @FeignClient | Feign | 换 RPC 要改业务代码 |
| NacosDiscovery | Nacos | 换注册中心要改业务代码 |
| RedisTemplate | Redis | 换缓存要改业务代码 |

业务代码和基础设施强耦合，导致：
- **无法在弱设备部署**（Nacos/RocketMQ 太重）
- **无法切换实现**（嵌入式 vs 企业级）
- **语言锁定**（Spring 生态绑定 Java）

### 1.2 抽象原则

1. **接口定义**：每个基础设施组件定义标准接口
2. **多实现**：每个接口有多个实现（嵌入式/轻量/企业级）
3. **配置驱动**：通过配置文件选择实现
4. **零业务侵入**：业务代码只依赖接口，不依赖实现
5. **测试友好**：内存实现用于单元测试

---

## 2. 核心接口定义

### 2.1 ServiceDiscovery（服务发现/注册）

**职责：** 服务注册、服务发现、健康检查

```go
// ServiceDiscovery 服务发现接口
type ServiceDiscovery interface {
    // Register 注册当前服务实例
    Register(ctx context.Context, instance ServiceInstance) error
    // Deregister 注销当前服务实例
    Deregister(ctx context.Context) error
    // Discover 根据服务名发现可用实例
    Discover(ctx context.Context, serviceName string) ([]ServiceInstance, error)
    // Watch 监听服务变化
    Watch(ctx context.Context, serviceName string) (<-chan []ServiceInstance, error)
    // Healthy 上报当前实例健康状态
    Healthy(ctx context.Context) error
}

type ServiceInstance struct {
    ServiceName string
    InstanceID  string
    Host        string
    Port        int
    Metadata    map[string]string
    Healthy     bool
}
```

**实现列表：**

| 实现 | 类型 | 适用场景 | 配置参数 |
|------|------|----------|----------|
| FileDiscovery | 文件 | 嵌入式/单机 | configPath |
| EtcdDiscovery | etcd | K8s 标准，云原生 | endpoints, prefix |
| NacosDiscovery | Nacos | 现有系统兼容 | serverAddr, namespace |
| MemoryDiscovery | 内存 | 单元测试 | 无 |

---

### 2.2 MessageQueue（消息队列）

**职责：** 消息发布/订阅、任务队列、事件广播

```go
// MessageQueue 消息队列接口
type MessageQueue interface {
    // Publish 发布消息到主题
    Publish(ctx context.Context, topic string, msg Message) error
    // Subscribe 订阅主题，返回消息通道
    Subscribe(ctx context.Context, topic string, group string) (<-chan Message, error)
    // Ack 确认消息已处理
    Ack(ctx context.Context, topic string, msg Message) error
    // Nack 消息处理失败，重新投递
    Nack(ctx context.Context, topic string, msg Message) error
    // Enqueue 入队（延迟/任务队列）
    Enqueue(ctx context.Context, queue string, msg Message, delay time.Duration) error
    // Close 关闭连接
    Close() error
}

type Message struct {
    ID        string
    Topic     string
    Key       string
    Payload   []byte
    Timestamp time.Time
    RetryCount int
}
```

**实现列表：**

| 实现 | 类型 | 适用场景 | 配置参数 |
|------|------|----------|----------|
| MemoryQueue | 内存 | 单元测试/单机 | 无 |
| RedisStreamQueue | Redis Stream | 轻量，无需额外组件 | redisAddr, streamPrefix |
| RocketMQQueue | RocketMQ | 企业级兼容 | nameServer, group |
| NATSQueue | NATS | 高性能轻量 | url, subjectPrefix |

**Redis Stream 实现说明：**
- 使用 Stream（主题）+ Consumer Group（消费者组）
- 单消费者：XADD / XREADGROUP
- 多消费者：XGROUP（负载均衡）
- 延迟队列：Sorted Set 时间戳 + 定时扫描

---

### 2.3 CacheStore（缓存）

**职责：** 缓存读写、分布式锁、限流计数

```go
// CacheStore 缓存接口
type CacheStore interface {
    // Get 读取缓存
    Get(ctx context.Context, key string) ([]byte, error)
    // Set 写入缓存
    Set(ctx context.Context, key string, value []byte, ttl time.Duration) error
    // Delete 删除缓存
    Delete(ctx context.Context, key string) error
    // Lock 获取分布式锁
    Lock(ctx context.Context, key string, ttl time.Duration) (bool, error)
    // Unlock 释放分布式锁
    Unlock(ctx context.Context, key string) error
    // Incr 原子自增（限流/计数）
    Incr(ctx context.Context, key string, ttl time.Duration) (int64, error)
    // Close 关闭连接
    Close() error
}
```

**实现列表：**

| 实现 | 类型 | 适用场景 | 配置参数 |
|------|------|----------|----------|
| MemoryCache | 内存 | 单元测试/单机 | maxItems |
| SQLiteCache | SQLite | 嵌入式持久化 | path, table |
| RedisCache | Redis | 分布式标准 | addr, password, db |
| BoltDBCache | BoltDB | 嵌入式 KV | path |

---

### 2.4 ServiceCaller（服务间调用）

**职责：** RPC 调用、负载均衡、超时重试

```go
// ServiceCaller 服务间调用接口
type ServiceCaller interface {
    // Call 同步调用
    Call(ctx context.Context, target string, method string, req []byte) ([]byte, error)
    // CallStream 流式调用（SSE/长连接）
    CallStream(ctx context.Context, target string, method string, req []byte) (<-chan []byte, error)
    // Close 关闭连接池
    Close() error
}
```

**实现列表：**

| 实现 | 类型 | 适用场景 | 配置参数 |
|------|------|----------|----------|
| GRPCClient | gRPC | 跨语言标准 | registry, timeout, retries |
| HTTPClient | HTTP/JSON | 简单服务 | baseURL, timeout |
| MemoryCaller | 内存 | 单元测试 | router |

**gRPC 实现说明：**
- 服务发现：对接 ServiceDiscovery 自动发现
- 负载均衡：round-robin / 加权
- 超时：默认 3s，可配置
- 重试：幂等方法自动重试 3 次
- 服务名 → 地址映射：`service://core/user.GetUser`

---

### 2.5 StorageService（文件存储）

**职责：** 文件上传/下载、对象存储、访问控制

```go
// StorageService 文件存储接口
type StorageService interface {
    // Put 上传文件
    Put(ctx context.Context, bucket string, key string, data []byte, contentType string) error
    // Get 下载文件
    Get(ctx context.Context, bucket string, key string) ([]byte, error)
    // Delete 删除文件
    Delete(ctx context.Context, bucket string, key string) error
    // GetURL 获取访问 URL（可能是签名 URL）
    GetURL(ctx context.Context, bucket string, key string, expire time.Duration) (string, error)
    // Head 检查文件是否存在
    Head(ctx context.Context, bucket string, key string) (bool, error)
}
```

**实现列表：**

| 实现 | 类型 | 适用场景 | 配置参数 |
|------|------|----------|----------|
| LocalStorage | 本地文件 | 嵌入式/单机 | rootPath, baseURL |
| MinioStorage | MinIO | 轻量对象存储 | endpoint, accessKey, secretKey |
| S3Storage | AWS S3 | 云上标准 | region, bucket, credentials |

> 注意：现有代码已有 StorageService 抽象，且已有 MinioStorageService 实现，说明此层已先行实践，模式正确。

---

### 2.6 SearchEngine（搜索）

**职责：** 全文索引、搜索、推荐排序

```go
// SearchEngine 搜索引擎接口
type SearchEngine interface {
    // Index 建立/更新索引
    Index(ctx context.Context, index string, docID string, doc interface{}) error
    // Delete 删除索引
    Delete(ctx context.Context, index string, docID string) error
    // Search 搜索
    Search(ctx context.Context, index string, query string, opts SearchOptions) (*SearchResult, error)
    // Reindex 重建索引
    Reindex(ctx context.Context, index string) error
}
```

**实现列表：**

| 实现 | 类型 | 适用场景 | 配置参数 |
|------|------|----------|----------|
| BleveSearch | Bleve | 嵌入式 Go | indexPath |
| SQLiteFTSSearch | SQLite FTS | 嵌入式轻量 | path, table |
| ElasticSearch | ES | 企业级 | addresses |

---

### 2.7 DocumentStore（文档存储）

**职责：** 非结构化/半结构化文档存储

```go
// DocumentStore 文档存储接口
type DocumentStore interface {
    Insert(ctx context.Context, collection string, doc interface{}) (string, error)
    FindByID(ctx context.Context, collection string, id string) (interface{}, error)
    Update(ctx context.Context, collection string, id string, doc interface{}) error
    Delete(ctx context.Context, collection string, id string) error
    Query(ctx context.Context, collection string, filter map[string]interface{}, page Page) ([]interface{}, error)
}
```

**实现列表：**

| 实现 | 类型 | 适用场景 |
|------|------|----------|
| SQLiteDocument | SQLite JSON | 嵌入式 |
| MongoDocument | MongoDB | 企业级 |

---

## 3. 工厂与配置

### 3.1 工厂函数模式

每个抽象层提供工厂函数，根据配置创建对应实现：

```go
func NewServiceDiscovery(cfg Config) (ServiceDiscovery, error) {
    switch cfg.Type {
    case "file":
        return NewFileDiscovery(cfg)
    case "etcd":
        return NewEtcdDiscovery(cfg)
    case "nacos":
        return NewNacosDiscovery(cfg)
    case "memory":
        return NewMemoryDiscovery()
    default:
        return nil, fmt.Errorf("unknown servicediscovery type: %s", cfg.Type)
    }
}
```

### 3.2 统一配置结构

```yaml
infrastructure:
  servicediscovery:
    type: etcd          # etcd / nacos / file / memory
    endpoints: ["http://localhost:2379"]
    prefix: /services
  messagequeue:
    type: redis-stream  # redis-stream / rocketmq / nats / memory
    redisAddr: localhost:6379
    streamPrefix: mq
  cachestore:
    type: redis         # redis / sqlite / boltdb / memory
    addr: localhost:6379
    password: ""
    db: 0
  servicecaller:
    type: grpc          # grpc / http / memory
    timeout: 3s
    retries: 3
  storageservice:
    type: minio         # local / minio / s3
    endpoint: localhost:9000
    accessKey: ""
    secretKey: ""
  searchengine:
    type: bleve         # bleve / elasticsearch
    indexPath: /var/data/search.bleve
  documentstore:
    type: sqlite        # sqlite / mongodb
    path: /var/data/app.db
```

### 3.3 配置切换效果

| 场景 | 配置 | 说明 |
|------|------|------|
| Android 盒子 | sqlite + memory + redis-stream | 全轻量，零外部依赖（Redis 可本机起） |
| 老电脑 | sqlite + redis | Redis 起本机 |
| 云服务器 | mysql + redis + etcd | 标准分布式 |
| 单元测试 | memory + memory + memory | 全内存 |

---

## 4. 与现有代码的映射

### 4.1 替换清单

| 现有组件 | 新接口 | 改造点 |
|----------|--------|--------|
| RocketMQTemplate | MessageQueue | 业务代码改调 MessageQueue |
| @FeignClient | ServiceCaller | Controller 层替换为 gRPC 调用 |
| NacosDiscovery | ServiceDiscovery | 启动注册逻辑替换 |
| RedisTemplate | CacheStore | 缓存/限流/锁替换 |
| MinioStorageService | StorageService | 已有，标准化接口 |
| ElasticsearchTemplate | SearchEngine | 搜索服务替换 |

### 4.2 改造原则

1. **先抽接口，再换实现**：先定义接口让业务依赖接口，最后替换实现
2. **一个服务一个 PR**：每个服务独立迁移，可回滚
3. **配置先行**：先支持配置切换，默认保持原实现（Nacos/RocketMQ），跑通后再切
4. **兼容层过渡**：必要时写适配器（Adapter），让旧实现走新接口

---

## 5. 抽象层好处总结

1. **弱设备可部署**：全轻量组件组合（SQLite + Redis Stream + 内存）
2. **企业级可用**：切配置即换 etcd + RocketMQ + ES
3. **语言不锁定**：接口是语言中立的，Go/Java 都能实现
4. **测试容易**：全内存实现，单元测试零依赖
5. **渐进迁移**：配置驱动，一个服务一个服务切，随时回滚
