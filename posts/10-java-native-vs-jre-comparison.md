---
title: 'Java GraalVM Native Image vs JRE 对比'
date: 2026-08-04
---

# Java GraalVM Native Image vs JRE 对比

## 1. 单服务对比

| 对比项 | 传统 JRE（Spring Boot + JVM） | GraalVM Native Image |
|--------|------|------|
| **启动速度** | 3~10 秒（Spring 加载 Bean、IoC 扫描） | 30~100ms（无反射/类加载开销） |
| **运行时内存** | 基础 200~400MB，峰值 500MB+ | 基础 15~40MB，峰值 80~120MB，约 **1/10** |
| **运行性能** | JIT 预热后峰值性能高 | 起步即峰值，但峰值略慢 10~20%（无 JIT） |
| **硬盘体积** | JAR 20~50MB + JRE 200~300MB = **250~350MB** | 单一静态链接二进制，**40~80MB** |

## 2. 多微服务场景（8 服务，单机）

| 对比项 | 8 服务共享 1 个 JRE | 8 服务各自 GraalVM Native |
|--------|------|------|
| **JDK/JRE** | 1 份 JRE = ~250MB | 0（已静态链接进二进制） |
| **应用本身** | 8 × JAR（~35MB）= 280MB | 8 × 二进制（~55MB）= 440MB |
| **硬盘总计** | ~530MB | ~440MB（略小） |
| **运行时内存** | 8 × 300MB = **~2.4GB** | 8 × 30MB = **~240MB（1/10）** |
| **启动总时间** | 8 × 3~10 秒 = 24~80 秒 | 8 × 50ms = **~400ms（100 倍快）** |

**结论：** 硬盘体积相当（Native 反而小 ~90MB）。真正差距在 **运行时内存**（2.4GB → 240MB）和 **启动速度**（半分钟 → 瞬间）。

## 3. 对 mybilibili 架构的选型

| 服务 | 语言 | 选型理由 |
|------|------|----------|
| **media** | Java GraalVM | 需要 FFmpeg/Whisper AI 子进程 + Java 生态成熟库 |
| **store** | Java GraalVM | 支付事务、Spring 生态成熟，订单/支付库丰富 |
| **gateway** | **Go** | 单二进制 10~15MB，内存 10~20MB，比 Native Image 更小更快 |
| **core** | **Go** | 同上，纯业务逻辑，无 Java 生态依赖 |
| **realtime** | **Go** | WebSocket + 高并发，Go 天生优势 |
| **search** | **Go** | Bleve 本身就是 Go 嵌入式库 |
| **ads** | **Go** | 轻量计费/规则引擎 |

**二进制体积对比：** 5 个 Go 服务（~15MB/个）+ 2 个 Java Native（~55MB/个）≈ **185MB 硬盘**
**运行时内存：** 5 个 Go（~15MB/个）+ 2 个 Java Native（~30MB/个）≈ **135MB 运行时**

盒子（1GB RAM）上完全无压力，还能从容跑 Redis/etcd 等基础设施。

## 4. Native Image 的代价

- 构建慢：每次 3~5 分钟（AOT 编译 + 静态链接）
- 反射/动态代理需提前配置 `reflect-config.json`
- 某些 Java 库不兼容（如动态类加载、Serialization）
- 调试不方便（无 JVM 工具链）

## 5. 总结

```text
单服务：   JRE 300MB 内存 vs Native 30MB 内存 → 10 倍差距
8 服务：   JRE 2.4GB 内存 vs Native 240MB 内存 → 10 倍差距
硬盘：     JRE 530MB   vs Native 440MB         → 基本持平
启动：     JRE 半分钟  vs Native 瞬间          → 100 倍差距
```

**结论：** 对盒子/手机场景，Native Image 是必选项。media + store 用 Java GraalVM，其余 5 个服务用 Go，磁盘和内存都最优。