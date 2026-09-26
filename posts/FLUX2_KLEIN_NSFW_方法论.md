---
title: 'FLUX.2 Klein NSFW Inpainting — 方法论'
date: 2026-07-08
---

# FLUX.2 Klein NSFW Inpainting — 方法论

## 硬件环境

| 组件 | 规格 |
|---|---|
| GPU | AMD RX 590 GME (8GB VRAM, Vulkan, 每分配上限 ~2GB) |
| iGPU | AMD Radeon(TM) Graphics (UMA, 共享内存) |
| RAM | 16GB |
| 系统 | Windows |

## 模型文件

| 文件 | 大小 | 用途 |
|---|---|---|
| `flux-2-klein-9b-Q4_0.gguf` | ~5.3GB | DiT 扩散模型，GPU (Vulkan) |
| `flux2-klein-9b-uncensored-q4_k_m.gguf` | ~5GB | LLM 编码器（Qwen3 文本），CPU |
| `mmproj-Qwen3VL-8B-Instruct-F16.gguf` | ~1.16GB | Vision encoder（Qwen3-VL mmproj），CPU |
| `flux2-vae.safetensors` | ~164MB | VAE 编解码，GPU (Vulkan) |
| `Flux_Klein_NSFW_v2.safetensors` | — | NSFW LoRA |

## 后端分配

```
--backend te=cpu,diffusion=vulkan1,vae=vulkan1
--params-backend cpu
```

- **te** (text encoder = LLM + vision encoder): CPU — 显存不够放 5GB LLM
- **diffusion** (DiT): Vulkan (RX 590) — 4bit Q4_0 量化刚好塞进 8GB
- **vae**: Vulkan — 显存足够，比 CPU 快得多
- **params**: CPU — 权重放内存，按需加载到 GPU

## 架构改动（sd-cli 源码）

### 1. VAE 参考图缓存

**文件**: `stable-diffusion.cpp`, `common.h`, `common.cpp`, `stable-diffusion.h`

新增 `--save-ref-latents` / `--load-ref-latents` 参数，缓存参考图的 VAE encoder 输出。

动机：RX 590 的 Vulkan allocation cap (~2GB) 导致参考图 VAE encode 在大分辨率下 OOM。解决方案：
- 首次用 `--vae cpu` 编码（慢但省显存），保存 latent
- 后续切换到 `--vae vulkan1`，直接加载缓存的 latent

### 2. LLM Vision Encoder 集成

**文件**: `stable-diffusion.cpp`, `conditioner.hpp`, `model_loader.cpp`, `name_conversion.cpp`

#### 改动点：

| 文件 | 位置 | 改动 |
|---|---|---|
| `stable-diffusion.cpp` | line 957 | `false` → `enable_vision = (version==VERSION_FLUX2_KLEIN && llm_vision_path 非空)` |
| `conditioner.hpp` | line 1923 | FLUX2_KLEIN arch: `QWEN3` → `enable_vision ? QWEN3_VL : QWEN3` |
| `conditioner.hpp` | line 2410 | 添加 `Flux2KleinEditPipeline` — 编码 ref image → `<\|vision_start\|>...placeholders...<\|vision_end\|>` 拼接到 prompt 前 |
| `model_loader.cpp` | line 700 | `init_from_file` → `init_from_file_and_convert_name`（触发 mmproj tensor 名字转换） |
| `name_conversion.cpp` | line 1338 | 添加 `VERSION_FLUX2_KLEIN` 到 `convert_qwen3_vl_vision_name` 的条件 |

#### mmproj 兼容性：

Qwen 官方 mmproj 使用 llama.cpp CLIP 命名格式（`v.blk.0.attn_out.bias`），sd-cli 使用 `blocks.0.attn.proj.bias`。通过 `convert_qwen3_vl_vision_name` 函数自动转换：
- `v.blk.` → `blocks.`
- `attn_qkv.` → `attn.qkv.`
- `attn_out.` → `attn.proj.`
- `ffn_up.` → `mlp.linear_fc1.`
- `ffn_down.` → `mlp.linear_fc2.`
- `ln1.` → `norm1.`
- `ln2.` → `norm2.`

## 三层缓存体系

### 第一层：LLM Embedding Cache

```
用法：
  首次： --save-embeddings D:\cache\emb
  后续： --load-embeddings D:\cache\emb

保存内容：LLM encode 输出（含 vision encoder 的结果）
跳过时间：~60-90s（全部在 CPU 上）
```

LLM encode 是最大的瓶颈（每个 prompt 约 60-90s）。缓存后降为 0s。Vision encoder 的结果也在这里面，因为 `encode_image` 在 `get_learned_condition` 内部跑，输出合并到 conditioning vectors 里。

### 第二层：VAE Ref Latents Cache

```
用法：
  首次： --save-ref-latents D:\cache\ref
  后续： --load-ref-latents D:\cache\ref

保存内容：参考图的 VAE encoder 输出（ref_latents.bin）
跳过时间：~0.5s（vae=cpu）或 0s（已被缓存）
```

动机：RX 590 在 Vulkan 下对大图做 VAE encode 会触发 per-allocation 2GB 上限。用 `--vae cpu` 跑一次编码，保存后切换到 `--vae vulkan1`。

### 第三层：Diffusion Step Checkpoints

```
用法： --latent-cache-dir D:\cache\latent

保存内容：扩散过程的中间 latent（每步 checkpoint）
跳过时间：断电/崩溃后从断点续跑
```

## 完整工作流

### 首次运行（全量计算）

```powershell
sd-cli.exe ^
  --diffusion-model D:\models\flux-2-klein-9b-Q4_0.gguf ^
  --llm D:\models\flux2-klein-9b-uncensored-q4_k_m.gguf ^
  --llm_vision D:\models\mmproj-Qwen3VL-8B-Instruct-F16.gguf ^
  --vae D:\models\flux2-vae.safetensors ^
  --lora-model-dir D:\models\lora ^
  --backend te=cpu,diffusion=vulkan1,vae=vulkan1 ^
  --params-backend cpu --mmap --max-vram 6 --diffusion-fa --vae-tiling ^
  --image 原图.png ^
  --mask 蒙版图.png ^
  --ref-image 参考图.jpg ^
  -p "你的提示词" ^
  --steps 20 --cfg-scale 2 ^
  -H 864 -W 1248 ^
  --save-embeddings D:\cache\emb ^
  --save-ref-latents D:\cache\ref ^
  --output output.png
```

预计时间：~10min（LLM 60s + VAE 1s + 扩散 ~500s + VAE decode ~15s）

### 第二次运行（只跑扩散）

```powershell
sd-cli.exe ^
  ...相同参数... ^
  --load-embeddings D:\cache\emb ^
  --load-ref-latents D:\cache\ref ^
  --output output.png
```

预计时间：~8min（跳过 LLM 和 VAE 编码，只有扩散 + VAE decode）

### 只换 prompt（重新 LLM encode）

```powershell
sd-cli.exe ^
  ...相同参数... ^
  --load-ref-latents D:\cache\ref  ^
  --save-embeddings D:\cache\emb  ^
  --output output.png
```

只重新跑 LLM encode（~60s），扩散 + VAE decode 照常。

## 图像输入约定

| 参数 | 要求 |
|---|---|
| `--image` | 原图，RGBA 或 RGB |
| `--mask` | 二值蒙版，白色=要重绘区域。软边/抗锯齿（0-255 渐变）也支持 |
| `--ref-image` | 参考图，RGB |
| `-p` | 提示词，描述要生成的内容 |
| `-H -W` | **输出分辨率**，不一定等于原图。sd-cli 会自动处理 |

## 当前限制

1. **`--stage` pipeline 未实现** — `--stage llm-encode/vae-encode/diffuse/vae-decode` 参数已存在 CLI 解析但从未实际实现。目前用缓存机制替代。
2. **Vision encoder 仅支持单张 ref image** — 代码结构支持多张（参考 BOOGU pipeline），但当前 FLUX.2 Klein pipeline 只处理 `ref_images[0]`。
3. **Prompt 格式** — FLUX.2 Klein 使用 Qwen chat 格式：`<|im_start|>user\n{vision_tokens}{text}<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n`

## 命令参考

### 模型加载参数

```
--diffusion-model   DiT 模型路径（必选）
--llm               LLM 编码器路径（必选）
--llm_vision        Vision encoder mmproj 路径（可选，使用 vision 时必选）
--vae               VAE 模型路径（必选）
--lora-model-dir    LoRA 目录（可选）
```

### 性能参数

```
--backend te=cpu,diffusion=vulkan1,vae=vulkan1
--params-backend cpu     权重放在 CPU 内存
--mmap                   内存映射加速加载
--max-vram 6             最大使用 6GB VRAM
--diffusion-fa           Flash Attention（减少显存）
--vae-tiling             VAE 分块（避免 OOM）
--rng-type flux2         Flux.2 专用随机数
```

### 采样参数

```
--steps 20               步数（建议 20-30）
--cfg-scale 2            CFG 强度（Flux.2 建议 1.5-3）
--sampler-name euler     采样器
--schedule-name flux2    采样调度
```
