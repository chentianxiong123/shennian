---
title: '启动'
date: 2026-04-29
---

﻿# HomeSense Studio · Claude Code 转交文档

> 日期: 2026-05-05
> 项目根目录: D:\files\HomeSense Stdio
> 老项目: D:\files\HomeSense (已闭环)
> 参考仓库: D:\files\HomeSense\References | D:\files\HomeSense\新生

---

## 项目是什么

求职展示用的个人项目。双面系统:

- **Chat**: 家居特化 Agent, 自然语言 → 意图路由 → L0/L1/L2/L3 决策栈 → 执行
- **Studio**: Dify 式工作流控制面, 资产/Workflow 编排/A2A 多 agent 协作
- **共享底座**: memory-kernel / knowledge-compiler / executor-gateway / llm-provider / cli-bridge

核心演示: 用户说"在东芝电视上看 B 站" → mi-cli + adb-cli 端到端闭环。

---

## 技术栈

| 层 | 技术 |
|----|------|
| 后端 | Fastify + TypeScript (端口 3000, tsc 构建) |
| 前端 | Vue 3 + Vite (端口 43173) |
| 数据库 | SQLite |
| CLI | Python mi-cli (packages/mi-cli, uv) |
| LLM | deepseek-v4-flash (推理) / nemotron-nano-12b-v2-vl (视觉) |
| Embedding | qwen3-embedding-8b (不可随意切换) |
| Reranker | qwen3-reranker-8b |

API 来源:
- pie-xian: https://api.pie-xian.com/v1 (推理+视觉)
- ao.pie-xian: https://ao.pie-xian.com/v1 (embedding+rerank)

---

## 目录速览

```
D:\files\HomeSense Stdio\
├── docs/                             ← 15 份架构文档
│   ├── ultimate-architecture-zh.md        ★ 终极架构闭环 (最重要)
│   ├── HANDOVER.md                        ★ 旧版转交文档
│   ├── PROJECT-STATUS-2026-05-04.md       ★ 上次进度
│   ├── mi-cli-mainline-zh.md
│   ├── skill-executor-architecture-zh.md
│   ├── memory-kernel-architecture-zh.md
│   ├── workflow-runtime-dify-alignment-zh.md
│   └── ...
├── packages/
│   ├── backend/src/modules/   ← 33 个模块
│   │   ├── chat/              SSE 聊天路由
│   │   ├── agent-runtime/     AgentRuntime
│   │   ├── intent-router/     意图路由 (有测试)
│   │   ├── context-completer/ L0 上下文补全 (有测试)
│   │   ├── candidate-plan/    CandidatePlan (有测试)
│   │   ├── memory-kernel/     ACE 记忆核 (有测试)
│   │   ├── knowledge-compiler/
│   │   ├── rerank-service/    L2 重排序 (有测试)
│   │   ├── workflow/          WorkflowRuntime
│   │   ├── executor-gateway/  统一执行网关
│   │   ├── cli-bridge/        CLI 桥接
│   │   ├── manifest-registry/ Manifest 注册 (20 个)
│   │   ├── agent-adapter/
│   │   ├── a2a-client/        Codex/Claude/Xiaolongxia
│   │   ├── llm-provider/      LLM 供应商+槽位
│   │   ├── device/            设备路由+发现入库
│   │   ├── entity-registry/
│   │   ├── channels/          飞书/微信/QQ
│   │   ├── compensation/      失败补偿
│   │   └── ...
│   ├── frontend/src/
│   │   ├── views/
│   │   │   ├── ChatView.vue           三栏 SSE 聊天
│   │   │   ├── StudioHomeView.vue     Dify 资产中枢
│   │   │   ├── StudioView.vue         VueFlow 编辑器
│   │   │   ├── DevicesView.vue        HA 式设备注册表
│   │   │   ├── IntegrationsView.vue   CLI/插件/集成中枢
│   │   │   └── ...
│   │   ├── components/         11 个通用组件
│   │   └── api/index.ts        统一 API
│   ├── mi-cli/                 Python 米家 CLI (V1 完成)
│   └── bilibili-cli/           B 站 dry-run CLI
├── skills/                     CLI 执行器清单
│   ├── mi-cli/SKILL.md
│   ├── adb-cli/EXECUTOR.json
│   ├── bilibili-cli/EXECUTOR.json
│   └── hami-cli/EXECUTOR.json  ← 已封档
└── data/                       SQLite DB
```

---

## 架构核心

### Chat 决策栈 (L0→L3)
- **L0**: 上下文补全 (设备别名/默认设备/历史偏好)
- **L1**: 高置信直达 (compiled plan / 规则 / 熟 skill)
- **L2**: 算法优先 CandidatePlan — 多路召回 + **reranker 主判, 不用 LLM**
- **L3**: LLM/ReAct fallback — 仅 L0/L1/L2 全失败时触发

### Workflow / Studio
- 显式 trigger → 显式 graph → executor dispatch → A2A / multi-agent
- **不复用 Chat 的 L1/L2/L3**
- 可调用共享底座: CandidatePlan / knowledge / rerank / executor / A2A
- 待升级: GraphEngine + NodeFactory (Dify 对齐文档已写)

### 记忆系统
- MemoryKernel: 长期事实 + 经验索引 + 家庭知识图谱
- KnowledgeCompiler: 原始记忆 → Compiled Wiki / Plan / Experience Note
- **embedding 不可随意切换** (换模型会破坏向量空间)
- LLM Wiki (Karpathy 编译器模式) 已融入

### 管理面三块拆分
- **Studio** → 资产+Workflow
- **设备管理 (/devices)** → HA 式 Device/Entity/Service/State (不放扫码)
- **集成管理 (/integrations)** → CLI/插件/A2A/Channel (mi-cli 扫码在这里)

### 厚适配器 vs 薄接入
- mi-cli/adb-cli/bilibili-cli: 内置厚面板, 是演示故事一部分
- 外部 CLI: 只需要 EXECUTOR.json + 标准 JSON 输出, 不进厚面板

---

## 当前状态

### 构建 & 测试: 全绿
- 后端构建: ✅ | 前端构建: ✅
- 前端测试: 13 文件 / 33 测试 ✅
- 后端测试: 5 文件 / 11 测试 ✅
- 编码检查: ✅ | Manifest 检查: ✅

### 模块完成度

| 领域 | % | 状态 |
|------|---|------|
| 架构文档 | 90% | 15 份, 全覆盖 |
| 前端 UI | 80% | 页面全搭完, 中英双语 |
| Chat 运行时 | 65% | intent-router+L1/L2/L3 骨架; 待接真 LLM |
| Workflow 运行时 | 60% | 编辑+执行骨架; 待 GraphEngine/NodeFactory |
| 记忆系统 | 55% | ACE核+编译器+profiles; 待接真 embedding |
| CLI 集成 | 70% | mi-cli V1, adb/bilibili dry-run, cli-bridge 完整 |
| 真实基础设施 | 35% | API 密钥已配, 未验证; 未连真实设备 |
| 测试覆盖 | 50% | 44 测试; 虚拟 smoke; 缺真实集成测试 |

### mi-cli 状态
- QR 登录流程实现, 未真实小米账号实测
- 全套动作: discover/scene/speaker/IR/MIoT
- 控制顺序: scene_execute → ir_press_key → speaker_execute → set_prop
- 小爱走 MIoT action 主链, Mina 仅 speaker_status 且标记 experimental

### hami-cli / HA: 已硬封档
- cli-bridge 有 `ARCHIVED_EXECUTOR_NAMES` 硬阻断
- 当前 CLI 清单仅: `cli.adb-cli, cli.bilibili-cli, cli.mi-cli`

---

## 已知问题

1. **编码**: PS5.1 的 `Get-Content` 默认 GBK 读 UTF-8 文件会乱码。profile 里已写好 utf8 默认值但执行策略 Restricted 导致不生效。用户需管理员终端执行: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force`。临时方案: 读中文文件显式加 `-Encoding UTF8`。

2. **pwsh.exe 在沙箱内被阻断**, 所有命令只能走 powershell.exe。

3. **模型 API 完全未验证**。

---

## 参考项目 (20+)

Dify / OpenClaw / Hermes / HA / Xiaolongxia / Orra / Karpathy LLM Wiki / 多个米家第三方项目。

代码参考: D:\files\HomeSense\References

---

## 下一步 (给 Claude Code)

### 优先级 1: 打通基础设施
1. 验证 embedding/rerank API 可用
2. 协助用户 mi-cli 真实登录
3. deepseek-v4-flash 接 Chat L3

### 优先级 2: 核心链路
4. Chat "看电视的 B 站" 完整调试
5. WorkflowRuntime: GraphEngine + NodeFactory
6. 记忆: embedding 接入后验证召回

### 优先级 3: 演示就绪
7. 设备页实体动作面板
8. 端到端演示录屏
9. GitHub README + 架构图

### 建议先读
1. docs/ultimate-architecture-zh.md
2. docs/PROJECT-STATUS-2026-05-04.md
3. docs/mi-cli-mainline-zh.md
4. docs/skill-executor-architecture-zh.md
5. docs/memory-kernel-architecture-zh.md

### 构建 & 验证
```bash
npm run build --workspace backend
npm run build --workspace frontend
npm run -w frontend test
npm run check:encoding
# 启动
node packages/backend/dist/index.js    # :3000
npm run dev --workspace frontend       # :43173
```
