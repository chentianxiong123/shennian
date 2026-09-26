---
title: '廖建军 AI 人格模拟项目 — 设计与架构文档'
date: 2026-07-04
---

# 廖建军 AI 人格模拟项目 — 设计与架构文档

## 1. 项目目标

用一个 **0.5B 参数的小模型**，在 **AMD RX 590 GME（8GB VRAM）** 上运行，通过 **QLoRA + Agent + RAG** 三层架构，模拟微信好友"廖建军"的聊天风格（口癖、话题偏好、情绪反应），实现自然对话。

**最终形态**：一个本地的 Agent 服务，接收用户消息，判断是否需要调用工具，需要时用基础模型（无LoRA），需要回话时用 LoRA 模型输出对方风格回复。

## 2. 硬件与软件约束

| 项目 | 规格 |
|------|------|
| GPU | AMD RX 590 GME (Polaris/GCN4, 8GB VRAM) |
| 系统内存 | 16GB |
| 操作系统 | Windows |
| 编译器 | MSVC 19.44 (VS BuildTools) + CMake |
| GPU 加速 | Vulkan SDK 1.4.350.0 |
| 不支持 | ROCm, CUDA, Tensor Cores, DirectML |

**关键制约**：
- 没有 Tensor Cores → 训练极慢（但 0.5B 参数可接受）
- 无 ROCm → 只能用 Vulkan 后端
- Vulkan 后端在 Windows 下需要控制台窗口才能初始化

## 3. 技术栈现状

| 组件 | 状态 | 路径 |
|------|------|------|
| 基础模型 | ✅ Qwen2.5-0.5B-Instruct Q4_K_M GGUF (480MB) | models/qwen2.5-0.5b-instruct-q4_k_m.gguf |
| QLoRA 训练工具 | ✅ PR #22705 编译成功 | bin/llama-finetune-qlora.exe (Vulkan) |
| LLM 推理工具 | ✅ 同一 PR 编译 | bin/llama-cli.exe (Vulkan) |
| HTTP 服务器 | ✅ 每次请求加载模型（3-5s） | scripts/api_server.py |
| 持久化服务器 | ❌ 尝试失败（stdin pipe 在 Windows 不可靠） | 待用 llama-server.exe |
| Agent 层 | ❌ 未实现 | 设计目标 |
| RAG 层 | ❌ 未实现 | 远期目标 |

## 4. 数据情况

### 4.1 数据来源

**全部为私聊记录，非群聊**。

| 来源 | 文件 | 条数 | 时间范围 |
|------|------|------|----------|
| 微信 | liao_wxid_ibhm6rb434r522.jsonl | 357,548 | 2022-11 ~ 2026-07 |
| QQ | qq_1026044893_final.jsonl | 379,300 | 2022-10 ~ 2025-12 |
| **合计** | | **736,848** | 2022-10 ~ 2026-07 |

### 4.2 微信格式

`json
{"db":0,"type":1,"isSender":1,"createTime":1667729933,
 "datetime":"2022-11-06 18:18:53",
 "content":"怎么你把大伙们沉默了啊"}
`

- isSender=1 = 你（wxid_gbxd54iv2sn422）
- isSender=0 = 廖建军（wxid_ibhm6rb434r522）
- type=1=文本, type=3=图片(XML)

已存在清洗版：liao_..._clean.jsonl，归一化为 sender 字段格式。

### 4.3 QQ 格式

`json
{"time":"2022-10-04 11:48:00","sender":2036680567,"type":"text","text":"怎么办啊"}
`

- sender=2036680567 = 你
- sender=1026044893 = 廖建军

### 4.4 廖建军说话特征（样本分析）

| 指标 | 值 |
|------|-----|
| 平均消息长度 | 6.5 字 |
| <=2字短消息比例 | ~10%（"确实""爬""爽""啊这"） |
| 风格 | 口语化、直接、带攻击性 |
| 高频词 | "吼吼"（笑声）、"坏了"、"逆天"、"纯纯" |
| 常见句式 | "不是...吗"反问、"我"开头表达观点 |
| 话题 | 游戏(LOL/原神/魔兽)、政治(特朗普/哈里斯)、社会、科技(马斯克)、日常吐槽 |
| 网络用语 | "一般货色""差不多得了""纯纯fw""爬睡了" |

## 5. 已完成的实验

### 5.1 QLoRA 训练验证

- 训练工具：llama-finetune-qlora.exe（PR #22705，Vulkan 后端）
- 基础模型：Qwen2.5-0.5B-Instruct Q4_K_M GGUF
- 实验数据：8 条假样本（非真实数据）
- LoRA 参数：rank=16, alpha=16, 120 个权重矩阵, 2.16M 参数
- 训练速度：~6s/epoch（10 样本，ctx=512）
- 结果：模型成功改变身份（输出"我叫廖建军"），但质量差

**LoRA 零token问题**：加载 LoRA 后模型输出 Generation: 1000000.0 t/s（生成0 token，直接吐 EOS）。可能原因：数据过少过拟合/LoRA GGUF 兼容性/GPU 状态不稳定。

### 5.2 API 服务器验证

- Python http.server + subprocess.Popen，每次请求 -f 传文件
- CREATE_NO_WINDOW 避免弹窗，响应时间 ~4-5s/请求
- 输出 OpenAI 兼容格式，已验证基础模型和工具调用正常

### 5.3 持久化进程尝试（失败）

- 尝试 --interactive 模式持久运行，stdin/stdout pipe 通信
- 失败：Windows 下 cmd /c 不转发 stdin pipe 给子进程
- 结论：需要编译 llama-server.exe 实现持久化

## 6. 需要设计的架构

### 6.1 核心问题

`
用户输入 → ? → 廖建军风格回复
`

1. 何时调用工具？判断逻辑在 Agent 层还是模型层？
2. LoRA 和工具调用如何共存？一次只加载一个模型，还是切换？
3. 长回复拆条？廖建军连发多条短消息，AI 输出一段话要不要拆？
4. 上下文管理？保持最近 N 轮对话，防止爆上下文
5. RAG 是否必要？旧聊天记录做 memory augmentation？

### 6.2 建议架构

`
                    ┌──────────┐
                    │ 用户输入  │
                    └────┬─────┘
                         │
                    ┌────▼─────┐
                    │ Agent    │
                    │ 调度层   │
                    │ 1.上下文 │
                    │ 2.意图   │
                    │ 3.分发   │
                    └────┬─────┘
                         │
              ┌──────────┼──────────┐
              │          │          │
        ┌─────▼─────┐ ┌──▼────┐ ┌──▼──────┐
        │ 基础模型   │ │ LoRA  │ │ RAG     │
        │ (无LoRA)  │ │ (风格) │ │ (FAISS) │
        │ 工具调用   │ │ 回复  │ │ 历史记忆│
        └───────────┘ └───────┘ └─────────┘
`

**关键决策**：

A. LoRA 与工具调用分离：工具调用走基础模型（无 LoRA），风格回复走 LoRA 模型

B. Agent 调度：先判断是否需要工具 → 需要则调基础模型 → 否则调 LoRA 模型

C. 长回复拆条：按句号/感叹号/换行切分，1-3条/次，间隔 0.5-1s

D. 上下文：最近 8-12 轮，~2K tokens 上限，超出丢弃最早的

### 6.3 持久化方案

每次请求 3-5s 加载模型，不可用于实时对话。

**方案 1：编译 llama-server.exe**（推荐）
- 从 ggerganov/llama.cpp 主仓库编译，支持 --lora、常驻 VRAM、<1s 延迟
- 编译方法与 llama-cli 相同（MSVC + Vulkan）

**方案 2：双进程切换** → 不行，VRAM 不够同时加载两个 0.5B

**方案 3：单进程动态重载** → 每次重载仍需 3-5s，无意义

### 6.4 RAG 设计（远期）

全量聊天记录(736K条) → bge-small-zh embedding → FAISS 索引 → 运行时检索相似场景插入上下文

## 7. 需要设计的内容

### 7.1 Agent 层详细设计

1. Python 框架选择：asyncio / FastAPI / Flask？是否需要 WebSocket 流式输出？
2. 意图判断：规则匹配 vs 小模型分类？多步工具调用怎么处理？
3. LoRA/基础模型切换策略：单进程下如何实现？llama-server API 能否切换 LoRA？
4. 上下文窗口管理：建议 ctx 大小？滑动窗口策略？是否需要 token 计数？
5. 输出格式：OpenAI 兼容？SSE 流式？长回复拆条算法细节？

### 7.2 数据清洗策略

1. 736K 条 → 训练样本：滑窗大小？连续发言合并？是否保留短消息？预计样本量？
2. LoRA 训练参数：rank=8 vs 16？学习率？epoch？冻结某些层？
3. 评估方案：如何量化"像不像"？需要验证集吗？

### 7.3 RAG 可行性评估

1. LoRA 能否记住足够信息，还是必须 RAG？
2. bge-small-zh 在 RX 590 上的性能（Vulkan 支持）？

### 7.4 优先级建议

分阶段计划：
- Phase 1：最小可行产品（1-2天）
- Phase 2：优化体验（3-5天）
- Phase 3：RAG 与完善（1-2周）

## 8. 参考文件与命令

### 8.1 文件路径

| 文件 | 路径 |
|------|------|
| 微信原始数据 | D:\files\qwen-chat\chat_records\liao_wxid_ibhm6rb434r522.jsonl |
| 微信清洗数据 | D:\files\qwen-chat\chat_records\liao_wxid_ibhm6rb434r522_clean.jsonl |
| QQ 数据 | D:\files\qwen-chat\chat_records\qq_1026044893_final.jsonl |
| 训练工具 | D:\files\qwen-chat\bin\llama-finetune-qlora.exe |
| 推理工具 | D:\files\qwen-chat\bin\llama-cli.exe |
| 基础模型 | D:\files\qwen-chat\models\qwen2.5-0.5b-instruct-q4_k_m.gguf |
| 旧 LoRA | D:\files\qwen-chat\adapters\adapter.gguf |
| API 服务器 | D:\files\qwen-chat\scripts\api_server.py |
| 提取文档 | D:\files\qwen-chat\chat_records\docs\checkpoint.md |

### 8.2 关键命令

`ash
# QLoRA 训练
llama-finetune-qlora.exe -m model.gguf -t data.jsonl --lora-out adapter.gguf --rank 8 --alpha 8 -ngl 99 -mg 1

# 推理（带LoRA）
llama-cli.exe -m model.gguf --lora adapter.gguf -ngl 99 -mg 1 -p "你好" -n 200

# 编译 llama-server
cmake -B build -G "Visual Studio 17 2022" -DCMAKE_BUILD_TYPE=Release -DLLAMA_VULKAN=ON
cmake --build build --config Release --target llama-server
`

## 9. 未解决问题

1. LoRA 零token生成的根因
2. llama-server 是否支持运行时切换 LoRA
3. Vulkan 在 RX 590 上的最大 batch size 和 ctx 限制
4. Qwen2.5-0.5B 在低 token 数下的工具调用可靠性

