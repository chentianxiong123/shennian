---
title: 'MyBilibili 日志问题与解决方案'
date: 2026-07-29
---

# MyBilibili 日志问题与解决方案

## 1. 问题描述

### 1.1 硬件约束

MyBilibili 需要部署在弱设备上：
- Android 盒子（1GB RAM，eMMC/SD 卡存储）
- 老电脑（2-4GB RAM，HDD）
- 无云服务器，无外部存储

### 1.2 eMMC/SD 卡写入寿命问题

eMMC 和 SD 卡有写入寿命限制：
- SLC 模式：约 10 万次擦写
- MLC 模式：约 3000-1 万次擦写
- TLC 模式：约 500-3000 次擦写

传统日志方案会频繁写入磁盘，加速损耗：
- 每秒写入 100 条日志 × 每条 1KB = 100KB/s
- 一天写入：100KB × 86400 = 8.6GB
- 一个月：8.6GB × 30 = 258GB

eMMC 通常只有 8-32GB，频繁写入会导致：
- 存储空间快速耗尽
- eMMC 寿命缩短
- 设备变慢或损坏

### 1.3 需求

1. **减少磁盘写入**：保护 eMMC/SD 卡寿命
2. **自动清理**：日志不能无限增长
3. **可配置**：不同环境选择不同策略
4. **可调试**：保留足够的调试信息
5. **审计保留**：支付等关键操作必须持久化

---

## 2. 日志方案对比

### 2.1 方案列表

| 方案 | 实现方式 | 磁盘写入 | 自动清理 | 复杂度 | 适用场景 |
|------|----------|----------|----------|--------|----------|
| journald volatile | 改一行配置 | ❌ 内存 | ✅ 写满清理 | 最低 | 系统日志 |
| logrotate 轮转 | 改配置文件 | ✅ 但可控 | ✅ 按大小/时间 | 低 | 应用日志 |
| Go 环形缓冲区 | 写 50 行代码 | ❌ 内存 | ✅ 覆盖旧数据 | 中 | 调试日志 |
| lumberjack | Go 第三方库 | ✅ 但可控 | ✅ 自动轮转 | 低 | 应用日志 |
| tmpfs + 脚本 | 挂载内存盘 + 清理脚本 | ❌ 内存 | ⚠️ 需要脚本 | 中 | 临时日志 |
| 只写聚合指标 | 应用层实现 | ❌ 内存 | ✅ 内存聚合 | 中 | 监控数据 |
| 远程日志 | 发到外部服务器 | ❌ 本地不写 | ✅ 外部存储 | 高 | 生产环境 |

### 2.2 方案详细说明

#### 方案 1：journald volatile

**原理：** systemd-journald 支持将日志存储到内存（tmpfs），不写磁盘。

**配置：**
```ini
# /etc/systemd/journald.conf
Storage=volatile
RuntimeMaxUse=50M
RuntimeMaxFileSize=10M
```

**优点：**
- 最简单，改一行配置
- 系统集成，稳定可靠
- 写满自动清理最旧的日志

**缺点：**
- 只管系统日志，不管应用日志
- 重启后日志丢失

**效果：**
- 日志存储在 /run/log/journal（tmpfs）
- 最多使用 50MB 内存
- 写满后自动清理最旧的日志

---

#### 方案 2：logrotate 轮转

**原理：** Linux 标准日志轮转工具，按大小/时间轮转日志文件。

**配置：**
```
/var/log/mybilibili/*.log {
    daily
    rotate 3
    size 10M
    missingok
    notifempty
    compress
}
```

**优点：**
- 标准 Linux 工具，稳定可靠
- 支持按大小、时间、数量轮转
- 支持压缩旧日志

**缺点：**
- 写磁盘，只是控制大小
- 需要配置文件

**效果：**
- 日志按大小轮转（最大 10MB）
- 最多保留 3 个旧文件
- 超过 3 天自动删除

---

#### 方案 3：Go 环形缓冲区

**原理：** 应用内维护固定大小的环形缓冲区，写满自动覆盖最旧的日志。

**实现：**
```go
type RingLogger struct {
    entries []LogEntry
    size    int
    head    int
    count   int
    mu      sync.Mutex
}

func NewRingLogger(size int) *RingLogger {
    return &RingLogger{
        entries: make([]LogEntry, size),
        size:    size,
    }
}

func (rl *RingLogger) Add(entry LogEntry) {
    rl.mu.Lock()
    defer rl.mu.Unlock()
    rl.entries[rl.head] = entry
    rl.head = (rl.head + 1) % rl.size
    if rl.count < rl.size {
        rl.count++
    }
    // 写满自动覆盖最旧的，不刷盘
}

func (rl *RingLogger) GetAll() []LogEntry {
    rl.mu.Lock()
    defer rl.mu.Unlock()
    result := make([]LogEntry, rl.count)
    for i := 0; i < rl.count; i++ {
        idx := (rl.head - rl.count + i + rl.size) % rl.size
        result[i] = rl.entries[idx]
    }
    return result
}
```

**优点：**
- 完全内存，零磁盘写入
- 写满自动覆盖最旧的
- 不需要外部依赖

**缺点：**
- 需要写代码
- 重启后日志丢失
- 内存占用固定

**效果：**
- 内存里固定 1000 条日志
- 写满后自动覆盖最旧的
- 不刷盘，零磁盘写入

---

#### 方案 4：lumberjack

**原理：** Go 第三方日志轮转库，自动按大小/时间轮转日志文件。

**实现：**
```go
import "gopkg.in/natefinch/lumberjack.v2"

log.SetOutput(&lumberjack.Logger{
    Filename:   "/var/log/myapp.log",
    MaxSize:    10,  // MB
    MaxBackups: 3,
    MaxAge:     7,   // days
    Compress:   true,
})
```

**优点：**
- Go 生态标准，简单易用
- 自动轮转，按大小/时间清理
- 支持压缩

**缺点：**
- 写磁盘，只是控制大小
- 需要依赖第三方库

**效果：**
- 日志按大小轮转（最大 10MB）
- 最多保留 3 个旧文件
- 超过 7 天自动删除
- 支持 gzip 压缩

---

#### 方案 5：tmpfs + 脚本

**原理：** 将日志目录挂载到内存盘（tmpfs），配合定时清理脚本。

**配置：**
```bash
# 挂载 tmpfs
mount -t tmpfs -o size=50M tmpfs /var/log/mybilibili

# /etc/fstab 永久生效
tmpfs /var/log/mybilibili tmpfs defaults,size=50M 0 0

# 定时清理脚本
*/5 * * * * find /var/log/mybilibili -name "*.log" -size +40M -delete
```

**优点：**
- 内存存储，零磁盘写入
- 可定制清理策略
- 灵活性高

**缺点：**
- 需要维护脚本
- 重启后日志丢失
- 需要手动管理

**效果：**
- 日志在内存里，最多 50MB
- 脚本定时清理超过 40MB 的文件
- 不刷盘，零磁盘写入

---

#### 方案 6：只写聚合指标

**原理：** 不写原始日志，只在内存里统计聚合指标。

**实现：**
```go
type Metrics struct {
    counters map[string]int64   // 请求次数、错误次数
    gauges   map[string]float64 // 延迟、队列长度
    mu       sync.RWMutex
}

func (m *Metrics) Increment(key string) {
    m.mu.Lock()
    m.counters[key]++
    m.mu.Unlock()
}

func (m *Metrics) Set(key string, value float64) {
    m.mu.Lock()
    m.gauges[key] = value
    m.mu.Unlock()
}

// 定时导出到 Prometheus
func (m *Metrics) ExportToPrometheus() {
    // 暴露 /metrics 端点
}
```

**优点：**
- 零磁盘写入
- 只保留最有价值的数据
- 适合监控和告警

**缺点：**
- 没有原始日志，调试困难
- 需要额外的监控系统（Prometheus/Grafana）

**效果：**
- 只保留统计指标（QPS、错误率、延迟）
- 通过 Prometheus/Grafana 查看
- 不写日志文件

---

#### 方案 7：远程日志

**原理：** 将日志发送到外部日志服务器，本地不保留。

**实现：**
```go
// 发送到远程日志服务器
type RemoteLogger struct {
    endpoint string
    client   *http.Client
}

func (l *RemoteLogger) Info(msg string, fields ...Field) {
    entry := LogEntry{Time: time.Now(), Level: "INFO", Msg: msg, Fields: fields}
    data, _ := json.Marshal(entry)
    l.client.Post(l.endpoint, "application/json", bytes.NewReader(data))
}
```

**优点：**
- 本地零写入
- 集中管理，便于搜索和分析
- 可以保留长期历史

**缺点：**
- 需要外部服务器
- 网络依赖
- 需要额外成本

**效果：**
- 日志发到外部存储
- 本地不保留
- 集中搜索和分析

---

## 3. 可插拔日志系统设计

### 3.1 设计原则

1. **接口定义**：定义标准日志接口
2. **多实现**：每个接口有多个实现
3. **配置驱动**：通过配置文件选择实现
4. **运行时切换**：改配置就能切换实现，不用改代码

### 3.2 接口定义

```go
// Logger 日志接口
type Logger interface {
    Debug(msg string, fields ...Field)
    Info(msg string, fields ...Field)
    Warn(msg string, fields ...Field)
    Error(msg string, fields ...Field)
    Close() error
}

// Field 日志字段
type Field struct {
    Key   string
    Value interface{}
}

// LoggerConfig 日志配置
type LoggerConfig struct {
    Type   string                 `yaml:"type"`   // ringbuffer / file / journald / remote / composite
    Level  string                 `yaml:"level"`  // debug / info / warn / error
    Config map[string]interface{} `yaml:"config"`
}
```

### 3.3 多实现

| 实现 | 类型 | 适用场景 | 配置参数 |
|------|------|----------|----------|
| RingBufferLogger | 内存 | eMMC/SD 卡，担心寿命 | size（缓冲区大小） |
| FileLogger | 磁盘 | SSD/硬盘，不担心寿命 | path, maxSize, maxBackups, maxAge |
| JournaldLogger | 系统 | systemd 环境 | 无 |
| RemoteLogger | 网络 | 有外部日志服务器 | endpoint, timeout |
| CompositeLogger | 组合 | 需要多种策略 | loggers（子日志器列表） |

### 3.4 工厂函数

```go
func NewLogger(config LoggerConfig) (Logger, error) {
    switch config.Type {
    case "ringbuffer":
        return NewRingBufferLogger(config.Config)
    case "file":
        return NewFileLogger(config.Config)
    case "journald":
        return NewJournaldLogger(config.Config)
    case "remote":
        return NewRemoteLogger(config.Config)
    case "composite":
        return NewCompositeLogger(config.Config)
    default:
        return nil, fmt.Errorf("unknown logger type: %s", config.Type)
    }
}
```

### 3.5 配置示例

**RingBufferLogger（eMMC 设备）：**
```yaml
logging:
  type: ringbuffer
  level: info
  config:
    size: 1000        # 缓冲区大小（条数）
    format: json      # 输出格式
```

**FileLogger（SSD/硬盘）：**
```yaml
logging:
  type: file
  level: info
  config:
    path: /var/log/mybilibili/app.log
    maxSize: 10       # MB
    maxBackups: 3
    maxAge: 7         # days
    compress: true
```

**JournaldLogger（systemd 环境）：**
```yaml
logging:
  type: journald
  level: info
  config: {}
```

**RemoteLogger（有外部服务器）：**
```yaml
logging:
  type: remote
  level: info
  config:
    endpoint: http://log-server:9200
    timeout: 5s
```

**CompositeLogger（组合策略）：**
```yaml
logging:
  type: composite
  level: debug
  config:
    loggers:
      - type: ringbuffer
        level: debug
      - type: file
        level: error
        config:
          path: /var/log/mybilibili/error.log
```

---

## 4. 推荐方案

### 4.1 按环境选择

| 环境 | 推荐方案 | 原因 |
|------|----------|------|
| Android 盒子（eMMC） | ringbuffer | 零磁盘写入，保护寿命 |
| 老电脑（HDD） | file + logrotate | 标准做法，稳定 |
| 云服务器（SSD） | file + lumberjack | 不担心寿命 |
| 生产环境 | remote + composite | 集中管理，本地备份 |
| 开发环境 | journald | 简单，系统集成 |

### 4.2 分层日志策略

| 日志类型 | 存储位置 | 持久化 | 说明 |
|----------|----------|--------|------|
| 调试日志 | 内存（ringbuffer） | ❌ | 调试用，重启丢弃 |
| 错误日志 | 磁盘（file） | ✅ | 保留，用于排查问题 |
| 访问日志 | 内存 + 采样 | ❌ | 只采样 1% 的请求 |
| 审计日志（支付等） | 磁盘（file） | ✅ | 必须持久化，用于对账 |
| 指标数据 | 内存 + Prometheus | ❌ | 聚合统计，定时导出 |

### 4.3 配置示例（Android 盒子）

```yaml
logging:
  type: composite
  level: info
  config:
    loggers:
      # 调试日志：内存环形缓冲
      - type: ringbuffer
        level: debug
        config:
          size: 1000
      # 错误日志：持久化到磁盘
      - type: file
        level: error
        config:
          path: /var/log/mybilibili/error.log
          maxSize: 10
          maxBackups: 3
          compress: true
      # 审计日志：持久化到磁盘
      - type: file
        level: info
        config:
          path: /var/log/mybilibili/audit.log
          maxSize: 50
          maxBackups: 10
          compress: true
```

---

## 5. 实现步骤

### 5.1 Phase 1：基础接口

1. 定义 Logger 接口
2. 实现 RingBufferLogger（最简单）
3. 实现 FileLogger（用 lumberjack）

### 5.2 Phase 2：更多实现

4. 实现 JournaldLogger
5. 实现 RemoteLogger
6. 实现 CompositeLogger

### 5.3 Phase 3：配置集成

7. 配置文件解析
8. 工厂函数
9. 全局日志实例

### 5.4 Phase 4：测试

10. 单元测试
11. 集成测试
12. 性能测试

---

## 6. 总结

1. **问题**：eMMC/SD 卡写入寿命有限，传统日志方案会加速损耗
2. **方案**：多种日志方案可选，从零磁盘写入到完全持久化
3. **设计**：可插拔日志系统，配置驱动，部署者自由选择
4. **推荐**：Android 盒子用 ringbuffer，老电脑用 file + logrotate，云服务器用 file + lumberjack
5. **分层**：调试日志用内存，错误/审计日志持久化，指标数据聚合导出
