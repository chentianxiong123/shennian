---
title: '小模型号池驱动的数据批量清洗与并行切分技术方案'
date: 2026-07-05
---

# 小模型号池驱动的数据批量清洗与并行切分技术方案

> **文档定位** —— 本文档完整记录 4355 个聊天数据 job（QQ 2018 + WeChat 2337）的并行批处理技术方案，涵盖从架构设计到为什么要这样设计的全部细节。
> ---
> - 合并源：小模型号池驱动的数据清洗技术.md / agent-large-segment-split-prompt.md / agent-start-guide.md / agent-parallel-splitting-method.md / parent_agent_A_前向.md / parent_agent_B_反向.md
> - 更新时间：2026-07-05

---

## 目录
- [1. 方案演进（三阶段）](#1-方案演进三阶段)
- [2. 核心任务定义](#2-核心任务定义)
- [3. 主架构：多级并发批处理](#3-主架构多级并发批处理)
- [4. 数据组织方式](#4-数据组织方式)
- [5. 双路对进策略](#5-双路对进策略)
- [6. 父/子 Agent 职责](#6-父子-agent-职责)
).
- [7. 判断标准与输出规则](#7-判断标准与输出规则)
- [8. 技术栈与依赖](#8-技术栈与依赖)
- [9. PROMPT.md 核心规则](#9-promptmd-核心规则)
- [10. 流式补位策略](#10-流式补位策略)
- [11. Auto API 池方案](#11-auto-api-池方案)
- [12. 并发去重与防冲突](#12-并发去重与防冲突)
- [13. 进度监控与合并](#13-进度监控与合并)
- [14. 实际效果](#14-实际效果)
- [15. 经验与教训](#15-经验与教训)

---

## 1. 方案演进（三阶段）

### 1.1 阶段一：规则批量处理（失败 ❌）

**思路：** 写一个 Python 脚本扫描所有 job 的元数据字段（gap_min、说话人变化、剩余消息数），用硬规则批量写 decision，不读实际聊天内容。

- 结果：看似快，但绕过了 AI 判断的核心要求——"切开后右侧能否独立当训练用"
- 发现后立即全部还原（撤回了 4102 个投机决策）

**教训：** 不能投机取巧用规则代替 AI 判断；必须逐 job 读实际对话内容做判断。

### 1.2 阶段二：单 AI 逐 job 处理（太慢 ❌）

**思路：** 用 AI 逐 job 判断，从末尾（wechat_003000）倒着往前做。

- 结果：手动处理太慢，不适合 4000+ 的量

### 1.3 阶段三：多级并发批处理架构（最终方案 ✅）

```
                    ┌─ 子 Agent 1 → batch_xxx (10个job)
                    ├─ 子 Agent 2 → batch_xxx (10个job)
父 Agent (调度器) ──┼─ 子 Agent 3 → batch_xxx (10个job)
                    ├─ ...
                    └─ 子 Agent 10 → batch_xxx (10个job)

父 Agent 职责：
1. 扫描 batches/ 找未完成的文件夹
2. 每次派 10 个子 Agent 并行执行
3. 等全部完成后，再派下一批 10 个
4. 直到全部 422 个 batch 都完成
```

**判断完成的标准：** 一个 batch 文件夹内 `.decision.json` 数量 = `.job.json` 数量，才算完成。

---

## 2. 核心任务定义

### 2.1 处理对象
- **QQ 聊天数据：** 2018 条
- **微信聊天数据：** 2337 条
- **总计：** 4355 个 job

### 2.2 每个 job 的结构
```json
{
    "job_id": "xxx_split60",
    "messages": [...],
    "candidate_boundaries": [...]
}
```

重点判断 `candidate_boundaries` 里的候选切点。

### 2.3 当前处于什么阶段

**不是生成训练集，而是在做清洗阶段的细分准备。**

主流程：
```
初清洗聊天 JSONL
  -> 按平台分别处理
  -> 60 分钟硬切成大段
  -> 大段按 API 风险分为 api_allowed / manual_review
  -> api_allowed 大段分片给多个 agent 并发处理
  -> agent 只输出 cut / keep / uncertain 决策
  -> 合并决策
  -> 后续再根据决策生成最终小段
```

核心原则：
1. 60m 大段是清洗容器，不是最终训练段
2. agent 不改写原文，不总结原文
3. agent 只判断相邻消息之间是否适合切开
4. 切点必须用 message index 表示，不能靠复制文本
5. 每个 agent 只处理自己的 shard，避免并发写冲突
6. 最终只合并切点决策，不合并改写文本

---

## 3. 主架构：多级并发批处理

### 3.1 架构图

```
CPA (Cloud Proxy API) - API 网关
  ├─ provider 1: agnes-2.0-flash
  ├─ provider 2: 小水管user (deepseek-v4-flash)
  ├─ provider 3: 小水管claude (deepseek-v4-flash)
  ├─ provider 4: yjjhwjw (agnes-2.0-flash)
  └─ provider 5: SenseNova (deepseek-v4-flash)

调度层：
  会话 A (前向) ── 父 Agent A ── 10 个子 Agent
  会话 B (反向) ── 父 Agent B ── 10 个子 Agent

工作层：
  batches_001 ~ batches_422  (每批 10 个 job)
```

### 3.2 为什么不一个人做？

**两个人真实聊天不是标准问答，常见情况包括：**
1. 延迟回复
2. 并行话题
3. 插话
4. 一个人连续发很多条
5. 隔一段时间继续前文

所以第一步不适合过早切小。当前做法是：
```
先用 60m 保住上下文
再让 agent 在大段内部慢慢拆
```

这样即使 agent 判断错了，也只是切点决策可回滚；原始消息和 60m 大段都还在。

---

## 4. 数据组织方式

### 4.1 版本对比

本项目经历了两种数据组织方式的迭代：

| 维度 | 早期 Shard 模式 | 最终 Batch 模式 |
|------|---------------|---------------|
| **组织方式** | 8 个 shard，每个 agent 独占一个 | 422 个 batch 文件夹，每 10 个 job 一个 |
| **输出形式** | 统一写 `shard_xxxx/decisions.jsonl` | 每个 job 独立写 `.decision.json` |
| **容错性** | agent 崩溃则全 shard 丢失 | 每个 job 独立，天然可恢复 |
| **并发冲突** | 需防同时写同一文件 | 无冲突，各写各的 |
| **进度查看** | 看 `decisions.jsonl` 的行数 | 直接数 `.decision.json` 文件数 |

### 4.2 当前使用的 Batch 模式

**路径：**
```
D:\files\qwen-chat\data\agent_queues\api_allowed_60m\
```

**目录结构：**
```
batches/
  ├── batch_001/ ~ qq_000027 ~ qq_000035 (10个)
  ├── batch_002/ ~ qq_000036 ~ qq_000045 (10个)
  ├── ...
  ├── batch_421/ ~ wechat_003030 ~ 003034 (10个)
  └── batch_422/ ~ wechat_003035 等 (7个)
```

总共 422 个 batch 文件夹。

### 4.3 可中断队列模式（备用）

如果使用可中断队列模式，目录含义：
```
pending/       尚未处理
in_progress/   已被某个 agent 取走
done/          已完成
failed/        失败或人工处理
```

完成颗粒度：
```
done\\<job_id>.decision.json 存在 = 这个 job Om 完成
```

---

## 5. 双路对进策略

### 5.1 为什么对进？

单路处理太慢，同时开 **两个 opencode 终端会话**并行处理，互不干扰，最终在中间汇合。

| 会话 | 方向 | 范围 |
|---|---|---|
| 会话 A（前向） | batch_001 → batch_211 | 从前往后 |
| 会话 B（反向） | batch_422 → batch_212 | 从后往前 |

### 5.2 父 Agent A（前向）完整指令

你是一个调度员，任务是从前往后处理所有 batch 文件夹。

工作目录：D:\files\qwen-chat\data\agent_queues\api_allowed_60m\batches\
范围：batch_001 到 batch_211

操作方式：**永不停机流式补位**
- 永远保持 10 个子代理同时在跑
- 谁做完，立刻补下一个未完成的 batch
- 不等任何人

判断完成的标准：一个 batch 文件夹内 .decision.json 数量 = .job.json 数量，才算完成。缺一个都不算。

流程：
1. 扫描 batches/ 下 batch_001 → batch_211，跳过已完成的
2. 取第一个未完成的 batch，用 Task 工具派子代理，指令只有一句：

```
请按 D:\files\qwen-chat\data\agent_queues\api_allowed_60m\PROMPT.md 处理 D:\files\qwen-chat\data\agent_queues\api_allowed_60m\batches\batch_xxx 里的文件
```

3. 不要等它做完，立刻切回步骤 1 找下一个未完成 batch，继续派
4. 始终保持 10 个子代理在跑
5. 当某个子代理完成时，立刻回到步骤 1，补一个
6. 范围 batch_001~batch_211 全部完成后停止

### 5.3 父 Agent B（反向）完整指令

你是一个调度员，任务是从后往前处理所有 batch 文件夹。

工作目录：D:\files\qwen-chat\data\agent_queues\api_allowed_60m\batches\
范围：batch_422 到 batch_212

操作方式：**永不停机流式补位**
- 永远保持 10 个子代理同时在跑
- 谁做完，立刻补下一个未完成的 batch
- 不等任何人

判断完成的标准：一个 batch 文件夹内 .decision.json 数量 = .job.json 数量，才算完成。缺一个都不算。

流程：
1. 扫描 batches/ 下 batch_422 → batch_212（从大到小），跳过已完成的
2. 取第一个未完成的 batch，用 Task 工具派子代理，指令只有一句：

```
请按 D:\files\qwen-chat\data\agent_queues\api_allowed_60m\PROMPT.md 处理 D:\files\qwen-chat\data\agent_queues\api_allowed_60m\batches\batch_xxx 里的文件
```

3. 不要等它做完，立刻切回步骤 1 找下一个未完成 batch，继续派
4. 始终保持 10 个子代理在跑
5. 当某个子代理完成时，立刻回到步骤 1，补一个
6. 范围 batch_422~batch_212 全部完成后停止

---

## 6. 父子 Agent 职责

### 6.1 父 Agent（调度器）

每个会话的父 Agent 执行逻辑完全一致：

1. 扫描 batches/ 下指定范围的文件夹
2. 找到未完成的文件夹（有 .job.json 但缺对应的 .decision.json）
3. 每批取 10 个未完成的，用 Task 工具派 10 个子代理并行执行
4. 每个子代理的指令完全相同：
   请按 PROMPT.md 处理 batches/batch_xxx 里的文件
5. 等子代理全部完成后，回到步骤 1，取下一批 10 个
6. 范围内全部完成后停止

### 6.2 子 Agent（执行器）

每个子 Agent 收到的指令非常简洁，就一句话：

```
请按 D:\files\qwen-chat\data\agent_queues\api_allowed_60m\PROMPT.md 处理 D:\files\qwen-chat\data\agent_queues\api_allowed_60m\batches\batch_xxx 里的文件
```

所有规则写在 `PROMPT.md` 中，子 Agent 自己读。

子 Agent 具体职责：
1. 读文件夹内所有 `.job.json`
2. 逐条判断 `candidate_boundaries`：切一刀后右侧能否独立当训练用
3. **不改写、不总结、不合并原文**
4. `reason ≤ 30 字`，不引用原文
5. 不确定 → keep
6. 一个文件的所有边界判断完才写 decision
7. 输出格式：`xxx_split60_job.decision.json`

---

## 7. 判断标准与输出规则

### 7.1 核心判断标准

只回答一个问题：
```text
从这个候选切点切开后，右侧片段能不能作为独立训练上下文继续使用？
```

**不是判断：**
- 是不是同一个话题
- 是不是一问一答
- 是不是语义完全断开

聊天本身可能发散、插话、并行话题，所以不要求它像标准对话。

### 7.2 允许的决策值

```text
cut      -> 明显可切，右侧能独立当训练上下文
keep     -> 明显不能切，右侧依赖前文
uncertain -> 不确定，不要强行判断
```

建议策略：明显可切 -> cut，明显不能切 -> keep，不确定 -> uncertain

### 7.3 输出格式

每个 job 输出一行 JSON：

```json
{"job_id":"...","decisions":[{"boundary_id":"...","decision":"cut|keep|uncertain","confidence":0.0,"reason":"不超过30字，不引用原文"}],"extra_cuts":[]}
```
 categories
- `decision`: cut / keep / uncertain
- `confidence`: 0.0-1.0 的置信度
- `reason`: 不超过 30 字，不引用原文

### 7.4 extra_cuts

如果发现候选边界之外有非常明显的切点，可以写到 `extra_cuts`。

格式：
```json
{
  "left_message_index": 10,
  "right_message_index": 11,
  "confidence": 0.8,
  "reason": "后文可独立开始"
}
```

要求：`right_message_index = left_message_index + 1`

如果没有额外切点，就写：`"extra_cuts": []`

### 7.5 禁止事项

1. 不要改写原文
2. 不要总结原文
3. 不要合并消息
4. 不要删除消息
5. 不要输出原文摘录作为 reason
6. 不要写其他 shard 的文件
7. 不要改 `jobs.jsonl`
8. 不要重复处理已经存在 `done\\<job_id>.decision.json` 的 job
9. 如果移动 pending job 到 in_progress 失败，说明可能被其他 agent 抢走，直接换下一个

---

## 8. 技术栈与依赖

### 8.1 组件列表

| 组件 | 作用 |
|---|---|
| CPA（Cloud Proxy API） | API 网关，多 provider 轮询 + 冷却 fallback |
| opencode Task 工具 | 父代理派生子代理，天然支持并发 |
| 子代理（Sub-agent） | 每个处理 10 个 job，直接调 CPA |
| PROMPT.md | 任务规则文件，子代理自我读取 |

### 8.2 opencode.json 配置

```json
{
  "provider": {
    "cpa": {
      "models": {
        "auto": {
          "name": "auto"
        }
      },
      "npm": "@ai-sdk/openai-compatible",
      "options": {
        "apiKey": "K8eA_jkLP7pgGLL12c4eG1lhHNIW3R_U",
        "baseURL": "http://127.0.0.1:8317/v1",
        "setCacheKey": true
      }
    },
    "iamhc": {
      "models": {
        "auto": {
          "name": "auto"
        }
      },
      "npm": "@ai-sdk/openai-compatible",
      "options": {
        "apiKey": "sk-3IaNEgjnG3a4l0E3UYpjoMqgxDB73cHT0tFHQQTHRP1rDMOX",
        "baseURL": "https://api.iamhc.cn/v1",
        "setCacheKey": true
      }
    },
    "sensenova": {
      "models": {
        "deepseek-v4-flash": {
          "name": "deepseek-v4-flash"
        }
      },
      "npm": "@ai-sdk/openai-compatible",
      "options": {
        "apiKey": "sk-NUlyivFKaWRxoCtOHlRmQPtQE3PDF3yR",
        "baseURL": "https://token.sensenova.cn/v1",
        "setCacheKey": true
      }
    }
  }
}
```

---

## 9. PROMPT.md 核心规则

子 Agent 读取的 PROMPT.md 包含以下核心规则：

1. **读文件：** 读文件夹内所有 `.job.json`
2. **判断边界：** 逐条判断 `candidate_boundaries`：切一刀后右侧能否独立当训练用
3. **不修改原文：** 不改写、不总结、不合并原文
4. **reason 限制：** `reason ≤ 30 字`，不引用原文
5. **不确定策略：** 不确定 → keep
6. **批量写：** 一个文件的所有边界判断完才写 decision
7. **输出格式：** `xxx_split60_job.decision.json`

---

## 10. 流式补位策略

### 10.1 发现问题

派 10 个子 Agent → 等全部完成 → 再派 10 个 → 慢的线程拖慢整体

### 10.2 优化方案

| 之前 | 之后 |
|---|---|
| 派 10 个 → 等全部做完 → 再派 10 个 | 保持 10 个坑位满着 |
| 快的等慢的，浪费 | 谁做完立刻补一个 |
| 一卡就全部停 | 永不等待 |

### 10.3 具体操作

具体告诉 Agent：
```
不要等全部做完再派下一批。派完 10 个立刻回头扫未完成的继续补，保持 10 个一直在跑，哪个做完补哪个。
```

---

## 11. Auto API 池方案

### 11.1 核心配置修改（3 处）

为支持高并发，需要多 API key 的自动负载均衡：

1. `routing.strategy: "round-robin"`（填充→轮询）
2. `session-affinity: false`（关闭粘性会话绑定）
3. 所有 provider 的 model 名统一，子 Agent 只调同一个名

### 11.2 可用 provider 池

```
使用 provider 池中的多个不同 provider 来分发流量：
  - c         （本地 CPA 服务）
  - iamhc     （另一个远程提供商）
  - sensenova （deepseek-v4-flash）
```

在 opencode 配置中，每个 provider 被配置为一个独立的提供商（provider）。

### 11.3 限速应对

- **单一 provider 限速：** 每个 provider 按照其特定的规则单独进行速率计数或限制管理（使用滑动窗口）
- **429 冷却降级：** 当某个 provider 返回 429 错误时，自动冷却并降级到队列末尾（等待 30s~60s），之后重试
- **请求排队 + FIFO：** 未被选中的 provider 或 pending 的请求会被加入队列，按照 FIFO（先进先出）原则发送

---

## 12. 并发去重与 scents

### 12.1 并发去重规则

1. 处理前先检查 `done\\<job_id>.decision.json` 是否已经存在
2. 如果已存在，跳过该 job
3. 从 `pending` 取任务之后，先移动到 `in_progress`
4. 如果移动失败，说明可能被其他 agent 抢走，换下一个
5. 写 `done\\<job_id>.decision.json` 前，再检查一次是否已存在
6. 如果已存在，不要覆盖，直接放弃当前结果
7. agent 中断后，`in_progress` 里的任务可以重新放回 `pending`

### 12.2 为什么能避免冲突？

**核心设计：** 每个 job 只产生一个 `.decision.json` 文件，文件名就是 job_id，天然互斥。

```
pending/       尚未处理
in_progress/   已被某个 agent 取走
done/          已完成
failed/        失败或人工处理
```

---

## 13. 进度监控与合并

### 13.1 当前进度查看

最简单看法：
```
哪个 batch 文件夹内 .decision.json 等于 .job.json 数量，就是完成了
```

可中断队列模式下看进度：
```powershell
python scripts\check_agent_queue_progress.py
```

中断后重排正在处理的任务：
```powershell
python scripts\requeue_agent_in_progress.py
```

检查是否有重复完成：
```powershell
python scripts\check_agent_queue_duplicates.py
```

### 13.2 合并决策

全部完成后运行：
```powershell
python scripts\merge_agent_decisions.py
```

看输出里的：
```
expected_jobs  总任务数
merged_jobs    已经合并到的任务数
missing_jobs   还没完成的任务数
complete       是否全部完成
```

如果没有报错，就会生成总决策文件：
```
data\agent_split_jobs\large_segments_60m_api_allowed.decisions.jsonl
```

### 13.3 重新分片命令

```powershell
# 重新分成 8 个 shard
python scripts\split_agent_jobs.py --shards 8 --force

# 重新分成 16 个 shard
python scripts\split_agent_jobs.py --shards 16 --force
```

---

## 14. 实际效果

| 指标 | 数值 |
|---|---|
| 总 job 数 | 4355（QQ 2018 + WeChat 2337） |
| Batch 数 | 422 |
| 已处理 | 4217 新跑 + 138 旧归档 = **4355（100%）** |
| 覆盖率 | **100%** |
| Decision 格式 | 全部 `xxx_split60_job.decision.json` |
| 重复文件数 | **0** |
| 格式异常 | **0** |
| 总 cut 点 | ~160（从 54 个有 cut 的 job 中） |
| 总 keep 点 | ~13 |
| 并发子 Agent | 20（2 父 × 10 子） |
| 预计完成时间 | 2~3 小时 |

---

## 15. 经验与教训

### 15.1 最重要的教训

**不能投机取巧用规则代替 AI 判断** —— 4355 个 job 中，4102 个被用硬规则写了 decision，后来发现规则判断不准确，全部撤回重新用 AI 处理。

### 15.2 关键成功因素

1. **切片思维：** 大任务切成小份（每 batch 10 个 job），互不干扰
2. **并发分流：** 双路对进 + 每路 10 子 Agent = 最高 20 并发
3. **流式补位：** 不等待全部完成，保持流水线满负载
4. **指令最小化：** 父 Agent 只调度，子 Agent 只执行，规则写在外部 PROMPT.md
5. **多 key 池化：** 同一模型名映射多个 provider，轮询分发 + 429 降级
6. **标准化收尾：** 格式统一 → 去重 → 归档 → 补齐 → 全量验证

### 15.3 这套方法论的本质

**"把 LLM 当作廉价劳动力来组流水线" —— 用小模型 + 多 key 池 + 多会话，以并发换速度，以标准化保质量。**

---

> **文档结束**
> 如有更新，请同步修改各原始文件后再合并。
