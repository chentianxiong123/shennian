---
title: '归档'
date: 2026-05-26
---

# 归档

> 将会话成果归档到 `docs/archive/YYYY-MM/DD-topic.md`，供以后回看。

## 触发条件

满足以下任一条件时触发：
- 用户说：**归档、存档、记录一下、写归档**
- 用户说：**完成了、搞定了、零错误、全部搞定、总结一下**（且本次会话做了 3+ 个实质变更）
- 一个完整模块/功能做完后，agent 主动问：**"要归档吗？"**

## 文件放置

```
docs/archive/YYYY-MM/DD-短横线主题.md
```

文件名规范：
- `DD` = 当天日期
- `短横线主题` = 一句话说明主题，英文首字母小写，英文单词用 `-` 连接
- 示例：`26-chat-module-migration.md`、`27-llm-management.md`

## 格式模板

```markdown
# YYYY-MM-DD · 主题（动词 + 名词，体现成果）

> 状态 | 涉及范围    ← 一行 tagline：✅完成/❌废弃/🔄进行中 + 范围

## 探索成果
（3-8 条，动词开头，每条一行）
- 老 chat/conversation 废弃，chat2 晋升为主力模块
- SSE 流式对话接入真实 LLM（minimax-m2.7）
- 刷新页面自动恢复最近会话
- 思考链实时展示，DB 不存

## 技术栈
（3-8 个关键词，greppable）
- llmService.chatStream（AsyncGenerator）
- SSE（ReadableStream 前端消费）
- 游标分页（基于 message id）
- 动态 import 解循环依赖

## 关键决策
（每条：做法 + 原因，回答"当时为什么这样改"）
- 思考链不存 DB → DB 干净，前端体验不丢
- 单会话恢复 → 不做多会话列表，降低复杂度

文件: +modules/chat/ · ~ChatView.vue · -modules/conversation/ · -demo-standalone-chat.ts
```

### Tagline 状态说明

| 值 | 含义 |
|---|---|
| `✅ 完成` | 做完了，达到了预期效果 |
| `🔄 进行中` | 做到了某个阶段，下一步继续 |
| `❌ 废弃` | 探索过但放弃了，说明原因 |

### 文件行前缀

| 前缀 | 含义 |
|---|---|
| `+` | 新增文件/目录 |
| `-` | 删除文件/目录 |
| `~` | 修改文件 |
| `*` | 重要文件 |

## 归档后必须做的事

1. 在 `docs/STATUS.md` 底部追加一行：
   ```markdown
   - `archive/YYYY-MM/DD-topic.md`
   ```
2. 在 `docs/STATUS.md` 的"已完成"列表加上本次完成的项目（如果尚未记录）

## 反例（不要这样写）

- ❌ 写"下一阶段"/"后续计划" → 属于 STATUS.md 的"正在做"
- ❌ 贴详细代码 → 会过时，git log 更准
- ❌ 流水账式操作记录 → 只记成果，不记过程
- ❌ 只写一句话 → 以后回看没有上下文

## 示例

### 好的归档

```markdown
# 2026-05-26 · Chat 模块换血 + 真实 LLM 流式对话

> ✅ 完成 | 前后端 + DB + LLM 流式

## 探索成果
- 老 chat/conversation 废弃，chat2 晋升为主力模块
- SSE 流式对话接入真实 LLM（minimax-m2.7），零新增 TS 错误
- repository.ts 新增 conversations 表 + createConversation + addMessage
- 前端 ChatView.vue 删 mock，接真实 SSE，带 currentConversationId

## 技术栈
- llmService.chatStream（AsyncGenerator）
- SSE（text/event-stream + ReadableStream）
- 游标分页（基于 message id）
- HistoryItem 内联（原依赖 conversation 模块已删）

## 关键决策
- 思考链不存 DB → DB 干净，前端流式展示不丢
- 路由重命名：/api/chat2/* → /api/chat/* → 统一命名

文件: +modules/chat/ · -modules/chat2/ · ~app.ts · ~ChatView.vue · -modules/conversation/
```

### 坏的归档（不要这样）

```markdown
# 今天做了 chat 模块

做了很多工作，改了很多文件。
下一阶段要测试。

（太简，没有上下文）
```
