---
title: 'MyBilibili 重构执行计划'
date: 2026-08-05
---

# MyBilibili 重构执行计划

## 1. 总览

### 1.1 目标

从 Spring Cloud Alibaba 微服务重构为云原生标准架构：

| 项 | 现状 | 目标 |
|----|------|------|
| 服务发现 | Nacos | etcd |
| 消息队列 | RocketMQ | NATS（CNCF 孵化） |
| 缓存 | Redis | Redis（保留） |
| 服务调用 | Feign | gRPC（CNCF 毕业） |
| 网关 | Spring Cloud Gateway | Traefik（K8s Gateway API 实现） |
| 存储 | MySQL + MongoDB | MySQL + SQLite |
| 语言 | Java 全栈 | Go + Java (GraalVM) |
| 可观测性 | 无 | Prometheus + Loki + OpenTelemetry |

### 1.2 现状盘点

- 现有 Java 服务：8 个（account-social, ai, common, content-interaction, gateway, mq, search-recommend, video-media + admin）
- 代码规模：约 509 个 Java 文件
- 紧耦合点：RocketMQTemplate、@FeignClient、Nacos 配置注入
- 已抽象：StorageService（MinioStorageService 实现）

### 1.3 资源清单

**硬件（12 设备）：**
- 4 台 Android 盒子（1GB RAM，eMMC）
- 6 台手机（Android，可 Linux 化）
- 2 台电脑（1 台主力机做 media 转码）

**基础设施：**
- MySQL：部署在老电脑（主数据库，支付强一致）
- SQLite：盒子本地缓存/离线降级
- NATS：消息队列（老电脑，~20MB）
- etcd：服务发现（老电脑）
- Redis：缓存（老电脑）
- MinIO：对象存储（主力机）
- Traefik：网关（盒子入口）

---

## 2. 阶段划分

### Phase 0：准备（1 周）

**目标：** 建立基础，统一开发环境

- [ ] 定义并提交基础设施抽象层接口（03 文档）
- [ ] 建立 Go 微服务脚手架（core/realtime/search/ads）
- [ ] 配置管理（etcd）接入测试
- [ ] 确定 protobuf 定义目录结构
- [ ] 明确 MySQL/SQLite 数据边界

**产出：**
- `proto/` 目录（gRPC 接口定义）
- `go.mod` 各服务
- 抽象层接口代码（go 包）

### Phase 1：部署 Traefik 网关（1 周）

**目标：** 用 Traefik 替换 Java Spring Cloud Gateway

- [ ] 部署 Traefik 到盒子（docker 或二进制）
- [ ] 配置 etcd 服务发现（Traefik → etcd 对接）
- [ ] 配置 HTTP → gRPC 路由
- [ ] 配置 JWT 认证中间件
- [ ] 配置限流中间件
- [ ] 配置 Let's Encrypt 自动证书

**验证：** Java 服务通过 Traefik 代理访问，JWT 认证生效

### Phase 2：核心服务迁移（4 周）

**目标：** core 服务用 Go 重写（用户/关注/内容/评论/点赞/收藏/分享）

- [ ] 用户模块（注册/登录/资料）
- [ ] 内容模块（视频/稿件 CRUD）
- [ ] 互动模块（评论/点赞/收藏/分享）
- [ ] MySQL 访问（现有表结构复用）
- [ ] 缓存层（Redis CacheStore）

**验证：** core 与 Java 版功能对齐（对拍测试）

### Phase 3：实时服务（2 周）

**目标：** realtime 服务（弹幕/消息/通知 WebSocket）

- [ ] WebSocket 网关（连接管理）
- [ ] 弹幕广播（NATS 分发）
- [ ] 消息通知（SSE/WS 推送）
- [ ] 会话状态（Redis，无状态化）

**验证：** 双端（web + 移动）收发弹幕

### Phase 4：搜索服务（2 周）

**目标：** search 服务（搜索/推荐/热榜）

- [ ] Bleve 索引（替代 ES）
- [ ] 索引同步（监听 NATS 业务事件）
- [ ] 推荐排序（简单规则）
- [ ] 热榜计算（定时聚合）

**验证：** 搜索结果与 ES 版一致

### Phase 5：媒体服务（4 周）

**目标：** media 服务（Java GraalVM）

- [ ] 视频转码（FFmpeg 子进程）
- [ ] 直播接入（SRS + HLS/FLV）
- [ ] AI 字幕（Whisper 子进程）
- [ ] AI 总结（DeepSeek API）
- [ ] GraalVM Native Image 编译

**验证：** 转码任务从 NATS JetStream 消费并处理

### Phase 6：广告/商城服务（3 周）

**目标：** ads（Go）+ store（Java GraalVM）

- [ ] ads：广告投放/展示计费/点击计费
- [ ] store：商城/订单/支付/退款/对账
- [ ] 支付事务保障（MySQL 强一致）

### Phase 7：部署与 CI/CD（2 周）

**目标：** 12 设备集群 + 自动部署 + 可观测性

- [ ] GitHub Actions 多架构编译（arm64/amd64）
- [ ] SSH/rsync 部署脚本
- [ ] 设备 agent（服务注册/健康检查/日志）
- [ ] systemd 服务单元
- [ ] Prometheus + Grafana 监控
- [ ] Loki 日志聚合
- [ ] OpenTelemetry 链路追踪

---

## 3. 每个阶段的完成标准

| 阶段 | 完成标准 |
|------|----------|
| Phase 0 | 抽象层接口 + 脚手架可编译，配置可切换 |
| Phase 1 | Traefik 代理全部 Java 服务，JWT/限流生效 |
| Phase 2 | core 功能与 Java 版对拍一致 |
| Phase 3 | 弹幕实时收发，无状态（重启不断连可恢复） |
| Phase 4 | 搜索/热榜与 ES 版结果一致 |
| Phase 5 | 转码/字幕/总结全流程跑通 |
| Phase 6 | 下单-支付-退款链路完整 |
| Phase 7 | 一键部署到 12 设备，监控可见 |

---

## 4. 风险与对策

| 风险 | 概率 | 影响 | 对策 |
|------|------|------|------|
| GraalVM 编译失败 | 中 | 高 | 保守用 JVM，二进制化非强制 |
| FFmpeg 子进程兼容 | 中 | 中 | 打包 ffmpeg 静态二进制，用子进程不 JNI |
| 数据迁移错误 | 中 | 高 | 先用配置指向旧库，逐步切换 |
| 功能对拍不一致 | 高 | 中 | 每个服务对拍测试后才替换 |
| 盒子资源不足 | 低 | 高 | 服务按需分配，盒子只跑业务 |

---

## 5. 里程碑

```
M1（第 1 周）  抽象层 + 脚手架就绪
M2（第 2 周）  Traefik 网关跑通全链路
M3（第 6 周）  core 迁移完成（对拍通过）
M4（第 8 周）  realtime 实时链路通
M5（第 10 周） search 通
M6（第 14 周） media 通（GraalVM）
M7（第 17 周） ads + store 通
M8（第 19 周） 12 设备集群部署完成 + 可观测性就绪
```

---

## 6. 分支管理

基于当前仓库结构：

```
master      → 云微服务主线（Java，正在运行）
monolith    → 纯单体版（历史）
springboot3 → Spring Boot 3 升级线（历史）
web/java/admin/obs-plugin → 各源仓库历史
```

**重构开发流程：**
- 新增 `refactor/` 前缀分支（如 `refactor/core-go`）
- 每个服务一个分支，完成对拍后合并 master
- 抽象层接口先入库 master，稳定后各服务切换

**合并规则：**
- 功能分支保持 master 最新
- 每个合并保持可运行
- 不强制重写历史（保留合并提交）