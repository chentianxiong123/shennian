---
title: 'MyBilibili API 规范（v1.0）'
date: 2026-07-31
---

# MyBilibili API 规范（v1.0）

## 1. 规范目标

1. 统一所有服务的 API 风格，便于 gRPC 改造和跨端调用
2. 定义清晰的错误码体系
3. 规范认证、分页、幂等
4. 为网关（gateway）统一接入做准备

## 2. 通用约定

### 2.1 协议

- 对外：HTTPS（网关入口）
- 服务间：gRPC（ProtoBuf）
- 浏览器端：WebSocket（realtime）

### 2.2 数据格式

- 请求/响应：JSON
- 时间：Unix 毫秒时间戳（number）
- ID：long/int64
- 文本：UTF-8

### 2.3 统一响应结构

```json
{
  "code": 0,
  "message": "ok",
  "data": {},
  "requestId": "req-xxxx"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| code | int | 0 成功，非 0 失败（见错误码） |
| message | string | 提示信息 |
| data | object | 业务数据 |
| requestId | string | 链路追踪 ID |

### 2.4 分页

```json
// 请求
GET /api/v1/videos?page=1&pageSize=20

// 响应
{
  "code": 0,
  "data": {
    "list": [],
    "page": 1,
    "pageSize": 20,
    "total": 100,
    "hasMore": true
  }
}
```

| 参数 | 默认 | 上限 |
|------|------|------|
| page | 1 | - |
| pageSize | 20 | 100 |

### 2.5 认证

**请求头：**
```
Authorization: Bearer <jwt_token>
```

**流程：**
- 登录/注册 → 返回 accessToken（JWT，有效期 7 天）+ refreshToken（30 天）
- 访问受保护接口带 Authorization
- 网关校验 JWT + Redis 会话
- 登出 → 服务端失效会话

### 2.6 幂等

写操作支持幂等（防止重复提交）：

```
Idempotency-Key: <client generated uuid>
```

- 服务端对同一 key 只处理一次
- 用于：下单、支付、发布稿件

## 3. 错误码体系

### 3.1 全局错误码（0-999）

| code | 说明 |
|------|------|
| 0 | 成功 |
| 400 | 参数错误 |
| 401 | 未认证/登录过期 |
| 403 | 无权限 |
| 404 | 资源不存在 |
| 405 | 方法不允许 |
| 409 | 冲突（重复提交） |
| 429 | 请求过于频繁（限流） |
| 500 | 服务器内部错误 |
| 503 | 服务不可用 |

### 3.2 业务错误码（1000+）

**用户模块（1000-1099）：**

| code | 说明 |
|------|------|
| 1001 | 用户名已存在 |
| 1002 | 手机号/邮箱已注册 |
| 1003 | 验证码错误 |
| 1004 | 验证码过期 |
| 1005 | 密码错误 |
| 1006 | 账号被锁定（15 分钟） |
| 1007 | 账号被禁用 |

**内容模块（1100-1199）：**

| code | 说明 |
|------|------|
| 1101 | 稿件不存在 |
| 1102 | 稿件审核中 |
| 1103 | 稿件被拒绝 |
| 1104 | 分区不存在 |
| 1105 | 标签超限 |

**互动模块（1200-1299）：**

| code | 说明 |
|------|------|
| 1201 | 评论包含违禁词 |
| 1202 | 评论频率过快 |
| 1203 | 已点赞，不能重复 |
| 1204 | 已收藏，不能重复 |

**订单模块（1300-1399）：**

| code | 说明 |
|------|------|
| 1301 | 商品不存在 |
| 1302 | 库存不足 |
| 1303 | 订单不存在 |
| 1304 | 订单状态不允许此操作 |
| 1305 | 支付失败 |

**通用业务错误（1900-1999）：**

| code | 说明 |
|------|------|
| 1901 | 数据不存在 |
| 1902 | 数据已存在 |
| 1903 | 操作过于频繁 |
| 1904 | 服务暂不可用 |

## 4. 接口分类

### 4.1 认证接口（网关）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/v1/auth/register | 注册（邮箱/手机验证码） |
| POST | /api/v1/auth/login | 登录 |
| POST | /api/v1/auth/refresh | 刷新 token |
| POST | /api/v1/auth/logout | 登出 |
| POST | /api/v1/auth/forgot-password | 找回密码 |

### 4.2 用户接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/users/{id} | 用户信息 |
| PUT | /api/v1/users/{id} | 更新资料 |
| PUT | /api/v1/users/{id}/avatar | 上传头像 |
| GET | /api/v1/users/{id}/follows | 关注列表 |
| GET | /api/v1/users/{id}/fans | 粉丝列表 |
| POST | /api/v1/users/{id}/follow | 关注 |

### 4.3 视频/稿件接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/v1/videos | 发布稿件 |
| GET | /api/v1/videos/{id} | 稿件详情 |
| PUT | /api/v1/videos/{id} | 更新稿件 |
| DELETE | /api/v1/videos/{id} | 删除稿件 |
| GET | /api/v1/videos | 分页列表（分区/关键词） |
| POST | /api/v1/videos/{id}/play | 播放（计播放量） |

### 4.4 互动接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/v1/videos/{id}/like | 点赞 |
| DELETE | /api/v1/videos/{id}/like | 取消点赞 |
| POST | /api/v1/videos/{id}/favorite | 收藏 |
| GET | /api/v1/videos/{id}/comments | 评论列表 |
| POST | /api/v1/videos/{id}/comments | 发评论 |
| DELETE | /api/v1/comments/{id} | 删评论 |
| POST | /api/v1/videos/{id}/share | 分享（计数） |

### 4.5 弹幕/实时（WebSocket）

```
WS /ws?token=<jwt>&roomId=<videoId>
```

| 消息类型 | 说明 |
|----------|------|
| danmaku.send | 发弹幕 |
| danmaku.list | 弹幕列表 |
| live.join/leave | 直播间进出 |
| live.gift | 送礼 |
| notify.message | 消息通知 |

### 4.6 搜索接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/search/videos | 搜索视频 |
| GET | /api/v1/search/users | 搜索用户 |
| GET | /api/v1/hot/rank | 热榜 |
| GET | /api/v1/recommend/videos | 推荐列表 |

### 4.7 转码/媒体（异步）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/v1/media/transcode | 提交转码任务 |
| GET | /api/v1/media/tasks/{id} | 查询转码进度 |
| POST | /api/v1/media/ai/subtitle | AI 字幕 |
| POST | /api/v1/media/ai/summary | AI 总结 |
| GET | /api/v1/media/streams/{id} | 获取播放地址（HLS） |

### 4.8 广告接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/ads/display | 获取广告位 |
| POST | /api/v1/ads/impression | 展示上报 |
| POST | /api/v1/ads/click | 点击上报 |

### 4.9 商城/订单接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/products | 商品列表 |
| POST | /api/v1/orders | 创建订单 |
| GET | /api/v1/orders/{id} | 订单详情 |
| POST | /api/v1/orders/{id}/pay | 支付 |
| POST | /api/v1/orders/{id}/refund | 退款 |

### 4.10 管理接口（admin）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/v1/admin/videos/{id}/review | 审核稿件 |
| GET | /api/v1/admin/users | 用户管理 |
| PUT | /api/v1/admin/users/{id}/status | 禁/解禁 |
| GET | /api/v1/admin/comments | 评论管理 |
| GET | /api/v1/admin/stats | 数据统计 |
| GET | /api/v1/admin/login-logs | 登录日志 |

## 5. gRPC 服务定义（服务间）

```proto
syntax = "proto3";

package mybilibili.core;

// 用户服务
service UserService {
    rpc GetUser(GetUserRequest) returns (User);
    rpc UpdateUser(UpdateUserRequest) returns (User);
    rpc GetUserFollows(PageRequest) returns (UserPage);
}

// 内容服务
service VideoService {
    rpc GetVideo(GetVideoRequest) returns (Video);
    rpc ListVideos(PageRequest) returns (VideoPage);
    rpc PublishVideo(Video) returns (Video);
}

// 互动服务
service InteractionService {
    rpc Like(LikeRequest) returns (Empty);
    rpc Comment(CommentRequest) returns (Comment);
    rpc Favorite(FavoriteRequest) returns (Empty);
}
```

**服务发现命名：**
- `service://core/UserService.GetUser`
- `service://media/VideoService.GetVideo`

## 6. 网关路由映射

```
/api/v1/users/*        → core
/api/v1/videos/*       → core
/api/v1/comments/*     → core
/api/v1/search/*       → search
/api/v1/hot/*          → search
/api/v1/media/*        → media
/api/v1/ads/*          → ads
/api/v1/products/*     → store
/api/v1/orders/*       → store
/ws                    → realtime
/api/v1/admin/*        → admin（独立鉴权）
```

## 7. 版本兼容

- URL 带版本：`/api/v1/`
- 破坏性变更 → 升级 v2，v1 保留过渡期
- 服务间 gRPC：proto 向后兼容（新增字段，不删不改）

## 8. 日志与追踪

- 每个请求带 requestId（网关生成，穿透到服务）
- 服务间传递：gRPC metadata
- 日志结构化：`{requestId, service, method, latency, code}`
- 出错可全链路串联排查
