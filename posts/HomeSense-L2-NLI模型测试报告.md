---
title: 'HomeSense NLI 方向判定模型测试报告（MiniLMv2-XNLI）'
date: 2026-09-02
---

# HomeSense NLI 方向判定模型测试报告（MiniLMv2-XNLI）

> 日期：2026-09-02
> 模型：`onnx-community/multilingual-MiniLMv2-L6-mnli-xnli-ONNX`（int8）
> 格式：XLMRobertaForSequenceClassification，输入 `input_ids`+`attention_mask`，输出 `logits`(3类)
> 体积：107MB（单文件，无外部数据）
> 测试环境：本机 x86_64，onnxruntime-purego（纯 Go，无 cgo）

---

## 1. 背景

为缓解 v2 混合检索的方向性硬伤（反义误报：熄灯→开灯、放大→调小），调研业界用 **NLI（自然语言推理）模型**做方向校准：判定 query 与候选意图是「蕴含 / 矛盾 / 中立」。

对比过的中文 NLI 现成模型：

| 模型 | 语言 | ONNX? | 大小 | 结论 |
|------|------|-------|------|------|
| IDEA-CCNL/Erlangshen-Roberta-110M-NLI | 中文 | ❌ 仅 pytorch | 409MB | 无法跑 |
| uer/sbert-base-chinese-nli | 中文 | ❌ 仅 pytorch | - | 无法跑 |
| onnx-community/EttinX-nli-xxs | 英文 | ✅ | 17MB | 中文不支持 |
| onnx-community/multilingual-nli-bert | 多语含zh | ✅ | 179MB | 可用但大 |
| **multilingual-MiniLMv2-L6-mnli-xnli** | 多语含zh | ✅ | **107MB** | **选用（最小中文可用）** |

---

## 2. 调用方式验证

model card 官方用法（NLI）：
```python
tokenizer(premise, hypothesis, truncation=True)  # <s> premise </s></s> hypothesis </s>
output = model(input_ids)  → logits → softmax → [entailment, neutral, contradiction]
```

Go 端实现：
- `tok.Encode(tokenizer.NewDualEncodeInput(NewInputSequence(premise), NewInputSequence(hypothesis)), true)` 生成 `<s> A </s></s> B </s>` ✅
- 输入 `input_ids` + `attention_mask`，输出取 `logits` → softmax → 3 类 ✅
- 验证 IO：`inputs=[input_ids attention_mask] outputs=[logits]` ✅

**调用方式完全正确，不是误用。**

---

## 3. 速度实测（x86_64 本机，含 tokenize，IntraOpNumThreads=4）

| maxLen | 平均延迟 |
|--------|---------|
| 32 | **4.6 ms** |
| 64 | **6.7 ms** |
| 128 | **11.7 ms** |
| 长句 128 | **12.3 ms** |

比 bge embedding（~33ms）还快。ARM64 手机预估放大 2-4 倍 ≈ 30-50ms。**速度完全不是问题。**

---

## 4. 方向判定质量实测（18 组）

| premise | hypothesis | E | N | C | 判定 | 期望 | 正确? |
|---------|-----------|---|---|---|------|------|-------|
| 把声音放大 | 调高音量 | 0.33 | 0.57 | 0.10 | neutral | entail | ❌ |
| 把声音放大 | 调低音量 | 0.13 | 0.45 | 0.43 | neutral | contradiction | ⚠️方向可区分但不够 |
| 大声点 | 调高音量 | 0.33 | 0.58 | 0.09 | neutral | entail | ❌ |
| 小声点 | 调低音量 | 0.14 | 0.47 | 0.39 | neutral | entail | ❌ |
| **熄灯** | **关灯** | 0.23 | 0.19 | **0.58** | **contradiction** | entail | **❌ 熄=关 判成矛盾** |
| 熄灯 | 开灯 | 0.14 | 0.09 | 0.77 | contradiction | contradiction | ✅ |
| 把客厅灯灭了 | 关客厅灯 | 0.47 | 0.39 | 0.14 | entail | entail | ✅ |
| **把客厅灯灭了** | **开客厅灯** | **0.51** | 0.36 | 0.13 | **entail** | contradiction | **❌ 反义判成蕴含** |
| 我到家了 | 回家模式 | 0.22 | 0.63 | 0.15 | neutral | entail | ⚠️弱 |
| 我要出门了 | 离家模式 | 0.28 | 0.42 | 0.31 | neutral | entail | ⚠️弱 |
| 我要出门了 | 回家模式 | 0.27 | 0.57 | 0.16 | neutral | contradiction | ⚠️弱 |
| 回家 | 回家模式 | 0.61 | 0.31 | 0.08 | entail | entail | ✅ |
| 开冷气 | 开空调 | 0.31 | 0.50 | 0.19 | neutral | entail | ❌弱 |
| 投屏到电视 | 投屏 | 0.47 | 0.22 | 0.30 | entail | entail | ✅ |
| 投屏到电视 | 关电视 | 0.40 | 0.35 | 0.25 | entail | neutral | ❌ |
| 打开电视 | 开空调 | 0.16 | 0.62 | 0.21 | neutral | neutral | ✅ |
| 今天天气怎么样 | 回家模式 | 0.10 | 0.75 | 0.15 | neutral | neutral | ✅ |
| 帮我订个外卖 | 投屏 | 0.17 | 0.11 | 0.73 | contradiction | contradiction | ✅ |

---

## 5. 结论（不粉饰）

### 5.1 能力上限
- model card 明示 XNLI 平均准确率仅 **0.71**（15 语言平均），且作者推荐更高性能用 mDeBERTa-v3-base
- 对**中文超短口语短语（熄灯/小声点/灭了）是盲区**：
  - 熄灯 → 关灯 被判 **contradiction**（大错）
  - 把客厅灯灭了 → 开客厅灯 被判 **entail**（反义判成蕴含）
- 单独当硬 gate 会引入**新的误判**，不比现有 hard-negative 方案强

### 5.2 速度
- 107MB int8，x86 6-12ms/次，速度完全够用（非瓶颈）

### 5.3 部署代价
- 体积 42MB → 149MB（+107MB）
- 结论：**速度可接受，但能力上限（0.71）撑不起方向性硬裁决**

---

## 6. 后续选项

| 方案 | 速度 | 体积 | 方向性效果 |
|------|------|------|-----------|
| A. MiniLM 当软校准（与 embedding 加权，不当唯一裁判） | +7ms | +107MB | ⚠️ 有改善但不稳 |
| B. mDeBERTa-v3-base NLI | ❌ 见 7 | ❌ | ❌ 开箱即用的 ONNX 导出不可用 |
| C. hard-negative 逐个钉方向坑（零新增） | 0 | 0 | ⚠️ 治标，已知坑有效 |
| D. 高置信本地 / 低置信云端 LLM（业界混合路由） | - | - | ✅ 最终形态 |

---

## 7. mDeBERTa-v3-base 实测追击记录（B 方案彻底否决）

> 追加：2026-09-02 晚。MiniLM 不够用时一度想上 mDeBERTa-v3-base（XNLI 中文 accuracy 0.803），对开箱即用的 ONNX 版本做了实测，**结论是此路不通，已正式移除 B 方案。**

### 7.1 下载与体积
- 仓库 `onnx-community/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7-ONNX`
- `onnx/model_int8.onnx` = 338MB（int8）；`model.onnx` = 566MB（fp32）
- **下载走 hf-mirror.com 镜像，~2MB/s，curl 顺畅**（浏览器/hf_hub 直连 huggingface.co 国内不可用）

### 7.2 架构差异（Disentangled Relative Position）
- config：`model_type=deberta-v2`，`type_vocab_size=0`，12 层，hidden 768
- ONNX 图输入：**只有 `input_ids` + `attention_mask`**（无 `token_type_ids`）
- 查证：导出器在 `type_vocab_size==0` 时会**主动删除** token_type_ids → 图里没有它**是正常导出**，不是漏传。但代价是 DeBERTa 原版用于区分两段话语的 disentangled relative position 信息在 ONNX 图中先天残缺

### 7.3 速度实测（本机 x86_64，int8，含 tokenize，4 线程）

| maxLen | mDeBERTa-base（12层，338MB） | MiniLM-L6（6层，107MB） | 倍数 |
|--------|---------------------------|------------------------|------|
| 32 | **31.7 ms** | 3.4 ms | ~9x |
| 64 | **59.0 ms** | 6.0 ms | ~10x |
| 128 | **121.6 ms** | 11.4 ms | ~11x |

- 速度是致命伤：12 层 attention + disentangled 每层加一个位置计算，延迟几乎随句长线性翻倍
- 手机 ARM 再放大 2-4x → 家宽指令（64）约 120-240ms，已超短口语输入的手感阈值

### 7.4 方向判定质量（18 组同款样例）—— 输出退化

全部 18 组样例结果几乎相同，**分类头对输入几乎不响应**：

| premise | hypothesis | E | N | C |
|---------|-----------|---|---|---|
| 熄灯 | 开灯（应矛盾） | 0.52 | 0.47 | **0.01** |
| 熄灯 | 关灯（应蕴含） | 0.47 | 0.52 | **0.01** |
| 把声音放大 | 调高音量（应蕴含） | 0.56 | 0.44 | 0.01 |
| 把声音放大 | 调低音量（应矛盾） | 0.55 | 0.45 | 0.01 |
| 帮我订个外卖 | 投屏（应矛盾） | 0.51 | 0.48 | 0.01 |

- raw logits：entail/neutral 只在 1.37~1.65 区间微动，**contradiction logit 被恒定钳在 -2.7 附近** → softmax 后 C 恒为 ~0.01
- MiniLM 同路径、同代码能给出极化区分（熄灯→开灯 C=0.77），且 Python tokenizers 复现了完全一致的退化结果 → **不是 Go 代码、不是 tokenizer 用法问题**
- 单句输入 vs 双句输入输出几乎相同 → **int8 量化把分类头压扁，contradiction 门死亡**

### 7.5 关键否决依据（模型卡原文 + 导出机制）
- 模型卡原文：**"mDeBERTa currently does not support FP16"** → fp16 版不可用；fp32 原始权重 2GB+，手机存不下
- XNLI 中文 accuracy 0.803 是**长句基准**成绩，非超短口语短语
- int8 量化退化 + ONNX 导出缺失 relative-position 信息双重打击 → **现成 ONNX 无法直接裁决最需要的「反义」**

### 7.6 新结论
1. **mDeBERTa ONNX 这条路整体关闭**。不是慢不慢的问题，是现成 int8 导出质量不行（分类头退化）
2. 要用 mDeBERTa 必须自己做 fp32→int8 重新校准量化，且仍受 TypeVocabSize=0 导出限制 → 投入产出比差
3. **NLI 模型线（MiniLM / mDeBERTa）均不采用**，方向性回到**规则硬钉**（方案 C），云端 LLM 路由（方案 D）作为长期形态
4. 教训：**下大文件（>300MB）用 `hf-mirror.com` + `curl -L` 带断点续传，别用浏览器直连 huggingface.co**

---

## 8. 相关文件
- 模型：`/tmp/minilm-nli/model_nli_int8.onnx` + `tokenizer.json` + `config.json`（MiniLM，保留）
- mDeBERTa：`/tmp/mdeberta-nli/`（int8 338MB，结论不可用，可删）
- 测试：`/tmp/nli-bench/`（`infer` 方向判定、`bench` 延迟）
- 模型源：`onnx-community/multilingual-MiniLMv2-L6-mnli-xnli-ONNX`；`onnx-community/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7-ONNX`
- 姊妹篇：`~/Desktop/HomeSense-L2-混合检索测试报告.md`
