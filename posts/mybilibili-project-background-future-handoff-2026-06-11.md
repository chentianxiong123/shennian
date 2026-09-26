---
title: 'mybilibili-cloud 项目背景与未来方向交接'
date: 2026-06-11
---

# mybilibili-cloud 项目背景与未来方向交接

> 时间: 2026-06-11  
> 仓库: `D:\files\mybilibili-next\mybilibili-cloud`  
> 分支: `feature/manuscript-edit-review-20260531`  
> 当前 HEAD: `8f48a6d feat(wap): add mobile creator and discovery pages`  
> 远端关系: 本地分支相对 `origin/feature/manuscript-edit-review-20260531` 领先 1 个提交  
> 交接重点: 说明项目背景、当前真实状态、主要技术边界、未来方向和下一阶段优先级。

## 1. 项目一句话背景

`mybilibili-cloud` 是一个仿 B 站的视频平台学习项目，目标不是只做一个静态页面，而是把“用户端、移动端、后台管理、投稿审核、播放、弹幕、评论、搜索推荐、直播、AI、对象存储、消息队列、微服务治理”等能力尽量串成一个能实际运行和演示的完整系统。

这个项目已经超过普通 CRUD 练手项目的范围。它现在更像一个“中型视频平台原型”: 前端有 Web、WAP、管理后台、Studio；后端按 Spring Cloud 微服务拆分；基础设施依赖 Docker 中的 MySQL、Redis、Nacos、RocketMQ、Elasticsearch、MinIO、MongoDB、SRS 等组件。

当前阶段的核心任务，不是继续无边界堆功能，而是把已经做出来的功能整理到稳定、统一、可演示、可维护的状态。

## 2. 项目最初想解决什么

项目最初围绕 B 站类平台的核心体验展开:

- 用户可以注册、登录、浏览首页视频、进入分区、搜索内容。
- 用户可以投稿视频，平台保存稿件、封面、视频文件和转码结果。
- 视频详情页可以播放视频、显示作者、发布时间、播放量、评论、弹幕等信息。
- 用户可以点赞、收藏、投币、关注、发动态、私信。
- 管理员可以审核稿件、管理用户、管理权限、配置轮播图、维护违禁词、处理工单和反馈。
- 移动端 WAP 尽量模仿真实 B 站移动体验，包括首页、搜索、热榜、消息、空间、关注粉丝、编辑资料、稿件管理等。
- Studio 和直播方向用于展示创作者工具链，不只停留在“上传视频”。

后来项目逐步加入了 AI 字幕、AI 摘要、AI 客服、内容审核、直播、会议、连麦、推荐算法、运营后台、索引管理等能力，因此现在最重要的问题变成了: 功能很多，但边界必须收敛，否则启动、联调、维护都会越来越困难。

## 3. 当前架构现状

当前比较合理的后端服务边界如下:

| 模块 | 端口 | 定位 |
|------|------|------|
| `mybilibili-gateway` | 8080 | API 网关，统一路由、JWT 鉴权、跨服务入口 |
| `mybilibili-account-social` | 8081 | 用户、登录注册、个人资料、关注粉丝、管理员和权限等账号社交能力 |
| `mybilibili-video-media` | 8082 | 稿件、视频、封面、对象存储、转码、播放、分类、轮播图、直播/会议等媒体主链路 |
| `mybilibili-search-recommend` | 8084 | Elasticsearch 搜索、索引管理、推荐算法、推荐参数、运营类能力 |
| `mybilibili-content-interaction` | 8085 | 评论、弹幕、点赞、收藏、投币、动态、观看历史等高频互动能力 |
| `mybilibili-ai` | 8088 | AI 字幕、AI 摘要、AI 客服、AI 审核等 AI 能力 |
| `mybilibili-common` | - | 公共 DTO、VO、工具、配置、文档模型 |
| `mybilibili-mq` | - | RocketMQ 消息定义和公共消息类型 |

前端应用:

| 应用 | 定位 |
|------|------|
| `mybilibili-web` | PC 用户端，首页、播放页、搜索、登录注册、投稿等 |
| `mybilibili-wap` | 移动端，正在按真实 B 站移动端体验补页面和细节 |
| `mybilibili-admin-web` | 后台管理，用户、权限、轮播、推荐参数、工单、索引等 |
| `mybilibili-studio-web` | 创作者剪辑/素材/云导出方向 |
| `mybilibili-live-desktop` | OBS/直播桌面端方向，当前不应重写，适合逐步接业务和清理旧残留 |

基础设施原则:

- 当前本地库已经停用，数据库和中间件应以 Docker 环境为准。
- 不建议现在上 Kubernetes，本地机器资源和项目阶段不匹配。
- 不建议现在分库分表，业务量和一致性压力还没有到那个阶段。
- 不建议现在先做 CI/CD，应该先保证本地 Docker 基础设施、微服务启动、核心业务流和前端演示链路稳定。

## 4. 当前完成度判断

从“自己能玩”到“能发行给别人看”，中间主要差在稳定性、数据一致性、启动流程、演示闭环和质量验证。

当前项目已经具备这些基础:

- 微服务主结构已经形成。
- Web/WAP/后台多端都有界面。
- 视频上传、稿件、播放、搜索、推荐、互动、关注粉丝、后台管理等主功能已经有实现基础。
- Docker 基础设施已经建立，MinIO、ES、RocketMQ、Nacos 等都已经纳入本地运行环境。
- WAP 端已经开始向真实移动端体验靠拢。
- 推荐参数已经开始可配置化，推荐结果可以加入随机性和权重调节。
- 首页视频卡片作者、时长、发布日期等字段正在向统一 ES 文档源收敛。

但还不能当成稳定发行版:

- 当前工作区不是干净状态，还有多处未提交改动。
- 后端和前端仍有接口字段、ES 索引字段、数据库表结构之间的对齐问题。
- Docker 基础设施曾出现 Nacos 内存、数据库表缺失、字段缺失等问题，说明初始化脚本和实际容器数据之间还没有完全统一。
- 一些页面已经能看，但还缺系统性真测。
- WAP 端和 Web 端仍在做 UI 细节补齐。
- Studio 云导出链路已经推进到任务、素材、manifest、时间线输出方向，但还不能当作完整生产剪辑渲染器。

## 5. 最近关键进展

最近提交记录里比较重要的节点:

- `8f48a6d feat(wap): add mobile creator and discovery pages`
  - WAP 端补了创作中心、搜索、热榜、聊天、稿件管理、关注粉丝、空间、编辑资料等页面方向。
  - 修正了“稿件管理”和“创作中心”入口接错位置的问题。

- `ce36666 feat: render studio export timeline output`
  - Studio 云导出继续向时间线输出推进。

- `131511a feat: prepare studio export render manifest`
  - Studio 云导出后端准备层从“收到任务”推进到“准备素材和生成渲染清单”。

- `cb1ba8d feat: clarify studio editor workflows`
  - Studio 前端工作流更清晰，文本/字幕/图形等入口不再混乱。

- `b5556e6 feat: upload studio assets to object storage`
  - Studio 素材开始进入对象存储，为云导出做准备。

- `4aa5ccc feat: add studio cloud export task pipeline`
  - 建立 Studio 云导出任务 API、Redis 状态、RocketMQ 消息链路。

- `8522f37 refactor: move messaging into interaction service`
  - 消息能力向互动服务边界收敛。

这些提交说明项目主线已经从“堆功能”转到“收敛边界、补链路、做可演示闭环”。

## 6. 当前工作区真实状态

截至本交接文档生成时，工作区仍有大量未提交改动。不要把这些改动误判为已经稳定完成。

当前分支:

```powershell
feature/manuscript-edit-review-20260531
```

当前本地相对远端:

```text
ahead 1
```

当前未提交区大致包括:

- `mybilibili-wap`
  - 移动端首页头部、Tab、视频卡片、底部导航等细节调整。
  - WAP 首页正在向目标截图做轻微调整，不是完整重设计。

- `mybilibili-web`
  - 首页视频格子字段、登录注册面板、路由等相关调整。
  - 重点是统一视频卡片数据源，避免未登录和登录状态下作者名、发布时间等字段不一致。

- `mybilibili-search-recommend`
  - ES 文档模型、索引管理、推荐配置、推荐随机性等相关调整。
  - 方向是让首页、搜索、推荐尽量使用统一 ES 文档源。

- `mybilibili-common`
  - 公共 `ManuscriptDocument` 字段扩展，和 ES 文档统一有关。

- `mybilibili-admin-web`
  - 推荐配置、后台管理菜单、工单/角色/管理员等页面细节调整。

- `scripts/docker-compose-infra.yml`
  - Docker 基础设施参数调整，之前重点是 Nacos 内存和容器稳定性。

重要提醒:

- 不要随便 `git reset --hard`。
- 不要把所有未提交文件一次性提交，应该按主题拆分。
- 如果接手继续做，先 `git diff --stat` 和 `git diff --check`。
- 如果只想保留 WAP 首页微调，就只 stage WAP 相关文件。

## 7. 项目当前最重要的技术判断

### 7.1 首页视频卡片应统一数据源

最近反复出现的问题是: 首页视频格子有时拿不到作者名、发布日期、时长等字段。根因不应该靠前端一层层兜底解决，而应该回到第一性原理:

- 首页卡片、搜索卡片、推荐卡片本质上展示的是同一类视频摘要。
- 这类摘要应来自统一的 ES 文档或统一的后端 DTO。
- ES 文档必须包含卡片展示所需的最小字段:
  - 视频/稿件 ID
  - 标题
  - 封面
  - 作者 ID
  - 作者名
  - 作者头像
  - 时长秒数
  - 播放量
  - 评论数
  - 发布时间/发布日期
  - 分区、标签等推荐搜索字段
- 如果 ES 没字段，就应该补索引字段并重建索引，而不是在前端拼很多分支。

未来应坚持: 前端只做轻量 normalize，不承担跨服务补数据的主责任。

### 7.2 Docker 是当前唯一可信基础设施

用户已经明确: 本地库停用，全部库在 Docker。

后续排查数据库问题时，不要再优先查本机 MySQL。应该先查:

```powershell
docker ps
docker compose -f scripts/docker-compose-infra.yml ps
docker logs <container>
docker exec -it <mysql-container> mysql -uroot -p
```

之前出现过:

- `support_tickets` 表不存在。
- `live_rooms.category` 字段不存在。
- Nacos 内存不足导致服务注册/启动异常。

这说明初始化 SQL、迁移 SQL、实际容器数据三者需要做一次系统对账。

### 7.3 WAP 端要做“像真实 App”的移动体验

WAP 端方向不是简单把 PC 页面缩小，而是贴近真实移动端:

- 首页头部、搜索框、头像、消息、游戏入口、Tab、轮播图、视频卡片、底部导航都要按移动端节奏调整。
- 所有页面统一白色风格，夜间模式入口可以保留，但默认不要暗色化。
- WAP 端不要出现不必要的垂直滚动条样式，避免页面畸变。
- 我的、关注、粉丝、空间、编辑资料、稿件管理、创作中心、搜索、热榜、聊天等页面要形成完整路径。

当前 WAP 已经进入“细节对齐和可用性验证”阶段。

### 7.4 推荐系统要可配置，但不要脱离业务直觉

推荐算法当前适合走轻量可解释路线:

- 登录用户: 基于用户画像、分类偏好、标签偏好、近期行为做加权。
- 未登录用户: 热门、最新、随机扰动结合。
- 所有人都应加入少量随机性，避免每次首页完全一样。
- 推荐参数放到后台管理中可配置，方便演示算法可调性。

推荐不需要现在追求工业级复杂模型，先做到“字段完整、结果稳定、参数可调、可解释”。

### 7.5 Studio 和直播是展示亮点，但不能拖垮主线

Studio、直播、桌面端这些方向很有展示价值，但工程风险也更高。

建议:

- Studio 先完成“素材上传对象存储 -> 云导出任务 -> 准备素材 -> manifest -> 基础 FFmpeg 输出”的最小闭环。
- 不要现在做完整专业剪辑器。
- 直播桌面端不要现在重写技术栈，先保留 OBS 依赖并接业务。
- 主线仍然是视频平台: 首页、播放、投稿、搜索、互动、后台、WAP。

## 8. 未来方向

### 8.1 第一阶段: 先把项目变成“稳定能演示”

目标: 本地 Docker 基础设施可启动，核心微服务可启动，Web/WAP/后台可打开，主链路能走通。

优先事项:

1. 固化 Docker 基础设施
   - Nacos 内存参数确认。
   - MySQL 容器数据和初始化 SQL 对齐。
   - RocketMQ、Redis、ES、MinIO、MongoDB、SRS 状态检查。
   - 补一份明确的“从零启动命令”。

2. 对齐数据库结构
   - 确认 `support_tickets`、`live_rooms.category` 等缺失表/字段。
   - 把实际需要的 SQL 合并到初始化脚本或迁移脚本。
   - 避免代码字段比数据库字段超前。

3. 对齐 ES 索引结构
   - `ManuscriptDocument` 只保留一份权威定义，优先放公共模块。
   - 补齐作者、时长、发布日期等首页卡片字段。
   - 管理后台提供重建索引入口。
   - 重建索引后验证未登录首页和登录首页卡片一致。

4. 核心页面真测
   - Web 首页、搜索、播放页、登录注册。
   - WAP 首页、搜索、热榜、我的、空间、关注粉丝、编辑资料、稿件管理。
   - 管理后台用户、角色、权限、轮播、推荐配置、索引管理。

### 8.2 第二阶段: 形成“可讲清楚的项目亮点”

目标: 不是功能列表越长越好，而是每个亮点都能演示、能解释、能体现工程价值。

建议主打这些亮点:

- Spring Cloud 微服务视频平台。
- Docker 一键基础设施。
- MinIO 对象存储管理视频、封面、Studio 素材。
- Elasticsearch 统一搜索和推荐索引。
- RocketMQ 解耦视频处理、互动、AI、Studio 导出。
- Artplayer 播放器 + 弹幕能力。
- Web/WAP/后台三端完整。
- 推荐算法参数后台可配置。
- AI 字幕、AI 摘要、AI 客服、AI 审核作为扩展亮点。
- Studio 云导出作为创作者工具亮点。

这些点比“页面很多但到处报错”更有说服力。

### 8.3 第三阶段: 做发行前整理

如果未来要给别人看，至少需要:

- 一份 `README` 重写版，按真实启动流程写。
- 一份 `.env.example` 和 Docker 配置说明。
- 一份初始化 SQL 和测试数据说明。
- 一套演示账号:
  - 普通用户
  - 创作者
  - 管理员
  - 超级管理员
- 一套演示视频/封面/弹幕/评论/关注粉丝数据。
- 一套“演示路线”:
  - 打开首页
  - 登录
  - 看视频
  - 发弹幕/评论
  - 搜索
  - 进入作者空间
  - 后台改推荐参数
  - 重建 ES 索引
  - WAP 查看同样内容

发行不是简单打包，而是让别人按文档能启动、能理解、能看到亮点。

## 9. 下一步最建议做什么

建议下一步按这个顺序，不要跳:

1. 先保存当前工作
   - 如果 WAP 首页微调已经满意，单独提交 WAP 首页相关文件。
   - 如果 Web/ES/推荐改动还在调，先不要混进 WAP 提交。

2. 检查 Docker 基础设施
   - 确认容器都健康。
   - 确认 Nacos 内存调整后稳定。
   - 确认 MySQL 容器里表结构完整。

3. 解决首页视频卡片字段统一
   - 后端 ES 文档补齐字段。
   - 管理后台重建索引。
   - Web 未登录首页、登录首页、搜索页都用同一套 normalize。
   - WAP 后续也尽量复用同一字段语义。

4. 做核心功能测试
   - 首页视频卡片。
   - 视频播放页。
   - 评论和弹幕。
   - 登录注册切换面板。
   - WAP 我的、关注粉丝、空间、编辑资料、稿件管理。
   - 后台索引管理和推荐配置。

5. 再补 UI 细节
   - 先功能可用，再对齐截图细节。
   - WAP 首页可以继续轻微贴近真实 B 站，但不要大改导致已有路径断掉。

## 10. 建议的提交拆分

当前未提交内容很多，建议拆成几次提交:

```text
style(wap): refine mobile home layout
```

只包含:

- `mybilibili-wap/src/components/Header.vue`
- `mybilibili-wap/src/components/TabBar.vue`
- `mybilibili-wap/src/components/VideoItem.vue`
- `mybilibili-wap/src/components/BottomTabBar.vue`
- `mybilibili-wap/src/views/home/Index.vue`

```text
fix(web): normalize video card metadata
```

只包含:

- `mybilibili-web` 中首页、分类页、工具 normalize 等视频卡片字段相关改动。

```text
feat(search): unify manuscript document metadata
```

只包含:

- `mybilibili-common` 的文档模型。
- `mybilibili-search-recommend` 的 ES 索引、Mapper、Service、Repository 相关改动。

```text
feat(admin): expose recommendation tuning controls
```

只包含:

- `mybilibili-admin-web` 推荐配置和后台相关页面。
- 后端推荐配置实体/服务中对应字段。

```text
chore(infra): tune docker infrastructure resources
```

只包含:

- `scripts/docker-compose-infra.yml`
- 相关配置文件。

这样接手者可以按主题回看，也方便某一块出问题时定位。

## 11. 接手者第一组命令

建议接手时先跑:

```powershell
cd D:\files\mybilibili-next\mybilibili-cloud
git status --short --branch
git log --oneline --decorate --max-count=12
git diff --stat
```

检查 Docker:

```powershell
docker ps
docker compose -f scripts/docker-compose-infra.yml ps
```

启动或重启基础设施:

```powershell
docker compose -f scripts/docker-compose-infra.yml up -d
```

后端编译建议先按模块做:

```powershell
mvn -pl mybilibili-common,mybilibili-search-recommend -am -DskipTests compile
mvn -pl mybilibili-video-media -am -DskipTests compile
```

前端验证:

```powershell
cd mybilibili-wap
pnpm run build

cd ..\mybilibili-web
pnpm run build

cd ..\mybilibili-admin-web
pnpm run build
```

## 12. 风险和注意事项

- 不要再把本机数据库当成排查目标，当前数据库以 Docker 为准。
- 不要为了前端显示字段写复杂兜底，应优先统一后端 DTO/ES 文档。
- 不要在未验证 Docker 数据库结构前继续堆后台功能。
- 不要把 WAP 做成 PC 缩小版，移动端要按移动端交互重做。
- 不要为了像截图而牺牲已有路由和真实数据。
- 不要大规模重写 Studio 或直播桌面端，先做最小闭环。
- 不要一次性提交所有 dirty 文件。
- 不要直接物理删除旧文件，确实废弃的先移入 `.trash/` 或单独提交说明。

## 13. 总结

这个项目已经从“能自己玩”的阶段走到了“需要工程化收口”的阶段。它离“能发行给别人看”不是差一个大功能，而是差一轮系统性的稳定化:

- 基础设施稳定。
- 数据库和 ES 索引统一。
- 首页、播放、搜索、互动、后台、WAP 主链路真测。
- 提交拆分清楚。
- 文档和演示数据补齐。

下一阶段最值得投入的不是继续扩功能，而是把现有功能变成别人能启动、能理解、能演示、能复现的项目。
