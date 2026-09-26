---
title: 'Bilibili WAP → Flutter 全平台迁移计划'
date: 2026-08-12
---

# Bilibili WAP → Flutter 全平台迁移计划

## 1. 项目现状

### 1.1 当前技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vue 3 + Vite 4 + Vue Router 4 |
| 播放器 | Artplayer 5.1.6 + artplayer-plugin-danmuku 5.1.4 + hls.js 1.5.13 |
| HTTP | Axios (baseURL: `/api`, 代理到 `localhost:8080`) |
| 样式 | SCSS |
| 后端 | Java Spring Boot (mybilibili-cloud) + Go (mybilibili) |

### 1.2 当前页面清单 (24 个路由)

| 分类 | 页面 | 路由 | 说明 |
|------|------|------|------|
| 首页 | 首页 | `/m/index` | 推荐视频 + 轮播图 + 分区入口 |
| 认证 | 登录 | `/m/login` | 登录页 |
| 分区 | 分区详情 | `/m/channel/:rId` | 按分区浏览视频 |
| 排行 | 排行榜 | `/m/ranking/:rId` | 分区排行榜 |
| 视频 | 视频详情 | `/m/video/:aId` | 播放器 + 弹幕 + 评论 + 互动 + 分P |
| 搜索 | 搜索首页 | `/m/search` | 搜索入口 |
| 搜索 | 热搜榜 | `/m/search/hot` | bilibili 热搜 |
| 搜索 | 搜索结果 | `/m/search/result` | 搜索结果列表 |
| 消息 | 消息列表 | `/m/message` | 私信列表 |
| 消息 | 私信聊天 | `/m/message/chat/:id` | 聊天详情 |
| 创作 | 创作中心 | `/m/creator` | 创作数据概览 |
| 空间 | 我的 | `/m/space` | 个人中心 |
| 空间 | 历史记录 | `/m/space/history` | 观看历史 |
| 空间 | 我的收藏 | `/m/space/favorite` | 收藏夹 |
| 空间 | 稿件管理 | `/m/space/manuscripts` | 稿件列表 |
| 空间 | 资料编辑 | `/m/space/profile/edit` | 编辑个人信息 |
| 空间 | 我的好友 | `/m/space/:mId/friends` | 关注/粉丝列表 |
| 空间 | UP主主页 | `/m/space/:mId` | UP主个人页 |
| 动态 | 关注动态 | `/m/dynamic` | 关注的人的动态 |
| 直播 | 直播首页 | `/m/live` | 直播推荐 |
| 直播 | 直播列表 | `/m/live/list` | 直播列表 |
| 直播 | 直播分类 | `/m/live/areas` | 分类浏览 |
| 直播 | 直播间 | `/m/live/:roomId` | 直播播放 + 弹幕聊天 |
| 其他 | 404 | `/:pathMatch(.*)*` | 页面未找到 |

---

## 2. 目标状态

### 2.1 目标平台

- Android
- iOS
- Windows
- Linux

### 2.2 目标技术栈

| 层级 | 技术选型 |
|------|---------|
| 框架 | Flutter 3.x |
| 状态管理 | Riverpod（推荐）或 Bloc |
| 路由 | go_router |
| HTTP | dio |
| 播放器 | media_kit（全平台，基于 mpv/libmpv） |
| 弹幕 | 自研 Flutter Canvas 弹幕组件 |
| 本地存储 | shared_preferences + flutter_secure_storage |
| 图片缓存 | cached_network_image |
| WebSocket | web_socket_channel |

### 2.3 播放器选型对比

| 包 | Android | iOS | Windows | Linux | HLS | 弹幕 | DLNA | PiP |
|----|---------|-----|---------|-------|-----|------|------|-----|
| **media_kit** | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ 需自研 | ❌ 需自研 | ❌ 需自研 |
| mohe_native_player | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ 内置 | ✅ 内置 | ✅ 内置 |
| video_player (官方) | ✅ | ✅ | ⚠️ 有限 | ⚠️ 有限 | ⚠️ 需处理 | ❌ | ❌ | ❌ |

**结论**：用 **media_kit** 做全平台播放内核，弹幕/DLNA/PiP 自研。

---

## 3. 后端 API 清单

所有 API 基础路径: `/api`，需要 `Authorization: Bearer <token>` 和 `X-User-Id`、`X-Client-Platform: wap` 头。

### 3.1 认证

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/auth/login` | 登录 |
| POST | `/auth/register` | 注册 |

### 3.2 用户

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/user/{id}` | 获取用户信息 |
| PUT | `/user/{id}` | 更新用户信息 |
| GET | `/user/{id}/following` | 关注列表 |
| GET | `/user/{id}/followers` | 粉丝列表 |

### 3.3 视频/稿件

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/manuscript/{aId}` | 稿件详情（含分P、播放地址） |
| GET | `/manuscript/recommended` | 推荐视频 |
| GET | `/manuscript/hot` | 热门视频 |
| GET | `/manuscript/list?page=&size=` | 分页视频列表 |
| GET | `/manuscript/category/{categoryId}` | 分类视频 |
| GET | `/manuscript/user/{userId}?page=&size=` | 用户稿件 |
| GET | `/manuscript/me/list` | 我的稿件 |
| GET | `/manuscript/me/stats` | 我的稿件统计 |
| POST | `/manuscript/{id}/publish` | 发布稿件 |
| POST | `/manuscript/{id}/unpublish` | 取消发布 |
| DELETE | `/manuscript/{id}` | 删除稿件 |

### 3.4 视频互动

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/manuscript/{id}/status` | 互动状态（点赞/投币/收藏） |
| POST | `/manuscript/{id}/like` | 点赞 |
| DELETE | `/manuscript/{id}/like` | 取消点赞 |
| POST | `/manuscript/{id}/coin?coinCount=` | 投币 |
| POST | `/manuscript/{id}/collect` | 收藏 |
| DELETE | `/manuscript/{id}/collect` | 取消收藏 |
| POST | `/manuscript/{id}/share` | 分享 |

### 3.5 评论

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/comment/list?manuscriptId=&page=&size=&sort=` | 评论列表 |
| POST | `/comment/add` | 发表评论（form-urlencoded） |
| POST | `/comment/reply` | 回复评论 |
| POST | `/comment/{id}/like` | 点赞评论 |
| DELETE | `/comment/{id}/like` | 取消点赞 |
| GET | `/comment/{id}/replies?page=&size=` | 回复列表 |

### 3.6 弹幕

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/danmaku/video/{videoId}` | 获取弹幕列表 |
| POST | `/danmaku/send` | 发送弹幕 |

### 3.7 搜索

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/search/videos?keyword=&page=&size=&sort=` | 搜索视频 |
| GET | `/search/suggest?keyword=` | 搜索建议 |
| GET | `/search/hot` | 热搜榜 |

### 3.8 分类/排行

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/category` | 分类列表 |

### 3.9 推荐

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/recommend/related/{aId}?size=` | 相关推荐 |

### 3.10 关注/动态

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/follow/{userId}` | 关注 |
| DELETE | `/follow/{userId}` | 取消关注 |
| GET | `/follow/check/{userId}` | 检查关注状态 |
| GET | `/dynamic/list?page=&size=` | 动态列表 |
| GET | `/dynamic/following?page=&size=` | 关注动态 |
| GET | `/dynamic/user/{userId}?page=&limit=` | 用户动态 |
| POST | `/dynamic/publish` | 发布动态（FormData） |
| DELETE | `/dynamic/{id}` | 删除动态 |
| POST | `/dynamic/like/{id}` | 点赞动态 |
| DELETE | `/dynamic/like/{id}` | 取消点赞 |
| GET | `/dynamic/like/status/{id}` | 点赞状态 |
| GET | `/dynamic/comment/list?dynamicId=&page=&size=` | 动态评论 |
| POST | `/dynamic/comment/add` | 发表动态评论 |
| DELETE | `/dynamic/comment/delete/{id}` | 删除评论 |
| POST | `/dynamic/comment/like/{id}` | 点赞评论 |
| DELETE | `/dynamic/comment/like/{id}` | 取消点赞 |

### 3.11 消息

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/message/conversations` | 会话列表 |
| GET | `/message/unread/counts` | 未读计数 |

### 3.12 历史记录

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/watch-history?page=&size=` | 历史记录列表 |
| DELETE | `/watch-history` | 清空历史 |
| DELETE | `/watch-history/{id}` | 删除单条 |

### 3.13 收藏

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/manuscript/user/collections` | 收藏的视频 |
| GET | `/manuscript/favorite/folders` | 收藏夹列表 |
| GET | `/manuscript/favorite/folders/{id}/videos` | 收藏夹内容 |

### 3.14 直播

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/live/room/list` | 直播间列表 |
| GET | `/live/room/{id}` | 直播间详情 |
| WebSocket | `wss://{host}/live/danmaku` | 直播弹幕（发送 `{roomId}` 加入） |

### 3.15 轮播图

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/banner-images/home` | 首页轮播图 |

---

## 4. Flutter 项目结构

```
mybilibili_flutter/
├── lib/
│   ├── main.dart
│   ├── app.dart                        # MaterialApp + 路由配置
│   │
│   ├── core/                           # 核心基础设施
│   │   ├── api/
│   │   │   ├── client.dart             # Dio 封装（拦截器、token、错误处理）
│   │   │   ├── api_endpoints.dart      # 所有 API 端点常量
│   │   │   └── interceptors.dart       # 认证拦截器、日志拦截器
│   │   ├── config/
│   │   │   ├── app_config.dart         # 环境配置（base URL 等）
│   │   │   └── theme.dart              # B站粉色主题
│   │   ├── storage/
│   │   │   └── local_storage.dart      # 本地存储封装
│   │   └── utils/
│   │       ├── format.dart             # 数字/时间格式化
│   │       └── constants.dart          # 常量
│   │
│   ├── models/                         # 数据模型
│   │   ├── user.dart
│   │   ├── video.dart
│   │   ├── comment.dart
│   │   ├── danmaku.dart
│   │   ├── dynamic.dart
│   │   ├── live_room.dart
│   │   ├── message.dart
│   │   ├── category.dart
│   │   └── ...
│   │
│   ├── services/                       # 业务 API 调用
│   │   ├── auth_service.dart
│   │   ├── user_service.dart
│   │   ├── video_service.dart
│   │   ├── comment_service.dart
│   │   ├── danmaku_service.dart
│   │   ├── search_service.dart
│   │   ├── live_service.dart
│   │   ├── dynamic_service.dart
│   │   ├── message_service.dart
│   │   ├── interaction_service.dart
│   │   ├── favorite_service.dart
│   │   └── history_service.dart
│   │
│   ├── providers/                      # 状态管理 (Riverpod)
│   │   ├── auth_provider.dart
│   │   ├── user_provider.dart
│   │   ├── video_provider.dart
│   │   └── ...
│   │
│   ├── widgets/                        # 通用组件
│   │   ├── video_card.dart             # 视频卡片（封面+标题+播放数+弹幕数）
│   │   ├── user_avatar.dart            # 用户头像
│   │   ├── loading_widget.dart
│   │   ├── error_widget.dart
│   │   ├── empty_widget.dart
│   │   └── danmaku_overlay.dart        # 弹幕覆盖层（Canvas 绘制）
│   │
│   ├── features/                       # 功能模块
│   │   ├── auth/
│   │   │   ├── login_page.dart
│   │   │   └── auth_provider.dart
│   │   │
│   │   ├── home/
│   │   │   ├── home_page.dart          # 首页（轮播图+推荐+热门）
│   │   │   ├── banner_widget.dart
│   │   │   └── partition_grid.dart
│   │   │
│   │   ├── video/
│   │   │   ├── video_detail_page.dart  # 视频详情（播放器+互动+评论+推荐）
│   │   │   ├── video_player.dart       # 播放器封装（media_kit）
│   │   │   ├── danmaku_controls.dart   # 弹幕开关+设置+发送
│   │   │   ├── comment_section.dart    # 评论区
│   │   │   ├── interaction_bar.dart    # 点赞/投币/收藏/分享
│   │   │   ├── part_selector.dart      # 分P选择器
│   │   │   └── related_videos.dart     # 相关推荐
│   │   │
│   │   ├── live/
│   │   │   ├── live_index_page.dart
│   │   │   ├── live_list_page.dart
│   │   │   ├── live_area_page.dart
│   │   │   └── live_room_page.dart     # 直播间（播放器+弹幕聊天）
│   │   │
│   │   ├── search/
│   │   │   ├── search_page.dart
│   │   │   ├── hot_rank_page.dart
│   │   │   └── search_result_page.dart
│   │   │
│   │   ├── dynamic/
│   │   │   └── dynamic_page.dart
│   │   │
│   │   ├── message/
│   │   │   ├── message_page.dart
│   │   │   └── chat_page.dart
│   │   │
│   │   ├── space/
│   │   │   ├── space_page.dart
│   │   │   ├── history_page.dart
│   │   │   ├── favorite_page.dart
│   │   │   ├── manuscript_manage_page.dart
│   │   │   ├── profile_edit_page.dart
│   │   │   ├── friend_list_page.dart
│   │   │   └── up_user_page.dart
│   │   │
│   │   ├── channel/
│   │   │   └── channel_page.dart
│   │   │
│   │   ├── ranking/
│   │   │   └── ranking_page.dart
│   │   │
│   │   └── creator/
│   │       └── creator_center_page.dart
│   │
│   └── router/
│       └── app_router.dart             # go_router 路由定义
│
├── assets/                             # 静态资源
│   ├── images/
│   └── icons/
│
├── pubspec.yaml
└── README.md
```

---

## 5. 核心模块设计

### 5.1 视频播放器（media_kit）

```dart
// 播放器核心能力
- 播放/暂停/停止/跳转
- 音量/亮度/播放速度
- HLS/DASH 流播放
- 全屏切换
- 手势操作（左右滑动跳转、上下滑动亮度/音量）
- 自动隐藏控制栏

// media_kit 用法概要
final player = Player();
final controller = VideoController(player);
player.open(Media(url));

// 渲染
Video(controller: controller)
```

### 5.2 弹幕系统（自研）

```dart
// 核心：Canvas 绘制滚动弹幕
class DanmakuOverlay extends StatefulWidget {
  // 数据：List<DanmakuItem> items
  // 每个 item: { text, color, time, type (scroll/top/bottom) }
  // 动画：定时器驱动，每帧重绘
  // 碰撞检测：避免弹幕重叠
}

// 依赖包：无（纯 Flutter Canvas）
// 参考：flutter_danmaku、ns_danmaku 等开源实现
```

### 5.3 直播弹幕（WebSocket）

```dart
// WebSocket 连接
final ws = WebSocketChannel.connect(Uri.parse('wss://$host/live/danmaku'));
ws.sink.add(jsonEncode({'roomId': roomId}));
ws.stream.listen((message) {
  // 解析 DANMU_MSG，添加到弹幕列表
});
```

### 5.4 本地存储

| 存储项 | 方案 |
|--------|------|
| Token | flutter_secure_storage（加密） |
| 用户信息 | shared_preferences |
| 播放历史 | SQLite（sqflite） |
| 设置项 | shared_preferences |

---

## 6. 迁移策略

### 6.1 分阶段实施

**Phase 1 - 基础框架（1-2 周）**
- Flutter 项目初始化
- 路由配置（go_router）
- 主题（B站粉色 #FB7299）
- HTTP 客户端（Dio + 拦截器）
- 本地存储
- 通用组件（VideoCard、Loading、Error、Empty）

**Phase 2 - 核心页面（2-3 周）**
- 登录页
- 首页（轮播图 + 推荐 + 分区）
- 视频详情页（播放器 + 弹幕 + 评论 + 互动）
- 搜索（首页 + 热搜 + 结果）

**Phase 3 - 播放器增强（1-2 周）**
- media_kit 集成
- 弹幕 Canvas 组件
- 手势控制
- 分P切换
- 画质切换

**Phase 4 - 用户系统（1-2 周）**
- 个人中心
- 历史记录
- 收藏夹
- 稿件管理
- 资料编辑

**Phase 5 - 社交功能（1 周）**
- 关注动态
- 消息/私信
- UP主主页

**Phase 6 - 直播（1 周）**
- 直播列表/分类
- 直播间播放
- WebSocket 弹幕

**Phase 7 - 桌面端适配（1 周）**
- 响应式布局
- 键盘快捷键
- 窗口管理

### 6.2 关键依赖包

```yaml
dependencies:
  # 框架
  flutter_riverpod: ^2.x       # 状态管理
  go_router: ^14.x             # 路由
  dio: ^5.x                    # HTTP
  
  # 播放器
  media_kit: ^1.x              # 播放内核
  media_kit_video: ^1.x        # 视频渲染
  media_kit_libs_video: ^1.x   # 平台库
  
  # UI
  cached_network_image: ^3.x   # 图片缓存
  flutter_screenutil: ^5.x     # 屏幕适配
  shimmer: ^3.x                # 加载骨架屏
  pull_to_refresh: ^2.x        # 下拉刷新
  
  # 工具
  shared_preferences: ^2.x     # 简单存储
  flutter_secure_storage: ^9.x # 安全存储
  web_socket_channel: ^2.x     # WebSocket
  path_provider: ^2.x          # 文件路径
  intl: ^0.19.x                # 国际化/格式化
```

---

## 7. 注意事项

### 7.1 API 兼容性
- 后端 API 不变，Flutter 端需要完全复用现有端点
- 注意 API 客户端的请求头：`Authorization`、`X-User-Id`、`X-Client-Platform`
- 响应格式：后端返回 `{ code, data }` 结构，需要统一解析

### 7.2 跨平台差异
- **桌面端**：需要更大的触控区域、键盘导航、窗口管理
- **移动端**：手势操作、状态栏适配、安全区域
- **播放器**：media_kit 在各平台的行为可能有差异，需要分别测试

### 7.3 弹幕性能
- Canvas 绘制弹幕在大量弹幕时可能有性能问题
- 需要实现弹幕池、碰撞检测优化、帧率控制
- 桌面端性能优于移动端，可以显示更多弹幕

### 7.4 与 Web 版共存
- 可以共享同一套后端 API
- 数据格式完全兼容
- 部署时可以同时提供 Web 版和 Flutter 版
