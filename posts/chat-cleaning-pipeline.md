---
title: '私聊数据清洗与分流流程记录'
date: 2026-07-04
---

# 私聊数据清洗与分流流程记录

更新时间：2026-07-04

本文档记录当前这套私聊语料清洗流程。目标不是把聊天整理成问答数据，而是保留两个人真实、随机、离散发言的形态，为后续拟人化 agent、边界判断、SFT/LoRA、RAG 和行为调度做准备。

文档中不展开人名、账号、敏感词明细和原文内容。

## 0. 核心原则

1. 原子单位是“一条消息”，不是“一轮问答”。
2. 第一阶段不合并连续消息。
3. 第一阶段不使用滑动窗口作为主表示。
4. 不以“回复关系”划分区间，因为真实聊天经常并不是一问一答。
5. 不假设微信和 QQ 一定能跨平台交错合并。两个平台先分别处理。
6. 断点主要看相邻两条消息之间的时间间隔。
7. 一段对话的“结束”更像是某条消息后面出现了长时间空白；下一段的“开始”是长间隔后的第一条消息。
8. 外援 API 只看可发送数据；命中风险词表的段落整段排除，不做单条消息级别的局部删除。
9. 粗口、辱骂、阴阳怪气等日常风格特征不作为排除依据。

## 1. 当前输入数据

已完成初级清洗后的 JSONL 私聊数据位于项目目录：

```text
D:\files\qwen-chat\chat_records\
```

当前清洗后的每条消息至少包含：

```json
{
  "time": "YYYY-MM-DD HH:MM:SS",
  "sender": "发送者",
  "type": "消息类型",
  "text": "文本内容"
}
```

当前规模：

| 平台 | 消息数 |
|---|---:|
| WeChat | 362,523 |
| QQ | 378,044 |
| 合计 | 740,567 |

说明：这只是初清洗后的数据，不等于最终训练集。

## 2. 第一层结构化：插入时间断点标记

第一层不直接把数据切死，而是构造一个事件流数据库：

```text
data\message_events.sqlite
```

事件流里有两类行：

1. `message`：真实消息。
2. `marker`：脚本插入的时间断点标记。

断点阈值：

```text
60 min, 30 min, 15 min
```

相邻两条消息间隔超过阈值时，在两条消息之间插入一行 marker。这样原始消息仍然保持原子形态，同时数据库里明确标出潜在边界。

当前事件流结果：

| 平台 | message | marker | hard_break | candidate_break | total events |
|---|---:|---:|---:|---:|---:|
| WeChat | 362,523 | 6,848 | 3,049 | 3,799 | 369,371 |
| QQ | 378,044 | 5,925 | 2,617 | 3,308 | 383,969 |

其中：

```text
gap > 60 min => hard_break
15/30 min 命中但未超过 60 min => candidate
```

相关脚本：

```text
scripts\build_event_stream.py
```

主要输出：

```text
data\message_events.sqlite
data\message_events.summary.json
```

## 3. 第二层结构化：生成 60/30/15 三档 session

为了做人工抽样、AI 辅助标注、API 分流和后续对比，需要把同一批消息按不同阈值切成 session。

当前保留三档：

```text
60m, 30m, 15m
```

含义：

| 阈值 | 用途 |
|---|---|
| 60m | 保守硬切分，段更长 |
| 30m | 中间方案 |
| 15m | 更细切分，段更多 |

相关脚本：

```text
scripts\build_sessions.py
```

主要输出：

```text
data\sessions_wechat_60m.jsonl
data\sessions_wechat_30m.jsonl
data\sessions_wechat_15m.jsonl
data\sessions_qq_60m.jsonl
data\sessions_qq_30m.jsonl
data\sessions_qq_15m.jsonl
```

每个 session 保留：

1. 平台。
2. session id。
3. 开始时间、结束时间。
4. 段内消息数。
5. 说话人计数。
6. 类型计数。
7. 段内候选断点。
8. 原始消息列表。

## 4. 阈值差集抽样

为了判断 15/30/60 分钟到底哪个更接近真实聊天边界，已经生成过差集抽样，而不是直接假设某个阈值正确。

当前差集桶：

```text
05_15
15_30
30_60
gt_60
```

用途：

| 桶 | 预期用途 |
|---|---|
| 05_15 | 对照组，通常不一定是断点 |
| 15_30 | 弱候选 |
| 30_60 | 强候选 |
| gt_60 | 很可能是真断点 |

相关脚本：

```text
scripts\sample_boundary_windows.py
```

主要输出：

```text
data\boundary_samples.jsonl
data\boundary_samples_review.md
data\boundary_samples.summary.json
C:\Users\a1\Desktop\boundary_samples_review.md
```

抽样原则：

1. 只围绕相邻两条消息之间的边界。
2. 左右各取固定数量消息作为上下文。
3. 不问“谁回复谁”。
4. 只判断这个边界是否像同一场景、弱切换、还是新场景。

## 5. 外援 API 风险词表

外援 API 前置策略文件：

```text
config\api_review_policy.json
```

当前策略是二分：

```text
api_allowed
api_blocked
```

原则：

1. 默认是 `api_allowed`。
2. 命中风险词表或正则后进入 `api_blocked`。
3. 只为“是否能发给外援 API”服务。
4. 不做风格清洗。
5. 不屏蔽普通粗口辱骂。
6. 不在流程文档中展开具体敏感词。

当前大类方向：

```text
政治/平台风险
显式性内容平台风险
违法/黑灰产/网络攻击/赌博/凭据等平台风险
自伤或严重现实暴力平台风险
手机号/身份证等格式正则
```

已有扫描脚本：

```text
scripts\scan_api_review_policy.py
```

注意：这个脚本只在明确需要扫描时使用。当前主流程不是先输出敏感命中结果，而是先用策略做段级分流。

## 6. 段级整段排除

这是当前刚完成的关键步骤。

不是删除命中的单条消息，而是：

```text
某个 session 内任意一条消息命中策略 => 整个 session 进入 api_blocked
否则 => 整个 session 进入 api_allowed
```

原因：

1. 外援 API 看到的是一段上下文，不是一条孤立消息。
2. 如果只删命中消息，剩余上下文可能仍然泄露或触发平台风险。
3. 局部删除会破坏聊天连续性，不适合作为边界判断或训练样本。
4. blocked 段不是废弃，只是不发送给外援 API，后续可本地处理。

相关脚本：

```text
scripts\filter_session_segments.py
```

输出目录：

```text
data\api_segments\
```

输出命名规则：

```text
sessions_{platform}_{threshold}m_api_allowed.jsonl
sessions_{platform}_{threshold}m_api_blocked.jsonl
sessions_{platform}_{threshold}m.api_review.summary.json
```

## 7. 当前段级分流结果

| 平台 | 阈值 | allowed 段 | blocked 段 | allowed 消息 | blocked 消息 |
|---|---:|---:|---:|---:|---:|
| WeChat | 15m | 5,887 | 962 | 185,403 | 177,120 |
| WeChat | 30m | 3,956 | 875 | 163,863 | 198,660 |
| WeChat | 60m | 2,298 | 752 | 125,345 | 237,178 |
| QQ | 15m | 5,261 | 665 | 206,480 | 171,564 |
| QQ | 30m | 3,547 | 615 | 188,544 | 189,500 |
| QQ | 60m | 2,057 | 561 | 156,028 | 222,016 |

一致性校验：

```text
allowed + blocked = 原始 session/message 总量
```

校验结果：

```text
all consistency checks ok
```

## 8. 目前已经完成的流程链

当前链路可以概括为：

```text
初清洗 JSONL
  -> 按平台分别排序
  -> 插入时间断点 marker，生成事件流数据库
  -> 按 60/30/15 三档切 session
  -> 抽取边界差集样本
  -> 建立外援 API 风险策略
  -> 对不同阈值 session 做整段 allowed/blocked 分流
```

重要产物：

```text
data\message_events.sqlite
data\sessions_*_15m.jsonl
data\sessions_*_30m.jsonl
data\sessions_*_60m.jsonl
data\boundary_samples.jsonl
data\api_segments\*_api_allowed.jsonl
data\api_segments\*_api_blocked.jsonl
config\api_review_policy.json
```

## 9. 这些数据后续怎么用

### 9.1 可发外援 API 的数据

使用：

```text
data\api_segments\*_api_allowed.jsonl
```

适合：

1. 让外部 LLM 判断边界是否合理。
2. 让外部 LLM 辅助打弱标签。
3. 让外部 LLM 帮忙总结场景转换类型。
4. 后续做训练样本筛选。

### 9.2 不发外援 API 的数据

使用：

```text
data\api_segments\*_api_blocked.jsonl
```

适合：

1. 本地模型处理。
2. 暂时跳过。
3. 后续人工或本地规则处理。
4. 作为风格语料候选，但不外发。

blocked 不是删除集，只是外发限制集。

## 10. 下一步建议

最自然的下一步是做边界标注，而不是马上训练。

推荐顺序：

1. 从 `api_allowed` 段中抽边界样本。
2. 让外部 LLM 只判断边界，不改写、不总结隐私内容。
3. 输出结构化标签，例如：

```json
{
  "boundary_label": "same_scene | weak_break | hard_break",
  "confidence": 0.0,
  "reason_type": "time_gap | topic_shift | speaker_pattern | unclear"
}
```

4. blocked 段暂时不发外援 API。
5. 汇总 AI 标签，反推 15/30/60 哪个阈值更适合。
6. 再决定训练样本构造方式。

## 11. 训练前的方向记录

最终目标是拟人化 agent，不是问答机器人。

训练和 agent 设计应分开：

1. LoRA/SFT 负责语言风格、措辞、语气、表达习惯。
2. RAG 负责长期记忆和事实回忆。
3. 行为调度层负责是否说话、什么时候说话、说几条、是否沉默、是否主动换话题。
4. 时间分布、发言频率、连发条数、沉默概率等应主要靠统计建模和外部 agent 约束。
5. 不建议把“随机发言行为”完全压进模型内在能力。

训练数据构造时也应保持消息原子性：

```text
context = 最近一段真实消息流 + 时间 marker + 必要状态
target = 目标角色的下一条真实消息
```

不要构造成传统：

```text
user 问一句 -> assistant 答一句
```

## 12. 操作注意事项

1. 以后扩充词表时，先改 `config\api_review_policy.json`。
2. 改完词表后，先做 JSON 语法检查。
3. 未经确认不要对全量语料输出命中明细。
4. 分流时以整段 session 为单位。
5. 微信和 QQ 继续先分开处理。
6. 任何训练集构造前，都要明确使用的是 15m、30m 还是 60m 版本。
7. 当前 blocked 文件不能直接发给外援 API。
8. 当前 allowed 文件也只是通过规则初筛，不代表绝对安全。

## 13. 常用文件位置

项目目录：

```text
D:\files\qwen-chat
```

脚本：

```text
scripts\build_event_stream.py
scripts\build_sessions.py
scripts\sample_boundary_windows.py
scripts\filter_session_segments.py
scripts\scan_api_review_policy.py
```

配置：

```text
config\api_review_policy.json
```

数据输出：

```text
data\message_events.sqlite
data\message_events.summary.json
data\sessions_*.jsonl
data\sessions_*.summary.json
data\boundary_samples.jsonl
data\boundary_samples_review.md
data\api_segments\
```

桌面人工查看文件：

```text
C:\Users\a1\Desktop\boundary_samples_review.md
C:\Users\a1\Desktop\chat-cleaning-pipeline.md
```
