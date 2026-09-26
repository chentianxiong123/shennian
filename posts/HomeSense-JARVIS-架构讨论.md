---
title: 'HomeSense JARVIS — 架构讨论笔记'
date: 2026-06-12
---

# HomeSense JARVIS — 架构讨论笔记

> 本文件记录了 HomeSense-Studio-v2 → JARVIS 的架构讨论过程。
> 它不是最终方案，而是讨论轨迹。
> 读此文档的人（或 AI）应能理解**我们想过什么、为什么这么想、还有什么没想通**，然后接着往下走。

---

## 项目定位

**自用的智能家居自动化系统**，形态为 NAS / 服务器，不是 SaaS，不是移动 App。
目标：**逐步淘汰 LLM**，最终由 L1 规则 + L2 脚本 + n8n 工作流构成闭环。

简历定位：「基于 n8n + langgraph 的智能家居自动化框架，自研沉淀机制」。

---

## 正在解决的根问题

> 怎么让 AI 从"每件事都要大模型"变成"大模型只做探索/兜底，日常全走规则+脚本"？

这不是一个技术选型问题，是一个**架构策略问题**：如何让 LLM 主动写代码、主动沉淀、主动退出执行路径。

---

## 当前技术栈（已锁定）

| 层 | 方案 | 备注 |
|---|---|---|
| Agent 底座 | Pi agent（earendil-works/pi） | 决定不走 MCP，走 skill+CLI |
| 后端 | NestJS + TypeScript | 单服务，不拆微服务 |
| 前端 | Vue 3 + Naive UI + @vue-flow | - |
| 数据库 | SQLite 全家桶（vec0/FTS5/R-Tree/JSON1） | 单文件，不换 |
| CLI 工具集 | homesense-cli / adb-cli / mi-cli / media-cli / alist-driver | 跨语言（TS/Py/Go） |
| 工作流 | 正在嵌入 n8n（裁剪中） | 见下方讨论 |
| Agent 可视化 | Pi skills 系统 + n8n UI（待定） | 见下方讨论 |
| 流媒体 | adb-scrcpy + WebSocket | - |

---

## 关键讨论轨迹

### 1. 工具调用方式（为什么不走 MCP 也不注册 tool）

**问题：** 设备指令（开电视、切频道、调音量）有 50+ 条。如果每条都注册成 Pi 的 tool，system prompt 会炸。

**讨论过程：**
- 一开始想注册成 Pi tool → 太长，否决。
- 想走 HTTP daemon → 要多起服务，否决。
- 想走 import Python 模块 → 跟 NestJS 混写痛苦，否决。
- **最终：走 bash 调 CLI。** Pi 内置 bash 工具直接 exec CLI。SKILL.md 按需 read CLI 用法。

**决策依据：**
- 启动进程 200-500ms —— 但"用户指令频率不高，一次点击/一条指令也就几百毫秒，接受"。
- 嵌入工具 50 条描述 ≈ 2000 token 塞进 context —— "不亏，但没必要"。
- 最终结论：**高频指令走 L1 规则（<10ms）＋ 中低频走 bash CLI（200ms）＋ LLM 兜底（3s）。**

### 2. 意图路由（单层分类 + 状态机）

**问题：** 同一句话可能是指令（"打开电视"）也可能是聊天（"我小时候总打开电视逃避现实"）。怎么区分？

**讨论过：**
- 关键词 + 正则路由（覆盖 70% 明确指令）。
- 多层分类（先过正则 → 再过小模型 → 再过 LLM） → 层数太多比直接 LLM 还慢。
- 带上下文的单层分类 → 最后定。

**最终方向：**
- 小模型（1.5B-3B 量化）单层分类，每个消息跑一次（100-300ms）。
- 分类器看最近 5-10 条上下文 + 当前消息。
- 三种输出：command / chat / dispatch。
- 状态机维持一个"当前模式"（command 模式 / chat 模式），用户语义模糊时走模式推断 + 二次确认。

**衍生问题（未解决）：**
- 用户深度聊天时无意触发指令，状态机能否准确兜住？
- 小模型 1.5B CPU 推理 300ms —— 在 Windows 上实测过吗？

### 3. 三层记忆

| 层 | 存储 | 读取 | 谁写 |
|---|---|---|---|
| L1 规则 | SQLite，正则 / 模板 | <10ms 哈希匹配 | 人写（或 LLM 沉淀后推广） |
| L2 脚本 | SQLite + sqlite-vec | 向量召回 + rerank（300ms） | LLM 主动沉淀 |
| L_user 画像 | 结构化 JSON | 0 嵌入，直接读 JSON | LLM 反思写入（异步） |

**L2 的关键设计：**
- 每次用户指令 + embedding 都会存 cache。同样的指令命中逐次加快。
- 同一指令跑 N 次稳了 → 抽成 L1 规则。
- 向量 + rerank + 小模型三条路并行，取最快命中结果。

**L_user 的关键设计：**
- 不是向量库。纯聊天的价值不体现在 embedding 相似度，体现在**结构化偏好**（用什么设备、音量大、语速、是否爱骂人）。
- 写入用 embedding 做聚类，读取直接读 JSON（0 延迟）。这是跟"记忆即检索"的根本分歧。

### 4. n8n 融合（正在讨论的核心）

**问题：** 自建的工作流引擎还是嵌入 n8n？

**讨论轨迹：**
1. 第一阶段：嵌入 n8n-workflow 包（只拿图结构 + 节点接口）。
   - 被否决。原因是"那执行引擎呢？DB 呢？"
2. 第二阶段：全包嵌入（n8n-workflow + n8n-core + @n8n/db + @n8n/engine）。
   - 可以接受。但担心"n8n 太肥"。
3. 第三阶段：n8n 独立 daemon，环境变量关掉一切不用的（鉴权 / AI / MCP / 协作 / 遥测）。
   - 可以接受。但觉得"代码还在，不爽"。
4. 第四阶段：n8n 源码 fork + 手动删不用的 package/cli/controller/command。
   - **当前停在第四阶段。** 已克隆源码到 `D:\files\References\workflow\n8n`。

**还在讨论的：**
- n8n 是独立 daemon 还是直接嵌入 v2 进程？
  - daemon：省事，不用改 v2 启动时序。但多一个进程。
  - 嵌入：最干净，函数调用级延迟。但 DI 容器要跟 NestJS DI 对齐。
  - 结论未定。
- nodes-base（400+ 集成节点）留不留？
  - 留了直接可用（HTTP / SSH / SQL 节点）。不留以后要自己写。
  - 结论未定。
- n8n UI 留不留？
  - 留了可以直接在 localhost:5678 拖 workflow。vs 用 v2 studio 拼。
  - 两者不互斥，但双 UI 让人迷惑。
  - 结论未定。

### 5. CLI 执行方式（最终定稿）

**走 n8n Execute Command 节点。** 不走 HTTP daemon，不走长连接。

原因：
- 自动化场景频率不高（一天几十次），启动进程开销 200-500ms 无所谓。
- 不走多进程架构，符合"单服务"约束。
- 不走扩展服务，新 CLI 挂上就行（不用起新 daemon）。

**区分场景：**
- 用户主观指令 → Pi bash 直接调 CLI（不走 n8n）。
- 自动化场景（定时 / 事件 / 状态变更）→ n8n workflow 调 Execute Command。
- LLM 探索 / 兜底 → LLM 写脚本 → 沉淀进 L2 → 下次走 n8n。

### 6. 沉淀机制（核心差异化）

**不是"录制重放"，是"LLM 主动沉淀"。**

关键在于系统提示词：
- "你跑出成功的脚本，要主动存进 L2 并打标签。"
- "同一画面 + 动作连续 N 次推理一致 → 抽成纯查表。"
- "跑稳的脚本 → 抽成 L1 规则。"

**核心逻辑：**
- L3 LLM 探索 → 反补 L2 脚本库。
- L2 跑 N 次稳了 → 抽成 L1 规则。
- L1 直接跑 → 0 LLM，0 n8n，0 任何开销。

**跟 n8n 的关系：**
- n8n 工作流本身也是被沉淀的对象。
- LLM 跑出某个流程 → 存成 n8n workflow JSON → 之后 n8n 直接跑。
- n8n 跑稳了 → 抽成纯脚本集成到 L1。

**这个机制是简历最高光的部分。** 面试官如果问"为什么自研沉淀而不直接用 n8n Workflow"，答：**"n8n 没有节点替换机制，没有渐进式淘汰。"**

### 7. 自我进化 vs 代码安全

**问题：** 是否让 AI 自己改自己代码？

**讨论过程：**
- 一开始想实现"AI 完全自理"——改 skill、改 workflow、改 system prompt、改 v2 代码。
- 发现改 v2 核心代码（NestJS 路由 / 桥接 / 框架）风险太高。
- 最后定调：**只改组件层（skill / workflow / prompt / 脚本），v2 核心冻结。**

**自用系统下的安全：**
- 没有多用户风险。
- 没有灰度 / CI/CD 的必要。
- git reset 就是回退。
- 自用系统 = 用户就是管理员 + 测试员 + 回退员。

---

## 共识但未实现的

1. **L2 cache 表**：每次指令 + embedding 存 SQLite。早实现早受益。
2. **Pipeline 架构**：L1(<10ms) → L2(n8n 200-500ms) → LLM(3-5s)。未实现，需 n8n 接入后才能跑通。
3. **SKILL.md 补齐**：adb-cli / mi-cli / media-cli / alist-driver 都还未有 SKILL.md（mi-cli 除外）。
4. **AuthorizationsView.vue** 依赖的 mock controller 已删（已做）。

---

## 未定 & 待继续讨论

### 高优先级
- [ ] n8n 是 daemon 还是直接嵌入 v2 进程？（瓶颈）
- [ ] n8n nodes-base（400+ 节点）留不留？（影响后续工作量）
- [ ] n8n UI 留不留？（影响 v2 web 的 studio 组件发展）
- [ ] n8n 裁剪的精确范围（哪些文件删、哪些留）

### 中优先级
- [ ] 小模型 1.5B CPU 推理在 Windows 上的实测延迟？
- [ ] 意图路由的状态机实现细节（"模式"切换逻辑 + 二次确认 UI）
- [ ] L2 的 embedding 模型选型（bge / m3e / 别的）
- [ ] L_user 的 JSON schema 设计（哪些字段、怎么权重）
- [ ] Pi skills 目录的初始搭建（第一个 skill: homesense-tv README + 脚本）

### 低优先级
- [ ] adb-cli 大文件拆分（adb.py 1399 行）
- [ ] media.service.ts 拆小（794 行）
- [ ] Vue 视图大文件拆分（14 个 >1000 行）
- [ ] 对齐 packages 的 SKILL.md（mi-cli 有，adb-cli / media-cli 没有）
- [ ] homesense-cli 命令列表补全（跟 n8n Execute Command 对齐）

---

## 架构图（文本版，方便后续 AI 解析）

```
用户消息
  ↓
[小模型分类器 + 5-10 条上下文]
  ↓
  ├── command → L1 正则匹配
  │               ↓ miss
  │             L2 向量 + rerank + 小模型（并行）
  │               ↓ hit (or miss → LLM)
  │             n8n Execute Command → CLI → 结果
  │               ↓
  │             存 L2 cache
  │
  ├── chat → LLM 直接对话
  │          （读 L_user 结构化画像，不查 embedding）
  │
  └── dispatch → LLM agent 循环
                  ↓
               拆任务 / 调工具（CLI/n8n）
                  ↓
               沉淀进 L2 / cache
```

---

## 用户行为偏好（给新 AI 的备注）

- **不要角色扮演。** 不要一问一答。不要道歉。
- **不要主动给方案。** 先问"你怎么想的"。
- **用户是架构师，你是资源整合助手。** 不要替用户决定。
- 用户说话简短。你也简短。
- 用户已经骂过你很多次了。如果你读到这里感觉"这个 AI 好像挨过不少骂"——是的。记住上述三行就好。
- **"/compact"** 表示上下文快满了，用户手动压缩过。不是生气的信号。
- **"我让你别道歉，你说话啊"**——这是原始引用。记住。

---

## 附：已读过的关键代码/目录

- `apps/server/src/` 每个模块的职责（见项目 CLAUDE.md / 本文"当前技术栈"）
- `apps/web/src/views/` 14 个 >1000 行的 Vue 大文件
- `packages/adb-cli/src/adb_cli/adb.py` 1399 行（单文件绝对值）
- `packages/mi-cli/src/mi_cli/` api/ + capability/ 两层子模块
- `packages/media-cli/src/media_cli/` resources.py 712 行
- `D:\files\References\workflow\n8n\packages\workflow\src\workflow.ts` Workflow 类
- `D:\files\References\workflow\n8n\packages\cli\src\commands\execute.ts` n8n 执行命令
- `D:\files\References\agent\openclaw\.pi\extensions\` Pi extension 样板
- `D:\files\References\agent\openclaw\.agents\skills\` SKILL.md 样板

---

*最后更新：2026-06-12*
*作者：用户 a1 + Claude Code*
*目的：给下一个 AI（或下一个自己）接上思路，继续讨论。*