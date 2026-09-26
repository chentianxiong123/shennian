---
title: 'HomeSense L2 中文嵌入模型 — 完整复盘（试错 / 换思路 / 正确路径）'
date: 2026-09-02
---

# HomeSense L2 中文嵌入模型 — 完整复盘（试错 / 换思路 / 正确路径）

> 日期：2026-09-02
> 项目：HomeSense v5 执行端意图匹配（手机/盒子本地，零云端）
> 结论先行：最终锁定 **bge-small-zh-v1.5 INT8 ONNX + onnxruntime-purego（纯 Go，无 cgo）**，maxLen=128 本地推理，并把下一个版本升级为「BM25 + embedding + fingerprint」混合检索。

---

## 一、整个决策过程（换思路 5 次）

### 1. 起点：中转站 API 出问题
- 项目里有 pie-xian 中转站的 key，一开始想用它的 `/v1/embeddings` 当云端 embedding。
- **教训 1**：用 curl 反复探测中转站模型列表，触发了中转站的限流/风控，key 一度被临时封（返回「无效令牌」）。之后 key 恢复，但确认了「别人的中转站别乱测、别依赖」。
- 中转站 `all-mpnet-base-v2`（768 维，110M 参数，7 个 embedding 模型里最小）。
- **决策 1**：不依赖中转站，转本地。

### 2. 云端免费资源排查（绕了一大圈）
- 查了 HuggingFace Serverless API（免费，~$0.10/月额度、限速）、Cloudflare Workers AI（只有 bge-English，无中文可用）、模力方舟 ai.gitee.com（每天 100 次免费，但不含目标任务）。
- **结论 2**：没有「永久免费 + 中文好 + all-mpnet-base-v2」的云端方案；要中文好必须本地。

### 3. 目标模型选择：中文本地小模型对比
| 模型 | 参数 | INT8 体积 | 维度 | 中文 |
|---|---|---|---|---|
| all-mpnet-base-v2 | 110M | ~23MB(模型) | 768 | 英文向 |
| bge-base-zh-v1.5 | 102M | ~100MB | 768 | ✓ |
| **bge-small-zh-v1.5** | **24M** | **~23MB** | **512** | ✓ C-MTEB 57.8 |
| Qwen3-Embedding-0.6B | 633M | ~600MB | 1024 | ✓ 但太大 |

**决策 3**：bge-small-zh-v1.5。体积最小、中文优化、手机可跑。（曾纠结 512 维不能和 768 维互查，后来放弃云端混查，全走本地。）单文件核对了 ONNX 各变体体积：INT8 23MB 反而是最小的（q4 50MB、q4f16 28MB、fp16 45MB），**用 INT8 版**。

### 4. 运行方案大弯路：从「Go 直接绑 ORT」到「purego」
- 用户明确 **不要 Python、不要打包 Python、手机 Termux 上也不装** → 排除 Python 子进程。
- 试 `yalue/onnxruntime_go`（cgo 绑定）：
  - **教训 4**：该库 `ORT_API_VERSION` 和官方预编译 `libonnxruntime.so` 版本对不上（要 29，释出只有 1~20/1~23），折腾各种版本组合全部失败。
  - **换思路**：用 `github.com/shota3506/onnxruntime-purego` —— **purego 动态加载 .so，零 cgo**，跨平台无编译地狱。只支持 ORT 1.23.x（API v23），下载 aarch64 版 `onnxruntime-linux-aarch64-1.23.1.tgz`（注意：curl 不带 -L 会 404，用 wget 成功）。

### 5. 效果翻车与关键修复（CLS/SEP）
- 模型加载成功后，相似度偏低：「我要回家了」vs「回家模式」只有 0.53。
- **以为模型烂**，排查方向：指令前缀（BGE 检索式指令反而更差）、中文分词（其实正常）、Go 端 vs Python 官方输出对照。
- **真正根因**：`sugarme/tokenizer` 的 `EncodeSingle(text)` 默认**不加 `[CLS]`/`[SEP]`**。训练时输入 `[CLS] 句子 [SEP]`，缺了就向量错位。改成 `EncodeSingle(text, true)` 后：
  - "我要回家了"vs"回家模式" 0.53 → **0.65**
  - "把声音调小一点"vs"调低音量" 0.54 → **0.72**
- 另一个 panic 坑：`tokenizer.NewTokenizerFromFile` 是**空 TODO**返回 nil，必须用 `pretrained.FromFile`。

### 6. 本地速度优化
- 默认 `maxLen=512`：x86_64 ~164ms/次；意图文本都 ≤10 字，降到 **128** → **~33ms/次**（约 5 倍），手机 ARM64 预估 150-300ms。
- 部署体积：模型 24MB + libonnxruntime 18MB + binary ≈ 42MB。

---

## 二、效果实测（9 意图 × 55 说法）

| 阈值 | 召回率 | 误报 |
|---|---|---|
| 0.60 | 88% | 4/14 |
| 0.65 | 84% | 6/14 |
| 0.70 | 84% | 8/14 |

强同义（放→播放新闻联播 0.96、投屏 0.93）很好；嵌入可正确拒绝无关输入（天气/外卖）。

### 暴露的两个硬伤（纯 embedding 单通道通病）
1. **反义误报**：「打开灯」→「关灯」0.68、「离家模式」→「回家模式」0.80。embedding 认语义近不认方向。
2. **口语简写漏报**：「小声点」「开冷气」「我到家了」单锚点相似度不足(0.55)。

---

## 三、业界调研结论（怎么继续）

看了 Google(EMNLP 2025)、ACL 2023 zero/few-shot、Nature 端侧意图、Qdrant Edge、HuggingFace 讨论、中文生产案例(86%→97%)：

1. **纯 embedding 不是主流**，生产用 **混合检索**：BM25 词面 + embedding 语义 + RRF 融合。
2. **意图卡片**（Intent Card）替代单文本锚点：每个 intent 给多个 positive 说法 + negative 反例 + 混淆意图。
3. **规则优先分流**：先判断「是不是意图问题/方向对不对」，再给模型。L1 规则引擎先拦开关类。
4. 模型上：RoBERTa/XLNet-Base 或 bge-small 足够，**换策略收益 >> 换模型**。

---

## 四、下一步（已确认要做的）

```
workflow_match 升级为 3 通道：
① fingerprint 精确   (0.1ms, 已有)
② BM25 词面         (0.1ms, 手写~50行)
③ embedding 语义    (33ms, 已有)
      ↓ RRF 融合 + 意图卡片(positive/negative) 校准
```

配套改动：
- workflow JSON 加 `intents`（positive 说法）+ `negative_examples`（反例）
- `LoadWorkflows` 把每个 intent 生成 fingerprint+embedding 入库
- 默认阈值 0.65（原 0.75）
- 预期：召回 88% → ~97%，误报 4/14 → ~1/14

---

## 五、踩坑清单（速查）

| # | 坑 | 修法 |
|---|---|---|
| 1 | 别乱测别人中转站 API / 别依赖 | key 可能被封，转本地 |
| 2 | AND 中转站只有 all-mpnet-base-v2 等英文向 | 中文要本地 bge-* |
| 3 | yalue/onnxruntime_go 版本对不上 | 换 onnxruntime-purego（零 cgo） |
| 4 | ORT 下载 curl 无 -L 会 404 | 用 wget 或 curl -L |
| 5 | EncodeSingle 默认不加 CLS/SEP | `EncodeSingle(text, true)` |
| 6 | NewTokenizerFromFile 是空 TODO | 用 `pretrained.FromFile` |
| 7 | ONNX external data 名不能改 | model_quantized.onnx + .onnx_data 成对 |
| 8 | 512 太长慢(~164ms) | maxLen=128 → ~33ms |
| 9 | purego 只支持 ORT 1.23.x | 锁 libonnxruntime v1.23.1 |
| 10 | ARM64 vs x86_64 .so 别混 | 部署 ARM64，本地测试换 x64 测完换回 |
| 11 | 别当模型「烂」就换 | 先查 CLS/SEP、分词、阈值，再谈换模型 |