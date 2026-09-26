---
title: 'HomeSense Studio · 架构理解报告'
date: 2026-04-29
---

# HomeSense Studio · 架构理解报告

> 生成：2026-05-19
> 目的：在动手重构之前，先把设计文档想说的、参考项目吸收的、实际代码做到的、记忆心脏的真实状态、设计可能要调整的地方，全部梳理一遍。
> 范围：聚焦后端 + 数据库 + 米家 CLI 的核心链路；前端 80% 完成，本轮粗略对照即可。

---

## 1. 项目精神（一句话定位）

> **集大成用上各种先进技术理念、和参考项目，定居于智能家居场景，现在升级成了有生产能力的家庭工作室 Studio。**

三个支柱叠加才是完整：

1. **集大成**：27 个被验证的开源项目（Dify / Claude Code / HA Core / Orra / ACE / OpenClaw / mempalace / phone-mcp / miot-mcp …）的主干**源码级吃下来**，不是参考思路是真吸收。这是项目的**文化基因**。
2. **定居智能家居**：智能家居是"最难骗自己"的载体——所有抽象能力都得回到一盏灯、一台电视、一个红外按键上证明。
3. **从消费端升级到生产端**："Studio" 是关键词。老 HomeSense 是**消费**家居能力（执行命令），Plus 是**生产**家居能力（编排 / 沉淀经验 / 自动晋升 Skill / 长出自己的工作流）。这是质变。

**这不是作品集项目**，是"用智能家居这个最难骗自己的真实场景，验证集大成的工作室架构能不能站住"。

求职展示是**外形**，不是精神。

---

## 2. 16 子系统逐个画像

> 设计来源：`新生/05-HomeSense-Studio设计/00-总体设计/系统架构总览.md`
> 实际代码：`packages/backend/src/modules/`

| # | 子系统 | 设计定位 | 实际代码模块 | 完成度 | 关键 file |
|---|--------|---------|-------------|--------|-----------|
| 01 | **Entity Registry** | 设备/Feature/Entity 三层注册 | `entity-registry/` (35 行) | ⚠️ 骨架 | 仅 35 行的接口定义，实际数据在 `devices/device_features/entities` 表里由 device 模块管 |
| 02 | **State Machine** | 实体状态、变更通知 | `state-machine/` (35 行) | ⚠️ 骨架 | 内存 Map，无持久化、无事件触发 |
| 03 | **Event Bus** | 事件发布订阅、解耦 | `event-bus/` (31 行) | ✅ 简洁可用 | 极简 fire/on，由各模块 fire `memory_observation`、`workflow_completed` 等 8 类事件 |
| 04 | **Service Registry** | 服务注册/调用/schema | `service-registry/` (201 行) | ✅ | 已 DI 重构，含 device_control.* 5 个内置 handler |
| 05 | **Rule Engine** | L1 规则匹配 | `rule-engine/` (180 行) | ⚠️ 实现完整但 **DB 里 0 条规则** |
| 06 | **Agent Runtime** | Chat 侧 L1/L2/L3 分流 | `agent-runtime/` (955 行) | ✅ 实现完整 | 含 processMessageStream/processDirectStream 双路径，observeOutcome 已挂上 |
| 07 | **Workflow Runtime** | Studio 核心，节点图执行 | `workflow/` (子模块 15 文件) | ✅ 已通 | run-workflow / preview / seed / built-in-nodes 16 种节点齐全，35 次成功 run 记录 |
| 08 | **CLI Bridge** | TS↔Python 桥 | `cli-bridge/` (589 行) | ✅ 实现完整 | child_process + JSON stdout，含 mi-cli/adb-cli/bilibili-cli/hami-cli 四桥（hami 已硬阻断） |
| 09 | **CronService** | 定时任务调度 | `cron/` (141 行) | ⚠️ 实现 DI 完整但**未驱动任何业务任务** |
| 10 | **Storage Layer** | SQLite 家族统一存储 | `db/` | ✅ 通 | 自动建表，38 张表已建好；sqlite-vss 当前**未启用**（embedding 走 JSON 列存） |
| 11 | **Device State Poller** | 状态轮询 | `device-state-poller/` (172 行) | ⚠️ 实现 DI 完整但**未启动主循环** |
| 12 | **Memory System** | 长期记忆、L0/L1/L2/L3 | `memory-kernel/` (1035 行) + `memory/` (索引壳) | ⚠️ **架构丰满 / 实际半残** ← 心脏 |
| 13 | **Skills System** | SKILL.md 渐进式披露 | `skills-system/` (231 行) | ⚠️ 半通：内存 Map 未在重启后从 db 重载 |
| 14 | **Experience System** | 4 类目录 + frontmatter MD | `experience/` (319 行) | ⚠️ 写入通、**召回路径无业务调用** |
| 15 | **Compensation Layer** | 失败补偿 + 指数退避 | `compensation/` (233 行) | ⚠️ 实现完整但**未被任何模块挂入** |
| 16 | **Self-Enhancement** | ACE Skillbook 三角色 | `self-enhancement/` (209 行) | ❌ **stub**：仅正则字典 + 0 调用 |

**额外的 22 个非 16-子系统模块**——大多是设计模块的子拆分或新增能力：

| 类别 | 模块 | 备注 |
|------|------|------|
| Chat 链路细分 | `intent-router/` (381) `context-completer/` (235) `candidate-plan/` (377) | Agent Runtime 的 L1/L2 路由细分实现 |
| 执行网关 | `executor-gateway/` (417) `manifest-registry/` (227) `agent-adapter/` (422) `a2a-client/` (98) | 把 cli/service/agent/workflow 调用统一为 invoke 接口；Codex/Claude Code/xiaolongxia A2A 适配 |
| 渠道 | `channels/` (119) | wechat/qq/feishu service 注册（占位） |
| 知识编译 | `knowledge-compiler/` (294) | experience → compiled_knowledge |
| 重排 | `rerank-service/` (68) | reranker 服务接入 |
| 候选规划 | `plan-library/` (200) | demo 路径硬编码（看 B 站等） |
| 审批 | `approval/` (95) | 高风险操作前暂停 |
| 会话管理 | `conversation/` (274) `agent-instance/` (145) | conversation_messages CRUD + agent profile |
| LLM | `llm-provider/` (609 + 111 routes) | 多 Provider + 模型槽位 |
| 路由层 | `chat/` (92+263+395) `device/` `setting/` `skill/` `auth/` `rule/` `memory/` `workflow/routes` `devtest/` | Fastify 路由，REST + SSE |

**结论**：16 子系统设计与代码总体对得上号。**实际多出来的模块绝大多数是子系统下的实现细化**，不是脱离设计——除了 `chat/` `agent-instance/` `agent-adapter/` `a2a-client/` `executor-gateway/` `manifest-registry/` `approval/` 这一组——它们是 plus 升级阶段为支撑 Studio + A2A 多 Agent 而新增的能力，**设计文档里没明确归位**（设计是 16 子系统快照，没覆盖到 A2A 这一层）。

---

## 3. 27 参考项目 → 子系统归位（已吃 vs 未吃）

| 参考项目 | 设计预期吸收 | 实际代码痕迹 | 状态 |
|---------|------------|------------|------|
| **01-dify** | Workflow Runtime 主参考 | `workflow/` 节点+变量池+VueFlow 编辑器 | ✅ 主干已吃 |
| **03-home-assistant-core** | Entity/StateMachine/EventBus | `entity-registry/state-machine/event-bus` 三件骨架 | ⚠️ 名字对上但实现未达 HA 复杂度 |
| **04-phone-mcp** | CLI run+JSON 模式 | `mi-cli/adb-cli/bilibili-cli` 全是 phone-mcp 风格 | ✅ 范式已吃 |
| **07-mempalace** | 三层栈 / wing/room / 三元组 | `memory-kernel.remember/recall` 接口照抄、wing/room 字段照抄 | ⚠️ 接口在但**triples=0** |
| **17-python-miio** | miio 协议 | mi-cli 内部使用 | ✅ |
| **18-hass-xiaomi-miot** | MIoT-Spec 解析 | mi-cli 已实现 | ✅ |
| **19-mijia-api** | 扫码登录 | mi-cli QR 登录已发行打通 | ✅ |
| **20-miot-mcp** | 能力引擎、意图路由 | `service-registry` device_control.* + `intent-router` | ⚠️ 名字对上但能力 schema 未严格抽象 |
| **22-claude-code-agents** | Tool 类型系统、QueryEngine | `agent-runtime/` 是 ChatStream 风格而非 Claude Code 的 QueryEngine 风格 | ⚠️ 借了思想没借结构 |
| **23-orra** | 补偿 Worker / 指数退避 | `compensation/` 接口齐全 | ❌ **代码在、没人用** |
| **24-openclaw** | Cron / Gateway / Channels | `cron/` `channels/` | ⚠️ 骨架在、未驱动业务 |
| **27-agentic-context-engine (ACE)** | Skillbook / Reflector / SkillManager 三角色 | `self-enhancement/` 仅正则字典 | ❌ **远未达 ACE 标准** |

**已吃透**（5/27）：dify / phone-mcp / python-miio / hass-xiaomi-miot / mijia-api。
**接口对得上但实现浅**（7/27）：home-assistant-core / mempalace / miot-mcp / claude-code-agents / orra / openclaw / 各 mobile-automation 项目。
**最关键、最未达**（1/27）：**ACE**——心脏的核心。设计文档明确"自我增强 = ACE Skillbook + 三角色协作"，实际 self-enhancement 模块只有 5 条预定义错误正则。

---

## 4. 五条心脏链路体检（核心一节）

### 链路 A · observeOutcome 写入路径

**设计**：动作执行后写入 `memory_observations`，记录 success/failure/duration/last_seen。
**实际**：

| 写入侧调用点 | 文件 | 状态 |
|------------|------|------|
| Chat 工具调用后 | `agent-runtime/index.ts:423,870` | ✅ |
| 执行网关 invoke 后 | `executor-gateway/index.ts:360` | ✅ |
| Workflow executor_call 节点后 | `workflow/run-workflow.ts:160` | ✅ |
| Smoke 测试 | `devtest/routes.ts:75` | ✅ |

**实测数据库**：`memory_entities WHERE wing='runtime_observations'` = **16 条**，`memory_attributes` = 341 条。
**结论**：✅ **通**。这是心脏唯一活跃的心室。

### 链路 B · experience 写入路径

**设计**：L3 执行成功后 `AgentRuntime.writeExperience(category, title, content, importance)` → `data/experiences/<category>/<slug>.md` + DB + FTS。
**实际**：

| 写入侧调用点 | 文件 | 状态 |
|------------|------|------|
| Chat stream 流末尾 | `chat/stream.ts:365` | ✅ 唯一调用点 |
| Workflow / executor-gateway / agent-runtime 直接 | — | ❌ 未挂 |

**实测**：`experiences` = 16 条，`importance≥0.7` = **1 条**（几乎无晋升触发）。
**结论**：⚠️ **半断**。仅 chat 链路写入；workflow 跑成功不写、executor 直接调用不写。导致经验池是 chat 单端"独唱"。

### 链路 C · experience 召回路径

**设计**：L2 检索时调 `recallExperiences` 与 memory.search 并列重排，作为 L1 命中后的补充上下文。
**实际**：

```
$ grep -rn 'recallExperiences' packages/backend/src
experience/index.ts:154   定义
experience/routes.ts:31   HTTP /api/experience/recall — 给前端
[无业务模块调用]
```

**结论**：❌ **断**。设计中 L2 应该混合 memory + experience 双路召回，实际**只走 memory.search 一路**，experience 召回完全没接进 chat 主路径。
**症状**：用户在第 N 次对话里说"上次怎么开的客厅灯"——系统读不到 experience 里的 markdown 内容。

### 链路 D · knowledge-compile / 编译路径

**设计**：experience + memory_entities + plan-library 定期编译为 `compiled_knowledge_items`，配 embedding，作为 L2 语义召回源。
**实际**：

| 触发点 | 文件 | 状态 |
|-------|------|------|
| 启动时一次 | `app.ts:77` | ✅ |
| HTTP 手动触发 | `memory/routes.ts:98` | ✅ |
| **写后自动触发** | — | ❌ **没有** |
| **定时触发**（cron） | — | ❌ **没有** |

**实测**：`compiled_knowledge_items` = 40，`compiled_knowledge_embeddings` = 29（**11 个 item 没向量**）。
**结论**：⚠️ **缺自动化**。启动跑一次就停，写新 experience 后不会自动编译；新增 11 个 item 后没补 embedding。
**症状**：用户写 100 条新经验后，semanticSearch 仍只能召回 29 条向量内容。

### 链路 E · skill 晋升路径（最关键）

**设计**：experience.importance ≥ 0.7 → SkillsService.convertExperienceToSkill → skills 表插入 source='converted' 行 → 重启后下次 L1 routeToLevel 可命中。
**实际**：

```typescript
// experience/index.ts:96-98
if (importance >= 0.7) {
  this.convertExperienceToSkill(...)  // 调用了
}

// experience/index.ts:224
this.skillsService.register({...})  // 写入 skills 表 + 内存 Map
```

**实测**：`skills WHERE source='converted'` = **0 条**。
**根因**：
1. `experiences importance≥0.7` 只有 1 条，但即便这一条也没出现在 skills 表里——可能是因为它在 db 里、晋升那次进程已结束，**Map 没持久化**。
2. **重启后 skillsService 不会从 db 重新加载 source='converted' 的行进 Map**——`loadDiskSkills` 只读磁盘，不读 db converted skills。

**结论**：❌ **半断**：重启之间挂掉 + 内存 Map 与 db 不同步。

### 链路 F · self-enhancement 反思

**设计**：ACE 三角色——Agent 执行、Reflector 反思失败、SkillManager 管理 Skillbook（ADD/UPDATE/TAG/REMOVE）。
**实际**：

```typescript
// self-enhancement/index.ts:50-104
// ERROR_PATTERNS 五条预定义正则: device_offline, rule_miss, invalid_params, auth_failure, rate_limited

// self-enhancement/index.ts:196
processFailureAndEnhance(failure: TaskFailure): void {
  ...
}

$ grep -rn 'processFailureAndEnhance' packages/backend/src
self-enhancement/index.ts:196   // 定义
[无任何调用点]
```

**结论**：❌ **完全断**。
- 实现是字典查表，和 ACE 的反思机制差几个数量级
- 写好的 `processFailureAndEnhance` **零调用**——agent-runtime 工具失败后没接，workflow 节点失败后没接

---

## 5. 设计 vs 实际 · 5 处张力点（你判断方向）

### T1 · "L0/L1/L2/L3 记忆栈" vs 实际 wakeUp 缺失

设计的 `MemoryService.wakeUp() → MemoryStack { l0, l1[] }` 接口，实际 `memory-kernel/index.ts` 里**没有 wakeUp 方法**。L0 (Identity Skill) 的概念在 skills-system 里没有专门的 identity skill，在 chat/stream 里直接拼系统提示词字符串。

**选项**：
- A. 实施设计原意：写 wakeUp、把 system prompt 拆成 identity skill
- B. 简化设计：L0/L1 概念退化为"system prompt + recent observations"，删掉 wakeUp
- C. 暂不动：保持现状，把心脏其他更紧急的环节修通先

### T2 · `remember()` 同步 embedding vs 离线 rebuild

设计：`remember(content, metadata)` **同步**生成 embedding 写入 sqlite-vss。
实际：`remember()` 只写 entities/attributes/triples（triples 还没生成），**embedding 走完全独立的 `rebuildCompiledKnowledgeEmbeddings` 离线路径**——compiles compiled_knowledge_items 时才生成向量。

**两种语义混在一起**：
- 设计说"记忆=同步语义化"
- 实际是"记忆=结构化日志，知识图谱=异步编译产物"

**选项**：
- A. 让 `remember()` 同步生成 embedding（简单粗暴，但每次 remember 多一次 API 调用）
- B. 保留异步编译，但**写后必触发增量编译**（解决 "新写没向量"）
- C. 把"remember"和"compile"概念上彻底分开：remember 只写日志，semanticSearch 只查 compiled，文档明示

### T3 · Skill 内存 Map vs 持久化

skillsService 有内存 Map + db 表两份，**重启后 db 里 source='converted' 的行进不来 Map**。设计文档里说渐进式披露，但没说重启如何重建 Map。

**选项**：
- A. 启动时 `loadAll()` 把 db 里所有 enabled=1 的 skill 装进 Map（最自然）
- B. 干掉 Map，每次 getSkill 走 db（牺牲速度）
- C. Map 只缓存 disk skill，converted skill 每次走 db

### T4 · ACE 三角色 stub vs 真实现

self-enhancement 是 ACE 的简化版。要真"集大成"，需要：
- Reflector 不是正则，是 LLM 调用（沙箱可选）
- SkillManager 持久化 Skillbook，支持 ADD/UPDATE/TAG/REMOVE 四操作
- Agent 在执行时把 Skillbook 注入 system prompt
- 失败/成功后把 outcome 喂给 Reflector

**选项**：
- A. 直接照抄 `D:/files/HomeSense/References/agentic-context-engine/ace/implementations/reflector.py`
- B. 先把 Reflector 接到现有 LLM（保留正则做 fallback），SkillManager 只支持 ADD
- C. 先不动，把心脏其他链路通了再回来

### T5 · 设计的 16 子系统 vs 实际 38 模块

实际多出来的核心是 **A2A / agent-adapter / agent-instance / executor-gateway / manifest-registry / approval / channels** 这一组——设计文档没明确归位。这是 plus 升级阶段为支撑"Studio + 多 Agent + 远程 bot 入口"新长出来的层。

**选项**：
- A. 把设计文档补上"Plus 阶段新增的协调层"，正式纳入第 17-22 子系统
- B. 把它们归并进现有子系统（agent-instance → Agent Runtime；executor-gateway → Service Registry；channels → 新的 Channel Layer）
- C. 暂不动设计，写一份 supplemental 文档说明这些是 plus 阶段补充

---

## 6. 当前阶段我看到的真实状态

**绿色（确实跑通）**：
- mi-cli QR 登录、设备发现、scene_execute、speaker_execute、ir_press_key（用户已确认发行）
- workflow 执行引擎（35 次成功 run 实证）
- 88 段对话（154 条消息）真有人用
- 前端 80% 完成，11 个组件、9 个页面、SSE 流式 UI
- agent-runtime processDirectStream（L3 LLM + 工具循环）
- 38 张表已建、写入通

**黄色（接口在但未跑通）**：
- L1 规则（rules=0）
- experience 召回（无业务调用）
- knowledge-compile 增量（无自动触发）
- skill 晋升（converted=0）
- skills 持久化（重启丢 Map）
- compensation（接口在但 0 调用）
- cron / device-state-poller（DI 通了但没启动主循环）
- L0/L1/L2/L3 wakeUp（设计中、代码无）

**红色（架构丰满 / 实际为 0）**：
- memory_triples（设计的核心、实际 0 条）
- self-enhancement / ACE 三角色（stub + 0 调用）

**橙色（耦合度高、影响测试）**：
- 38 个模块直接 `getDb()` + 顶部 `import singleton`（已部分修过 DI）
- 业务逻辑和 SQL 散落在 service 内部，无 Repository 层
- 事件副作用直接 `eventBus.fire(stringName, data)` 散在 6+ 处
- 启动副作用：`export const x = new X(); x.initialize()` 一 import 就跑
- 测试能写的全是纯函数（5 个测试全是算法），任何模块层测试要起完整 sqlite + 真实 schema

---

## 7. 下一阶段建议聚焦的范围

> 用户已选择的工作流：**理解架构 → 重构拆解 → 基础设施搭建测试 → 组合拼装**。
> 不急，做好。

阶段二（重构拆解）建议的优先级：

### 优先级一 · 心脏所在的 5 个模块
`memory-kernel + experience + knowledge-compiler + skills-system + self-enhancement` + 它们的紧邻调用方（`agent-runtime / chat-stream / executor-gateway / workflow-runtime`）。

理由：这是设计 vs 实际 gap 最大、阶段三集成测试最该锚定的链路。

### 优先级二 · 测试基础设施（in-memory db / fake services）
让上述 5 + 4 = 9 个模块能在零外部依赖下跑。

### 优先级三 · 组合拼装（端到端心脏测试）
写出会失败的集成测试：
- "observeOutcome 三次成功 → 第四次 recallObservations 召回最高分"
- "writeExperience importance=0.8 → skill 表新增 source='converted' 行 → 重启后 routeToLevel 命中 L1"
- "executor_call 节点失败 → self-enhancement.processFailureAndEnhance 触发 → 5 类错误模板某一条匹配"

让这三条红→绿，就是项目"心脏第一次跳"。

### 不在阶段二做的事（明示）
- 不动 mi-cli 米家登录（已发行、已稳）
- 不动前端（80% 完成，独立测试已绿）
- 不补 ACE 三角色到完整版（先让 stub 真被调用，再升级实现）
- 不重写 wakeUp / L0 Identity（先让现有写入/召回链通，再升级到设计原意）
- 不补 cron 驱动 device-state-poller（与 demo 主线无关）

---

## 8. 等你判断的事

1. **5 个张力点（T1-T5）** 你倾向哪个选项？特别是：
   - T2（remember 同步 embedding vs 异步编译）——这影响 semanticSearch 何时有数据
   - T3（skill Map 持久化）——这是当前 converted=0 的直接原因之一
   - T4（ACE 升级路径）——这决定阶段三集成测试到什么程度算"心脏跳起来"
   - T5（设计补充 plus 模块归位）——这影响第二阶段拆解的边界
2. **优先级一的 5+4 模块清单**对吗？要不要加 / 减？
3. **三条目标集成测试**（observeOutcome 重排 / experience 晋升 skill / 失败反思）——和你心里"心脏跳了"的标准吻合吗？

确认后我们进入阶段二（重构拆解）。

---

## 附 · 数据库实测（2026-05-19 截止）

```
memory_entities:        17  (其中 runtime_observations: 16)
memory_triples:          0  ←── 知识图谱完全空白
memory_attributes:     341
experiences:            16  (importance ≥ 0.7 仅 1 条)
skills:                  5  (全部 source='disk', converted=0)
compiled_knowledge_items:    40
compiled_knowledge_embeddings: 29  ← 11 个 item 没向量
embedding_profiles:      1
rules:                   0  ←── 规则引擎完全空白
workflows:              10
workflow_runs:          35
conversations:          88
conversation_messages: 154
```
