---
title: '微服务安全架构：零信任与网关职责分离'
date: 2026-08-05
---

# 微服务安全架构：零信任与网关职责分离

## 1. 背景

### 1.1 旧做法（Spring Cloud 时代）

原 Java gateway 承担了过多职责：
- 路由转发（50+ 条路由）
- JWT 认证（验签）
- 三层授权（公开/需认证/管理员，权限精确到路径）
- 用户身份透传（注入 X-User-Id 等请求头）
- CORS 跨域
- 异常处理

**问题：** 授权逻辑耦合在网关里，每次改权限都要改网关代码，且网关太重。

### 1.2 新认识

网关不应该做业务层授权。`/api/video/admin` → `video:manage` 这种映射是**业务规则**，不是网络规则。网关只该做通用横切关注点。

---

## 2. 零信任架构原则

### 2.1 核心原则

1. **永不信任，持续验证**：无论请求来源内外，每次都需要认证
2. **最小权限**：每个服务只被授予完成其任务所需的最小权限
3. **基于身份的控制**：身份是安全策略的核心，而非网络位置
4. **职责分离**：网关/服务/服务网格各司其职

### 2.2 三层安全模型

| 层 | 组件 | 职责 | 解决的问题 |
|----|------|------|-----------|
| **入口层** | 网关（Traefik） | JWT 验签、限流、路由、证书 | "token 是否有效？" |
| **业务层** | 各 Go 服务 | 从 JWT 解析身份，自行判断权限 | "这个用户能删这个评论吗？" |
| **传输层** | 服务网格（mTLS） | 服务间双向认证、链路加密 | "调用方服务是可信的吗？" |

---

## 3. 网关的职责边界

### 3.1 网关应该做的事

| 功能 | 说明 | 实现方式 |
|------|------|----------|
| JWT 验证 | 验证 token 签名、过期时间、issuer | Traefik ForwardAuth 或内置中间件 |
| 路由转发 | 按路径分发到后端服务 | Traefik 配置即用 |
| 限流 | 保护后端不被打爆 | Traefik 内置中间件 |
| 自动证书 | Let's Encrypt 自动申请和续签 | Traefik 内置 |
| CORS | 跨域配置 | Traefik 内置中间件 |
| 透传 JWT | 将原始 JWT 传递给下游服务 | 请求头透传 |

### 3.2 网关不该做的事

| 功能 | 为什么不该做 |
|------|-------------|
| 细粒度授权（"video:manage 权限能不能删这个视频"） | 这是业务规则，每次改权限要改网关 |
| 用户身份透传（X-User-Id 注入） | 下游服务自己从 JWT 解析更安全 |
| 业务路由逻辑 | 路由不应包含业务判断 |

---

## 4. 各服务自己认证

### 4.1 做法

网关验证 JWT 有效性后，将原始 JWT 透传给下游。每个服务自己从 JWT 中解析用户身份，自行判断权限。

```
请求 → Traefik（验签，通过则透传 JWT）
    → core 服务（从 JWT 取 userId/role，判断："这个用户是本人吗？"）
    → realtime 服务（从 JWT 取 userId，判断："这个用户能进这个房间吗？"）
    → ads 服务（从 JWT 取 userId，判断："这个用户是管理员吗？"）
```

### 4.2 优点

| 对比项 | 旧做法（网关统一授权） | 新做法（各服务自认证） |
|--------|---------------------|---------------------|
| 权限变更 | 改网关代码，重启网关 | 改对应服务，不影响其他 |
| 服务独立性 | 依赖网关透传身份头 | 独立，可单独暴露 |
| 安全边界 | 网关被绕过则裸奔 | 每个服务自己把关 |
| 代码量 | 网关 8 个 Java 文件 | 每服务 gRPC 拦截器 ~3 行 |

### 4.3 实现示例

```go
// gRPC 拦截器：从 JWT 中提取用户身份
func AuthInterceptor(ctx context.Context) (context.Context, error) {
    md, _ := metadata.FromIncomingContext(ctx)
    token := md.Get("authorization")
    if len(token) == 0 {
        return ctx, status.Error(codes.Unauthenticated, "missing token")
    }
    claims, err := jwt.Parse(token[0], keyFunc)
    if err != nil {
        return ctx, status.Error(codes.Unauthenticated, "invalid token")
    }
    // 将用户身份注入 context
    ctx = context.WithValue(ctx, "userId", claims.UserId)
    ctx = context.WithValue(ctx, "role", claims.Role)
    return ctx, nil
}
```

---

## 5. 网关 vs 服务网格（Service Mesh）

| 组件 | 控制范围 | 做什么 |
|------|----------|--------|
| **Traefik（网关）** | 南北向流量（外部→内部） | JWT 验签、限流、路由、证书 |
| **Istio / Linkerd（服务网格）** | 东西向流量（服务→服务） | mTLS 双向认证、服务间授权策略 |

**对你盒子场景：** 服务网格太重（Istio 需要 K8s），不用强求。Go 服务间用 gRPC + JWT 透传已经足够安全。

---

## 6. 最终架构

```
用户请求
    ↓
Traefik（网关）
  ├── JWT 验签（token 有效吗？）
  ├── 限流（请求太多吗？）
  ├── 路由（转发到哪个服务？）
  └── 透传原始 JWT
        ↓
core（从 JWT 取 userId，判断：能删评论吗？）
realtime（从 JWT 取 userId，判断：能发弹幕吗？）
ads（从 JWT 取 role，判断：是管理员吗？）
search（从 JWT 取 userId，判断：能看这个数据吗？）
        ↓
老电脑（MySQL / Redis / etcd / NATS）
```

---

## 7. 总结

1. **网关只做入口安全**：验签、限流、路由，不做业务授权
2. **各服务自己认证**：从 JWT 解析身份，自行判断权限，独立安全
3. **职责分离**：改权限不用改网关，改网关不影响权限
4. **更轻量**：Traefik 配置即用，各服务只需 3 行拦截器代码
5. **零信任**：不依赖内网信任，每个服务自己把关

这是云原生时代的标准做法，区别于 Spring Cloud 时代的"网关大包大揽"模式。