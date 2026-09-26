---
title: 'FLUX.2 Klein 9B 分步管线方案'
date: 2026-07-07
---

# FLUX.2 Klein 9B 分步管线方案

## 核心理念

**一次只加载一个模型，中间结果存内存，最后才写磁盘。**

相比 ComfyUI / sd-cli 一次性加载所有模型，分步管线让每步独享全部资源（尤其 VRAM）。

---

## 架构图

```
Step 1                     Step 2                     Step 3
┌──────────────┐          ┌──────────────┐          ┌──────────────┐
│  加载 Qwen3  │          │   加载 DiT   │          │   加载 VAE   │
│  text encoder│          │  diffusion   │          │  decode      │
│              │          │              │          │              │
│ prompt ─────→│ cond     │ cond ───────→│ latent   │ latent ─────→│ img
│ (CPU 5GB)    │ float[]  │ (GPU 3-4GB)  │ float[]  │ (GPU 0.5GB)  │ png
│              │          │              │          │              │
│ ↓ 释放 Qwen3 │          │ ↓ 释放 DiT   │          │ ↓ 释放 VAE   │
│ VRAM: 0     │          │ VRAM: 0     │          │ 写磁盘完成   │
└──────────────┘          └──────────────┘          └──────────────┘

内存中传递: cond (float array) → latent (float array) → image (sd_image_t)
```

---

## 具体改动：给 DLL 加三个导出函数

### 1. sd_encode_condition — 只跑文本编码

将 prompt 编码为 conditioning tensor，以 flat float array 返回。

```c
SD_API bool sd_encode_condition(
    sd_ctx_t* sd_ctx,
    const char* prompt,
    const char* negative_prompt,
    const sd_lora_t* loras,
    int lora_count,
    float** cond_data,     // 输出：condition float 数组（调用者 free）
    int64_t* cond_size     // 输出：数组元素个数
);
```

- 需要暴露 `StableDiffusionGGML::get_learned_condition()`（原私有方法）
- `cond_data` 包含 `c_crossattn` + `c_vector` + `c_concat` 的序列化拼接
- 返回后调用者 `free_sd_ctx()` 释放 Qwen3 内存

### 2. sd_sample — 只跑采样

输入 condition，输出 latent。

```c
SD_API bool sd_sample(
    sd_ctx_t* sd_ctx,
    const float* cond_data,
    int64_t cond_size,
    int width,
    int height,
    int steps,
    float cfg_scale,
    int64_t seed,
    float** latent_data,   // 输出：latent float 数组
    int64_t* latent_size
);
```

- 需要暴露 `StableDiffusionGGML::sample()`（原私有方法）
- 反序列化 `cond_data` 还原为 `SDCondition`
- `latent_data` 是采样结果（如 flux2 的 64×64×16 latent）
- 可指定 `--backend diffusion=vulkan1` 来决定在哪跑

### 3. sd_decode_latent — 只跑 VAE 解码

输入 latent，输出最终图像。

```c
SD_API sd_image_t sd_decode_latent(
    sd_ctx_t* sd_ctx,
    const float* latent_data,
    int64_t latent_size
);
```

- 需要暴露 `StableDiffusionGGML::decode_first_stage()`（原私有方法）
- 可指定 `--backend vae=vulkan1` 让 VAE 走 GPU（仅 164MB）

---

## 调用方主程序逻辑

```
1. 建 sd_ctx，只传 --llm（Qwen3），其他为空
   sd_ctx_params.llm_path = "flux2-klein-9b-uncensored-q4_k_m.gguf"
   sd_ctx_params.diffusion_model_path = NULL
   sd_ctx_params.vae_path = NULL
   ctx = new_sd_ctx(&params)

2. sd_encode_condition(ctx, prompt, loras, &cond_data, &cond_size)
   此时 cond_data 在内存中，是一段 float 数组

3. free_sd_ctx(ctx)    ← Qwen3 完全释放，0 内存占用

4. 建新 sd_ctx，只传 --diffusion-model（DiT），Qwen3 和 VAE 为空
   sd_ctx_params.diffusion_model_path = "flux-2-klein-9b-Q4_0.gguf"
   sd_ctx_params.llm_path = NULL
   sd_ctx_params.backend = "diffusion=vulkan1"
   ctx = new_sd_ctx(&params)

5. sd_sample(ctx, cond_data, cond_size, 512, 512, 4, 1.0, 42, &latent_data, &latent_size)
   此时 latent_data 在内存中

6. free(cond_data)     ← condition 释放
   free_sd_ctx(ctx)    ← DiT 完全释放

7. 建新 sd_ctx，只传 --vae
   sd_ctx_params.vae_path = "flux2-vae.safetensors"
   sd_ctx_params.backend = "vae=vulkan1"
   ctx = new_sd_ctx(&params)

8. img = sd_decode_latent(ctx, latent_data, latent_size)
   stbi_write_png("output.png", img)

9. free(latent_data)
   free_sd_images(&img, 1)
   free_sd_ctx(ctx)    ← VAE 释放
```

### 每步内存占用

| 步骤 | 加载模型 | 大小 | VRAM | RAM | 备注 |
|------|----------|------|------|-----|------|
| 1 | Qwen3 文本编码器 | 5.0 GB | 0 GB | 5.0 GB | CPU 跑，不占显存 |
| 释放 | — | — | 0 GB | 0 GB | 回到零 |
| 2 | DiT (Q4_0) | 5.3 GB | ~3 GB | 0 GB | 权重在 GPU，offload |
| 释放 | — | — | 0 GB | 0 GB | 回到零 |
| 3 | VAE | 164 MB | <0.5 GB | 0 GB | 够小，全放 GPU |

**总 VRAM 峰值：~3 GB**（远小于 RX 580 的 8 GB 上限）

---

## 对 img2img / inpainting 的支持

只需在 Step 1 和 Step 2 之间插入一步：

```
Step 1.5: VAE 编码原图

加载 VAE（同 Step 3 复用）
原图 → VAE encode → init_latent（内存 float[]）

然后 Step 2 的 sd_sample 接受 init_latent + cond
```

额外的步骤只多了 ~3-5 秒（VAE 编码走 GPU）。

---

## 编译方法

```bash
git clone https://github.com/leejet/stable-diffusion.cpp
cd stable-diffusion.cpp
mkdir build && cd build
cmake .. -DGGML_VULKAN=ON -DCMAKE_BUILD_TYPE=Release
cmake --build . --config Release
```

改完后的产出：
- `build/bin/Release/stable-diffusion.dll` → 替换 `D:\files\FLUX.2\`
- 自行编译调用方 exe，链接该 DLL

---

## 需要修改的源文件

| 文件 | 改动 |
|------|------|
| `include/stable-diffusion.h` | 加 3 个 `SD_API` 函数声明 |
| `src/stable-diffusion.cpp` | 加 3 个函数的实现，调内部私有方法 |
| `src/stable-diffusion.h`（内部） | 将 `encode_first_stage()`、`sample()`、`decode_first_stage()` 设为 public 或加 public wrapper |

---

## 与 ComfyUI / sd-cli 对比

| | ComfyUI | sd-cli 一次加载 | 本方案 |
|---|---|---|---|
| 模型加载方式 | 全加载 | 全加载 | 分步加载 |
| 中间结果 | 显存常驻 | 显存常驻 | 内存 float array |
| VRAM 峰值 | 高（~6-7 GB） | 中（~3 GB） | **低（~3 GB）** |
| img2img 额外开销 | 小（都在显存） | 小（都在显存） | 略大（多一次 VAE 加载） |
| 跨 prompt 复用 condition | 节点缓存 | 不支持 | 代码层手动缓存 |
| 控制粒度 | 节点级 | CLI 参数级 | **函数调用级** |
