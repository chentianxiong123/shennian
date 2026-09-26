---
title: '阿里微服务体系与 Kubernetes：不是不能一起用，而是职责容易重叠'
date: 2026-06-06
---

# 阿里微服务体系与 Kubernetes：不是不能一起用，而是职责容易重叠

## 前言

很多 Java 微服务项目都会采用一套典型的阿里微服务体系：Spring Cloud Alibaba、Nacos、Sentinel、RocketMQ、Seata，再加上网关、Feign、注册发现、配置中心、限流熔断等组件。

这套体系在传统虚拟机、物理机、Docker Compose 环境里非常常见，也确实能快速搭起一个完整的分布式项目。

但当项目准备迁移到 Kubernetes 时，很多人会产生一个疑问：为什么感觉 Nacos、Sentinel 这些组件突然没有那么自然了？是不是阿里微服务体系和 Kubernetes 不兼容？

严格来说，它们不是技术上不能兼容，而是有些职责发生了重叠，甚至会形成两套控制体系。

## 传统阿里微服务体系解决了什么

在没有 Kubernetes 的环境里，一个微服务系统通常需要自己解决这些问题：

1. 服务注册与发现：服务在哪里，如何找到它。
2. 配置中心：配置如何统一管理，如何动态刷新。
3. 熔断限流：流量过大时如何保护服务。
4. 远程调用：服务之间如何通信。
5. 分布式事务：跨服务写操作如何保证一致性。
6. 消息队列：耗时任务如何异步解耦。

Nacos 负责注册发现和配置管理。

Sentinel 负责限流、熔断、热点参数保护和系统自适应保护。

RocketMQ 负责异步消息、削峰填谷、最终一致性。

Seata 负责分布式事务。

Dubbo 或 OpenFeign 负责服务之间的 RPC 或 HTTP 调用。

在传统部署方式下，这套体系是闭环的。应用启动后注册到 Nacos，消费者通过 Nacos 找到服务，配置也从 Nacos 拉取，限流规则交给 Sentinel，异步任务交给 RocketMQ。

## Kubernetes 也在解决类似问题

Kubernetes 不是单纯的容器启动工具，它本身就是一套分布式应用运行平台。

它也提供了很多微服务基础能力：

1. Service 和 DNS 可以做服务发现。
2. ConfigMap 和 Secret 可以做配置管理。
3. Deployment 可以做滚动发布。
4. Readiness Probe 和 Liveness Probe 可以做健康检查。
5. Resource Request 和 Limit 可以做资源治理。
6. HPA 可以做自动扩缩容。
7. Ingress 或 Gateway API 可以做入口流量管理。
8. Service Mesh 可以进一步处理流量治理、熔断、重试、观测等能力。

这就导致一个问题：原来由阿里微服务组件负责的事情，Kubernetes 也能做一部分。

如果不重新划分职责，就会出现“双控制面”。

## Nacos 与 Kubernetes 的重叠

Nacos 最核心的两个能力是服务注册发现和配置中心。

但在 Kubernetes 里，服务发现通常由 Service 和 DNS 完成。例如一个服务叫 `video-media`，其他服务可以直接访问：

```text
http://video-media:8082
```

这个名字由 Kubernetes Service 维护，不需要应用自己注册到 Nacos。

如果继续用 Nacos 做服务发现，就会出现两套服务发现机制：

1. Kubernetes 知道 Pod 和 Service 的真实状态。
2. Nacos 也维护一份服务实例列表。

这时就可能出现状态不同步的问题。例如 Pod 已经重启或摘除，但 Nacos 实例状态刷新不及时；或者 Kubernetes 已经有稳定 Service 名称，但应用仍然依赖 Nacos 拉取实例。

所以在 Kubernetes 下，Nacos 不一定要完全删除，但它的定位应该调整。

更合理的方式是：

1. 本地 Docker Compose 或分布式演示环境：Nacos 可以做注册发现和配置中心。
2. Kubernetes 环境：服务发现优先交给 Kubernetes Service 和 DNS。
3. Nacos 如果保留，更适合做动态配置中心，而不是必需的服务发现中心。

也就是说，Nacos 在 K8s 下不是不能用，而是不应该和 Kubernetes 抢同一个职责。

## Sentinel 与 Kubernetes 的重叠

Sentinel 的价值在于流量治理，尤其是 Java 应用内部的限流、熔断、热点参数控制。

但 Kubernetes 也有自己的资源治理方式。例如可以限制容器 CPU、内存，可以通过 HPA 自动扩容，可以通过 Ingress 或网关做入口限流。

如果再引入 Service Mesh，还可以做超时、重试、熔断、流量镜像和灰度发布。

这就让 Sentinel 的定位变得微妙。

在 K8s 环境里，基础设施层面的保护通常由 Kubernetes、Ingress、网关或 Service Mesh 处理。Sentinel 更适合保留在业务层，用来处理更细粒度的 Java 逻辑保护。

例如：

1. 某个接口按照用户维度限流。
2. 某个热点视频 id 的评论请求需要单独保护。
3. 某个 AI 摘要接口成本很高，需要按资源类型限流。
4. 某段业务逻辑需要快速熔断，而不是只看整个 Pod 的健康状态。

如果项目没有这些细粒度需求，Sentinel 就可能变成一个常驻成本很高、展示意义大于实际意义的组件。

## Seata 与云原生架构的冲突感

Seata 解决的是分布式事务问题。

但在云原生和微服务实践中，很多系统会尽量避免强分布式事务，转向最终一致性。

例如视频上传链路中，不一定需要一个跨服务大事务把视频、AI、搜索索引、推荐数据全部一次性写成功。更合理的方式是：

1. 视频服务先保存视频元数据。
2. 发送 MQ 事件。
3. AI 服务消费事件生成摘要或字幕。
4. 搜索服务消费事件更新索引。
5. 推荐服务消费事件更新画像或召回数据。
6. 每个服务维护自己的状态和重试机制。

这种方式牺牲了一点即时一致性，但换来了系统弹性。

所以 Seata 不是不能用，而是要谨慎用。如果业务不是金融级强一致场景，强行引入分布式事务可能会让架构更复杂。

## RocketMQ 仍然很有价值

在阿里微服务体系里，RocketMQ 是最不应该被简单替换掉的组件之一。

Kubernetes 可以管理容器，但它不负责业务事件流。视频转码、AI 摘要、审核、搜索索引更新、通知推送，这些都需要消息队列来解耦。

尤其是视频和 AI 场景，任务耗时长、失败率不稳定、状态变化多，非常适合用 MQ。

例如：

1. 视频上传完成后发送 `VideoUploadedEvent`。
2. 转码完成后发送 `VideoTranscodedEvent`。
3. 音频抽取完成后发送 `AudioExtractedEvent`。
4. AI 摘要完成后发送 `AiSummaryGeneratedEvent`。
5. 审核完成后发送 `VideoAuditCompletedEvent`。

Kubernetes 负责运行这些服务，RocketMQ 负责连接这些业务事件。两者职责不同，所以不会天然冲突。

## 最大的问题：两套体系同时治理服务

阿里微服务体系和 Kubernetes 的不兼容感，本质来自职责重叠。

如果一个系统同时这样设计：

1. Nacos 做服务发现。
2. Kubernetes Service 也做服务发现。
3. Sentinel 做限流熔断。
4. Ingress 或 Service Mesh 也做限流熔断。
5. Nacos 做配置中心。
6. ConfigMap 和 Secret 也做配置管理。
7. 应用自己感知实例上下线。
8. Kubernetes 也在调度 Pod 上下线。

那么系统会变得非常难解释。

出问题时，你很难判断到底是哪一层在生效：是 Nacos 实例没刷新，还是 K8s Service 没转发？是 Sentinel 拦截了请求，还是网关限流了？是 ConfigMap 没更新，还是 Nacos 配置没刷新？

这不是技术不能用，而是职责边界没有重新设计。

## 更合理的分层方式

如果一个 Java 微服务项目未来要上 Kubernetes，我更推荐这样划分职责。

Kubernetes 负责平台层：

1. 容器编排
2. 服务发现
3. 健康检查
4. 滚动发布
5. 资源限制
6. 自动扩缩容
7. 基础入口流量

Spring Cloud Alibaba 负责应用层：

1. 业务配置
2. Java 侧细粒度限流
3. 业务事件解耦
4. 服务内部保护
5. 对传统部署模式的兼容

RocketMQ 负责事件层：

1. 异步任务
2. 削峰填谷
3. 最终一致性
4. 跨服务状态流转

这样就不会互相抢职责。

## 对学习项目的建议

如果这是一个学生项目或学习项目，不需要一开始就追求生产级复杂度。

更好的路线是分阶段演进。

第一阶段，本地 Docker Compose。

保留 Nacos、RocketMQ、MySQL、Redis、MinIO、Elasticsearch。这个阶段的重点是把服务边界、MQ 异步链路、视频处理链路跑通。

第二阶段，轻量化本地开发。

可以准备一个 local-light 配置，减少常驻组件。例如本地调试时用静态服务地址，不强依赖 Nacos；Sentinel 可以作为可选展示组件，而不是每次都启动。

第三阶段，Kubernetes 演示。

将服务部署为 Deployment，通过 Service 暴露内部访问，用 Ingress 暴露网关入口。此时服务发现优先使用 Kubernetes DNS，Nacos 可以弱化为配置中心或演示组件。

第四阶段，完善可观测性。

补齐日志、指标、链路追踪、健康检查和资源限制。对学习项目来说，这比堆更多中间件更有价值。

## 总结

阿里微服务体系和 Kubernetes 并不是不能一起用。

真正的问题是：它们都想管理微服务运行过程中的一部分能力。如果没有重新划分职责，就会出现服务发现重复、配置重复、限流重复、治理重复的问题。

对一个学习型项目来说，最合理的方式不是彻底抛弃阿里体系，也不是把所有组件都强行塞进 Kubernetes，而是明确分工：

1. Kubernetes 管平台和部署。
2. Nacos 可选做配置，不必强行做服务发现。
3. Sentinel 可选做业务级保护，不必作为核心依赖。
4. RocketMQ 保留，负责业务异步事件。
5. 服务边界控制在少量核心服务内。

这样既能展示 Java 微服务体系，也能展示 Kubernetes 云原生能力，而且不会让项目变成一套难以维护的“双控制面”系统。
