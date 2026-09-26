---
title: 'MemoryNote 第二大脑 - 交接文档'
date: 2026-08-30
---

# MemoryNote 第二大脑 - 交接文档

**创建时间**: 2025-08-30  
**状态**: 进行中，部分功能可用  
**最后操作**: 清理多租户代码，替换为个人系统

---

## 一、项目概况

### 1.1 基本信息
- **项目名称**: MemoryNote (第二大脑)
- **位置**: `/mnt/shared/MemoryNote`
- **架构**: Express 后端 + Vue 3 前端 + PostgreSQL/pgvector + Neo4j
- **目标**: 个人知识操作系统，快速捕捉、自动连接、可视化、智能复习

### 1.2 当前端口
| 服务 | 端口 | 状态 |
|------|------|------|
| 前端 | 4173 | ✅ 运行中 |
| 后端 | 3033 | ⚠️ 需重启 |
| 数据库 | 5433 | ✅ PostgreSQL+pgvector |
| 图数据库 | 7687 | ✅ Neo4j 5 |

### 1.3 登录信息
- **默认密码**: `8888`
- **用户名**: 可自定义（登录页可输入）
- **登录页**: http://localhost:4173/login
- **主页**: http://localhost:4173/home

---

## 二、已完成的工作

### 2.1 架构简化（已完成）
1. **删除 26 个多租户模型** — 从 Prisma schema 中移除了 userId/workspaceId 字段
2. **保留 24 个核心模型** — 个人使用足够
3. **重写认证层** — `session.server.ts` 返回固定个人用户，无 DB 查询
4. **简化登录** — `LoginView.vue` 纯前端验证，密码硬编码为 8888
5. **Home 作为默认页** — `/home` 路由指向 `HomeDashboardView`

### 2.2 前端功能（已完成）
- [x] HomeDashboardView — 仪表盘（统计卡片、tabs、图表）
- [x] ConversationCreateView — 新建对话
- [x] LoginView — 密码登录页（用户名可编辑）
- [x] SimpleChatView — 简单聊天（mock 回复，未接 AI）
- [x] AppShell 可折叠侧边栏 — hamburger 按钮
- [x] 导航描述改为浮动 tooltip
- [x] 移除侧边栏用户信息
- [x] 移除头部用户徽章
- [x] 修复首页导航高亮逻辑

### 2.3 后端 API（部分完成）
- [x] `/api/v1/login` — 登录接口（创建 session）
- [x] `/api/v1/me` — 获取当前用户
- [x] `/api/v1/chat` — 聊天（mock 回复）
- [x] `/api/v1/chat/session/create` — 创建会话
- [x] 48 个 API 路由文件已挂载

---

## 三、当前状态

### 3.1 可用的功能
| 功能 | 状态 | 说明 |
|------|------|------|
| 登录 | ✅ | 密码 8888，用户名随意 |
| 首页仪表盘 | ✅ | 统计、图表、快速链接 |
| 聊天（基础） | ⚠️ | `/api/v1/chat` 返回 mock，未接真实 AI |
| 文档管理 | ❌ | 后端查询失败，workspaceId 字段不存在 |
| 知识捕获 | ❌ | 同上 |
| 知识图谱 | ❌ | Neo4j 查询可能正常，但 workspaceId 过滤失败 |
| 搜索 | ❌ | 依赖向量搜索，部分查询失败 |

### 3.2 问题所在
**根本原因**: 服务层代码仍在使用 `workspaceId` 和 `userId` 字段进行 Prisma 查询，但这些字段已从 schema 中删除。

**涉及文件**:
```
apps/webapp/app/services/
├── conversation.server.ts      # 9 处 workspaceId 引用
├── document.server.ts          # 6 处 workspaceId 引用  
├── wikiEntry.server.ts         # 15 处 workspaceId 引用
├── knowledgeGraph.server.ts    # 19 处 workspaceId 引用
├── vectorStorage.server.ts     # 11 处 workspaceId 引用
└── knowledge-capture.server.ts # 50 处 workspaceId 引用

apps/webapp/app/routes/api.v1.*.tsx  # 39 个路由文件
```

---

## 四、正在进行的工作（最后操作）

### 4.1 清理多租户代码
正在批量清理服务层和路由层中的 `workspaceId`/`userId` 引用：

**已完成**:
- [x] `session.server.ts` — 重写为个人用户模式
- [x] `apiAuth.server.ts` — 简化认证返回固定用户
- [x] 39 个 API 路由文件 — 替换 `authentication.workspaceId` 为 `"personal"`

**待完成**:
- [ ] 6 个服务文件 — 移除 Prisma where 子句中的 workspaceId/userId
- [ ] 测试后端启动
- [ ] 验证关键 API 正常工作

### 4.2 最后执行的操作
```bash
# 清理会话服务的 workspaceId/userId
python3 << 'PYEOF'
# 已执行的清理逻辑
# 移除了 where 子句中的 workspaceId 和 userId
PYEOF

# 结果：conversation.server.ts 仍有 9 处 workspaceId 引用
#        其他 5 个服务文件仍有数十处引用
```

---

## 五、下一步工作（优先级排序）

### P0 — 必须解决（当前阻塞）
1. **清理 6 个服务文件的 workspaceId**
   - 方案：批量 sed/Python 替换，移除 Prisma where 中的相关字段
   - 命令参考：
     ```bash
     # 移除 workspaceId 参数和 Prisma 查询中的引用
     sed -i 's/workspaceId: string,//g' *.server.ts
     sed -i '/workspaceId/d' *.server.ts  # 慎用，只删除 where 子句
     ```

2. **测试后端启动**
   ```bash
   cd /mnt/shared/MemoryNote/apps/webapp
   npx tsx server.ts
   ```

3. **验证核心 API**
   - `/api/v1/conversations` — 获取对话列表
   - `/api/v1/documents` — 获取文档列表
   - `/api/v1/knowledge/home` — 知识首页

### P1 — 重要功能
4. **配置真实 AI 模型**（需要用户提供 API Key）
   - 编辑 `.env`，设置 `OPENAI_API_KEY`
   - 修改 `api.v1.chat.tsx` 调用真实模型

5. **连接 Neo4j 知识图谱**
   - 确保 Neo4j 启动：`docker-compose up -d neo4j`
   - 测试 `/api/v1/graph/triplets`

6. **完善向量搜索**
   - 确保 pgvector 正确配置
   - 测试 `/api/v1/search`

### P2 — 体验优化
7. **美化 UI** — 当前比较简陋
8. **添加更多数据** — 导入 `/home/a1/文档/杂` 的内容
9. **实现复习机制** — RecallLog 模型已存在，需要实现调度逻辑

---

## 六、技术细节

### 6.1 关键文件
```
项目根目录: /mnt/shared/MemoryNote

架构文档: docs/architecture-closed-loop.md  (425 行)
数据库:   packages/database/prisma/schema.prisma
前端:     apps/web-vue/src/
后端:     apps/webapp/app/
  ├── routes/     # API 路由
  ├── services/   # 业务逻辑
  └── server.ts   # Express 入口
```

### 6.2 启动命令
```bash
# 启动所有服务
cd /mnt/shared/MemoryNote
pnpm dev

# 或单独启动
# 后端
cd apps/webapp && npx tsx server.ts

# 前端
cd apps/web-vue && pnpm dev

# Docker 服务
docker-compose up -d postgres neo4j
```

### 6.3 数据库迁移
```bash
# 如果修改了 schema.prisma
cd packages/database
npx prisma db push --accept-data-loss
```

---

## 七、已知问题

1. **后端启动慢** — 加载 48 个路由文件需要 10-15 秒
2. **AI 功能不可用** — `OPENAI_API_KEY` 为空，聊天是 mock 回复
3. **workspaceId 清理未完成** — 文档、知识捕获等 API 返回 500
4. **Neo4j 连接未验证** — 图谱功能未测试

---

## 八、参考资源

- **Architecture 文档**: `docs/architecture-closed-loop.md`
- **Pi 文档**: `/usr/local/lib/node_modules/@earendil-works/pi-coding-agent/README.md`
- **Prisma 文档**: `packages/database/prisma/schema.prisma`
- **代码规范**: 使用 TypeScript，ESLint 配置在项目根目录

---

## 九、联系方式

- **项目位置**: `/mnt/shared/MemoryNote`
- **当前分支**: main（建议新增功能时创建新分支）
- **Git 状态**: 最近提交 `e76bfc87 docs: 添加全链路闭环架构文档`

---

*文档生成时间: 2025-08-30*  
*由 Agnes AI 助手生成*
