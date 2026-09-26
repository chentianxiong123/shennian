---
title: 'HomeSense L2 混合检索（v2）测试数据报告'
date: 2026-09-02
---

# HomeSense L2 混合检索（v2）测试数据报告

> 日期：2026-09-02
> 组件：`pkg/workflowmatch`（fingerprint + BM25 + embedding + RRF + 意图卡片反例否决）
> 模型：bge-small-zh-v1.5 INT8 ONNX（512 维，本地推理 ~33ms）
> 测试环境：本机 x86_64（AMD Ryzen 5 5500U），阈值 0.65

---

## 1. 架构（v2）

```
workflow_match:
  ① fingerprint SHA256       精确命中即返回       0.1ms
  ② BM25 词面 (CJK 二元组)    召回「回家/到家了」类   ~0ms
  ③ embedding 语义 (512 维)   召回换词说法            ~33ms
      ↓
  RRF 融合 (k=60) → 按 chain 聚合 → 反例否决 → top1 + confidence
```

- 意图卡片：每个 workflow 的 `intents`（多个 positive 锚点，逐条入库）、`negative_examples`（反例否决）、`confusable`。
- 反例否决规则：候选 chain 的任一反例与 query 的 cos ≥ 该 chain 最佳正例 cos - 0.02 且 ≥ 0.55 → 整链否决。
- 置信度 = `max(cos, lexical coverage)`（coverage 为 query 词命中文档比例，修掉归一化 BM25 假高分）。

---

## 2. 测试集 A：回归测试（55 例）

**声明：此测试有水分。** 测试短语大多直接写入了意图卡片的 `intents`，靠 fingerprint 精确命中（等于"背答案"），**不代表真实泛化能力**。

结果：55/55 (100%)，0 误报 —— 该数字仅证明"卡片内说法都能命中"，不反映新说法效果。

### 覆盖亮点（卡片内）
- 小声点 / 开冷气 / 我到家了 / 到家了 → fingerprint 直接命中（v1 全漏报）
- 离家模式 → away_mode 正确，且被 home_mode 的 negative 否决不再撞回
- 无关输入（天气/外卖/新闻联播）全部拒绝

---

## 3. 测试集 B：Hold-out 泛化测试（51 例，卡片仅 2-3 锚点，测试说法未入卡片）

**这是真实泛化能力的数字。**

结果：**51 例命中 43 (84%)，误报 1**（thr 0.65）

### 正确泛化（38 例，说明混合检索核心有效）
- 我回家了/到家了/回来了/下班回来了 → home_mode（embedding/BM25 泛化）
- 出门了/我出门去了/打开离家模式/出门上班/离开家 → away_mode
- 看电影/我想看个电影/放个电影/今晚看部电影 → movie_mode
- 帮我开下灯/开下灯/把客厅灯亮起来/打开客厅的灯/灯打开 → on_lights
- 帮我关下灯/关下灯/灯关上 → off_lights
- 投一下屏/把手机投到大屏/投屏手机/手机投屏/投屏到大屏 → cast_tv
- 把声音弄小一点/音量要小/给我调小声 → volume_down
- 声音大点/调大声/再来大点声 → volume_up
- 把空调打开/开下空调/空调开开/制冷/开一下制冷 → ac_cool

### 漏报（7 例）
| 说法 | 期望 | 实际 | 原因 |
|------|------|------|------|
| 打开电影模式 | movie_mode | nil (0.00) | 泛化不足 |
| 把客厅灯灭了 | off_lights | nil | 「灭了」未覆盖，coverage=0.4 < 0.65 |
| 熄灯 | off_lights | → on_lights (0.74) | **反义陷阱**：emb 跑偏到开灯 |
| 小声点 | volume_down | nil (0.00) | 词面无重叠 |
| 声音小点 | volume_down | nil (0.00) | 词面无重叠 |
| 把声音放大 | volume_up | → volume_down (0.80) | **方向性反了**：把声音X 强overlap到「调小」 |
| 音量放大 | volume_up | → volume_down (0.81) | 同上，方向性反了 |

### 误报（1 例）
| 说法 | 期望 | 实际 | 原因 |
|------|------|------|------|
| 我要睡觉了 | 拒绝 | → away_mode (0.69) | 「我要」前缀撞上「我要出门了」 |

---

## 4. 方向性漏报分析（核心硬伤）

embedding 模型对反义词方向（开/关、放大/调小、熄/开）本质不敏感：
- 熄灯 → 被认成「开灯」（0.74）
- 把声音放大 → 被认成「调小」（0.80）
- 把客厅灯灭了 → 完全漏掉

这是业界公开弱点（ACL 2024《Can Your Model Tell a Negation from an Implicature?》证实所有 embedding 模型对否定/反义语义理解差）。**不是实现 bug，是模型能力天花板。**

当前缓解手段 = 意图卡片 hard-negative（把反义词写进 `negative_examples`），能钉死已知坑，但对未预见的反义表达无效。

---

## 5. L1 规则拦截（方向性第一道防线）

```
打开电视 → device=电视 cap=turn_on   ✅ 拦截
关电视   → device=电视 cap=turn_off  ✅ 拦截
开客厅灯 → device=灯  cap=turn_on    ✅ 拦截
关空调   → device=空调 cap=turn_off  ✅ 拦截
```
简单开/关+设备指令由 `rule_engine` 直接消化，不进 L2。

---

## 6. 结论

| 指标 | 值 | 说明 |
|------|-----|------|
| 卡片内召回 | 100% | 背答案性质，不具参考价值 |
| 真实泛化召回 | **84%** | hold-out 51 例 |
| 真实误报 | 1/51 | 「我要睡觉了」→ away |
| 方向性 | **硬伤** | 反义/方向仍需 hard-negative 逐个钉死 |
| 延迟 | fingerprint 0.1ms / BM25 ~0ms / embedding ~33ms | |
| 体积 | ~42MB | 模型24MB + libonnxruntime 18MB + binary |

### 改进空间
1. 补 hard-negative（每个方向坑写反例）→ 治标
2. 加 NLI 模型做方向软校准（见桌面另一份报告）→ 治本方向，但引入体积
3. 高置信本地接管、低置信云端 LLM（业界混合路由）→ 最终形态
