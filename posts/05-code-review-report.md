---
title: 'MyBilibili 代码审查报告'
date: 2026-07-31
---

# MyBilibili 代码审查报告

## 1. 审查范围

- 审查时间：2026-07
- 范围：当前云微服务版本（master，Java 8 服务）
- 规模：约 509 个 Java 文件
- 方法：静态扫描 + 人工抽样 + 架构审计脚本

## 2. 总体结论

| 维度 | 评级 | 说明 |
|------|------|------|
| 架构清晰度 | ★★★☆ | 服务边界基本清晰，职责划分合理 |
| 依赖耦合 | ★★☆☆ | 与 Spring Cloud Alibaba 深度耦合 |
| 可移植性 | ★★☆☆ | 强绑定 Java 生态 |
| 代码质量 | ★★★☆ | 整体可读，部分长文件 |
| 抽象程度 | ★★★☆ | StorageService 已抽象，其余紧耦合 |
| 测试覆盖 | ★★☆☆ | 覆盖率不足 |

---

## 3. 发现的问题

### 3.1 严重问题

#### P1-1：业务代码与 RocketMQ 直接耦合

**位置：** 多个服务直接注入 RocketMQTemplate

```java
@Autowired
private RocketMQTemplate rocketMQTemplate;
```

**影响：**
- 换消息队列必须改业务代码
- 单元测试必须启动 RocketMQ 或用 mock
- 无法在弱设备使用（RocketMQ 太重）

**建议：** 抽象 MessageQueue 接口，业务依赖接口

---

#### P1-2：服务间调用用 @FeignClient 硬绑定

**位置：** 各服务 Feign Client 接口

```java
@FeignClient(name = "mybilibili-content-interaction")
public interface ContentInteractionClient {
    @GetMapping("/interaction/comment/list")
    List<CommentDTO> listComments(...);
}
```

**影响：**
- 只能 Java 调用 Java
- 与 HTTP 路由耦合，改协议困难
- 无法被 Go 服务调用

**建议：** 抽 ServiceCaller 接口，gRPC 实现

---

#### P1-3：Nacos 配置直接注入，无抽象

**位置：** `@Value("${nacos.config...}")` 或 Nacos 配置类

**影响：**
- 配置中心换 etcd 要改所有注入点
- 弱设备无法跑 Nacos

**建议：** 配置管理抽象，etcd/文件/env 多实现

---

### 3.2 中等问题

#### P2-1：服务内模块边界模糊

- content-interaction 服务同时处理评论、点赞、收藏、举报，内部缺少清晰模块分层
- video-media 服务把转码、字幕、直播、AI 总结堆在一起

**建议：** 内部按 domain 分包，后续按需拆分

#### P2-2：DTO 与 Entity 混用

- 部分 Controller 直接返回 Entity
- 部分 Entity 里混入展示字段

**建议：** 明确 DTO/Entity/PO 分层

#### P2-3：长方法、长类

- 部分 Service 类超过 800 行
- Controller 里存在事务逻辑

**建议：** 抽出辅助类，事务下沉 Service

#### P2-4：异常处理不统一

- 部分接口返回自定义 Result，部分直接抛异常
- 错误码未统一枚举

**建议：** 统一错误码 + 全局异常处理

#### P2-5：魔法值与硬编码

- 多处硬编码 Redis key、超时时间、重试次数

**建议：** 常量类/配置化

---

### 3.3 轻量问题

- 大量 Lombok 注解（可接受，但注意 GraalVM 反射配置）
- 注释中英文混杂
- 部分 Controller 缺少参数校验
- 日志级别不统一

---

## 4. 亮点

### 4.1 StorageService 已抽象 ✅

```
StorageService（接口）
 ├── MinioStorageService（MinIO 实现）
 ├── LocalStorageService（本地实现）
```

这证明抽象层模式已在本项目实践过且有效，可推广到 MessageQueue/ServiceDiscovery/CacheStore。

### 4.2 服务边界基本合理

- 8 个服务职责基本单一
- gateway 独立，认证逻辑集中
- mq 独立模块处理消息

### 4.3 有架构审计脚本

`scripts/check-architecture.ps1`、`check-feign-boundaries.ps1` 等脚本可用于自动化检查。

---

## 5. 重构优先级建议

| 优先级 | 项 | 工作量 | 风险 |
|--------|----|--------|------|
| P0 | 抽象 MessageQueue 接口 | 中 | 高 |
| P0 | 抽象 ServiceCaller 接口 | 中 | 高 |
| P0 | 抽象 ServiceDiscovery | 低 | 中 |
| P1 | 统一错误码/异常处理 | 低 | 低 |
| P1 | DTO/Entity 分层 | 中 | 低 |
| P2 | 长类拆分 | 中 | 低 |
| P2 | 硬编码配置化 | 低 | 低 |

**策略：** 先抽接口（改动集中在注入点），确认编译通过且功能不变后再逐个替换实现。这样重构风险最低、可随时回滚。

---

## 6. 结论

1. 现有代码**功能完整**，但**基础设施耦合严重**
2. 抽象层思路已被 StorageService 验证可行
3. 重构建议从 **MessageQueue → ServiceCaller → ServiceDiscovery** 顺序推进
4. 每个服务独立迁移，先支持配置切换（保持原实现），再逐步替换
5. GraalVM 编译时需注意 Lombok/反射的 native-image 配置（`reflect-config.json`）
