---
title: 'sd-cli FLUX.2 Klein 管线拆分与缓存转交文档'
date: 2026-07-08
---

# sd-cli FLUX.2 Klein 管线拆分与缓存转交文档

## 1. 资源清单

### 1.1 硬件
| 设备 | 规格 | 用途 |
|------|------|------|
| GPU | AMD Radeon RX 590 GME | Vulkan 推理，**8GB VRAM** |
| iGPU | AMD Radeon(TM) Graphics (集成) | Vulkan 可用但显存小(f16:1, uma:1) |
| CPU | x86-64 | LLM 编码必须在 CPU 上跑（见 7.1） |
| RAM | 16GB | 系统内存 |
| OS | Windows | PowerShell 7+ |

### 1.2 模型（全部在 `D:\files\FLUX.2\`）
| 文件 | 大小 | 类型 | 说明 |
|------|------|------|------|
| `flux-2-klein-9b-Q4_0.gguf` | ~5.3GB | DiT 扩散模型 | 量化 Q4_0 |
| `flux2-klein-9b-uncensored-q4_k_m.gguf` | ~6.3GB | LLM 文本编码器 | Qwen2.5-7B, Q4_K_M |
| `flux2-vae.safetensors` | ~164MB | VAE 编/解码器 | |
| `loras/Flux_Klein_NSFW_v2.safetensors` | ~34MB | NSFW LoRA | 提示词标签 `<lora:Flux_Klein_NSFW_v2:1.0>` 激活 |

### 1.3 可执行文件
| 位置 | 版本 (commit) | 说明 |
|------|--------------|------|
| `D:\workapp\sd-cli-new\sd-cli.exe` | 8caa3f9 | 旧版，无 flux2 scheduler |
| `D:\files\FLUX.2\sd-cli.exe` | bb84971 | 另一个旧版 |
| **`D:\workapp\sd-cli-src\build\bin\Release\sd-cli.exe`** | **9ef6e73** | **自编译新版，需要在此版本上修改** |
| `D:\workapp\sd-cli-new\mask_draw.py` | — | 蒙版绘制 GUI 工具 |

### 1.4 源码（需要修改的目录）
```
D:\workapp\sd-cli-src\
  ├── examples/cli/main.cpp              # CLI 入口、参数传递
  ├── examples/common/common.h           # 参数结构体定义
  ├── examples/common/common.cpp         # 参数解析
  ├── src/stable-diffusion.cpp           # 核心管线（渲染、采样、编码）
  ├── src/conditioning/conditioner.hpp   # SDCondition 结构体
  ├── src/core/tensor_ggml.hpp           # Tensor 读写（已有 load_tensor_from_file_as_tensor）
  └── src/core/ggml_extend.hpp           # 已注释的 save_tensor_to_file 参考实现
```

### 1.5 构建工具链
- MSVC 14.44.35207 (`D:\devtools\VSBuildTools`)
- Vulkan SDK 1.4.350.0 (`C:\VulkanSDK\`)
- CMake 4.3.3
- Git 2.50.0
- 网络代理: `127.0.0.1:7897`（直连 GitHub 被封）

### 1.6 参考材料
- `D:\Download\rh_flux2+klein_万物迁移(nsfw).json` — RunningHub 云端 API 工作流
- `C:\Users\a1\Desktop\flux2-stepwise-pipeline.md` — 流程笔记

---

## 2. 背景

目标是在 **RX 590 8GB** 上本地运行 **FLUX.2 Klein 9B** 做 NSFW 文本到图像/局部重绘（inpainting）。

当前整条管线耦合在一起，所有模型同时载入显存：
- LLM ~6.3GB（CPU） + DiT ~5.3GB（GPU） + VAE ~164MB（GPU）
- 峰值 VRAM ~5.3GB，刚好塞进 8GB，但毫无余量

实际的瓶颈不在显存总量，而在：
1. **LLM 无法上 GPU**（RX 590 Vulkan 驱动 `maxMemoryAllocationSize ≈ 2GB`，Qwen LLM 需要 2.37GB 连续分配）
2. **分辨率被限制在 352×864**（再高就爆显存）
3. **每次跑全管线浪费 51s LLM 编码时间**（同提示词结果确定，纯浪费）
4. **跑一半崩溃整条管线清空，前面算的全丢**
5. **无法利用空闲时间片逐步完成**（单条管线必须一口气跑完）

---

## 3. 现状（已完成）

### 3.1 构建与运行
- [x] 自编译 sd-cli 从 master 源码（MSVC + Vulkan，静态链接 97MB）
- [x] 三大 PR 合并（#1734/#1735/#1736，多 GPU 层/行拆分）
- [x] 确定稳定配置参数：
  ```
  --backend te=cpu,diffusion=vulkan1,vae=vulkan1 --params-backend cpu
  --mmap --max-vram 6 --diffusion-fa --vae-tiling
  ```
- [x] 保底性能：352×864/4步/1参考图/无LoRA → ~213s（3.5分钟）
- [x] LoRA 通过提示词标签 `<lora:name:weight>` 成功加载（9ef6e73 版验证）

### 3.2 Inpainting 流程
- [x] 蒙版绘制工具 `mask_draw.py`（GUI 画笔，白=重绘，黑=保留）
- [x] 50% 灰预填（屏蔽原始内容干扰生成）
- [x] 图片预对齐到 16 的倍数（VAE latent 约束）
- [x] IMG2IMG + mask 的 inpainting 模式验证通过

### 3.3 已验证的配置模板
```
sd-cli.exe ^
  --diffusion-model D:\files\FLUX.2\flux-2-klein-9b-Q4_0.gguf ^
  --vae D:\files\FLUX.2\flux2-vae.safetensors ^
  --llm D:\files\FLUX.2\flux2-klein-9b-uncensored-q4_k_m.gguf ^
  --lora-model-dir D:\files\FLUX.2\loras ^
  -p "<lora:Flux_Klein_NSFW_v2:1.0>露出胸部" ^
  --guidance 3.5 --steps 10 --sampling-method euler ^
  -i input.png --mask mask.png ^
  -W 352 -H 864 ^
  --output out.png --seed 42 ^
  --diffusion-fa --vae-tiling ^
  --backend te=cpu,diffusion=vulkan1,vae=vulkan1 ^
  --params-backend cpu --mmap --max-vram 6
```

---

## 4. 问题

### 4.1 RX 590 Vulkan 驱动硬限制（无法解决）
`maxMemoryAllocationSize ≈ 2GB` → 任何需要连续分配 >2GB 的操作在 GPU 上都会失败。这导致 LLM（Qwen, 2.37GB）永久不能上 GPU。

### 4.2 管线耦合，显存峰值高
三个主要模型（LLM、Diffusion、VAE）虽然通过`--backend te=cpu`把 LLM 放到 CPU，但 VAE 和 Diffusion 同时常驻 VRAM。量化模型 (Q4_0) 的 DiT ~5.3GB + VAE 164MB = ~5.5GB，8GB 基本没有余量做更高分辨率或多参考图。

### 4.3 LLM 编码重复浪费
同 prompt 每次跑都重新执行 `get_learned_condition()`（~51s），LLM 输出是确定的（同 prompt + 同参数 = 同 embedding），没有任何缓存机制。

### 4.4 崩溃全丢
跑 10 步如果第 8 步崩溃/超时/OOM，前 7 步的计算结果完全丢失。采样过程的中间 latent 没有持久化。

### 4.5 VAE 编码重复浪费
`init_image` 和 `ref_images` 的 VAE encode（虽然只有 2s），同样的图片每次跑都重新算。

### 4.6 分辨率瓶颈
352×864 以下图质不够，往上走（如 512×768）graph 切 2 segments，速度从 36s/it 降到 71s/it，接近跑不动。

---

## 5. 方向

核心思路：**将紧耦合的单管线拆成多个独立阶段，每个阶段只加载当前需要的模型，算完持久化结果、释放显存，再进入下一阶段。**

### 分阶段管线设计

```
阶段1: VAE 编码 init_image
  Load VAE (164MB) → encode → save init_latent.bin → Free VAE
  峰值 VRAM: ~164MB

阶段2: VAE 编码 ref_images（多个 -r 时）
  Load VAE → encode → save ref_latents.bin → Free VAE
  峰值 VRAM: ~164MB

阶段3: LLM 编码 prompt
  Load LLM (全 CPU) → encode → save embeddings.bin → Free LLM
  峰值 VRAM: 0

阶段4: 扩散采样（单步循环/可分多次执行）
  Load Diffusion (~5.3GB) → load init_latent + embeddings + ref_latents
    第1步: run → save step_001.bin → free compute buffer
    第2步: load step_001 → run → save step_002.bin → free compute buffer
    ...（崩溃时 step_N.bin 已存，从 N+1 恢复）
    最后步: save final_latent.bin → Free Diffusion
  峰值 VRAM: ~5.3GB + 单步缓冲 ≈ 6GB

阶段5: VAE 解码 final_latent
  Load VAE → load final_latent → decode → save output.png → Free VAE
  峰值 VRAM: ~164MB
```

### 关键优化点
- **阶段间解耦**：每阶段独立进程/独立 run，用完即释放
- **每步独立**：采样循环每步结束后持久化 latent + 主动释放计算缓冲
- **断点续跑**：同 prompt 第二次跳过阶段 3，崩溃后跳过已完成步骤
- **峰值平滑**：任何时候只存在一个模型权重

### 执行方式
```
# 第一轮（LLM 编码，只需跑一次）
sd-cli.exe --stage llm-encode -p "xxx" ... → 生成 embeddings.bin

# 第二轮（扩散采样，可分多次执行）
sd-cli.exe --stage diffuse --resume-step 0 ... → 跑 N 步，每步存 checkpoint
如果崩溃：sd-cli.exe --stage diffuse --resume-step 4 ... → 从第 5 步继续

# 第三轮（VAE 解码）
sd-cli.exe --stage vae-decode ... → 输出 PNG
```

---

## 6. 需求（按优先级排序）

### P0 — 基础基础设施（必须完成）
- [ ] **tensor 序列化/反序列化**
  - `tensor_ggml.hpp` 补充 `save_tensor_to_file()`（已有注释代码参考）
  - 格式：n_dims | name_len | type | shape[n] | name | data
  - 支持 `sd::Tensor<float>` 的存和读
- [ ] **SDCondition 持久化**
  - `conditioner.hpp` 中 `SDCondition` 加 `save(path)` / `static load(path)` 方法
  - 遍历所有非空 tensor 逐一序列化到一个文件
  - 特殊处理：`c_concat` 不存（运行时生成），`c_ref_images` 不存（通过 VAE encode 阶段独立处理）

### P1 — 多阶段 CLI 入口
- [ ] **新增 `--stage` 参数**
  - 值：`vae-encode` | `llm-encode` | `diffuse` | `vae-decode`
  - 各阶段只加载该阶段需要的模型
- [ ] **新增 `--save-embeddings` / `--load-embeddings`**
  - `llm-encode` 阶段完成后写入
  - `diffuse` 阶段启动时检测，有就直接加载跳过 LLM
- [ ] **新增 `--save-latent` / `--load-latent`**
  - 用于传递 init_latent / ref_latents / final_latent

### P2 — 采样断点续跑
- [ ] **每步 checkpoint**
  - 每步 denoising 完成后（`preview_image` 同一位置），保存 `step_N.bin`
  - 同时保存 `metadata.json`（总步数、sigma 序列、seed）
- [ ] **恢复机制**
  - `--resume-step N` 指定从第 N 步继续
  - 验证 metadata 一致性（步骤数、参数匹配）
  - 从 step_N.bin 加载 x_t，用剩余 sigma 继续采样

### P3 — VAE 独立阶段
- [ ] `vae-encode` 阶段：加载 VAE，编码 image → 输出 latent.bin
- [ ] `vae-decode` 阶段：加载 VAE，解码 latent.bin → 输出 PNG

### P4 — 优化与扩展（optional）
- [ ] 多 `-r` 参考图支持（已在 CLI 层面支持，验证 VRAM 影响）
- [ ] 蒙版边缘模糊预处理脚本
- [ ] 50% 灰预填自动化

---

## 7. 技术参考

### 7.1 数据流关键路径
```
prepare_image_generation_latents()
  ├── encode_first_stage(init_image)     → init_latent          [VAE, GPU]
  └── encode_first_stage(ref_images[i])  → ref_latents          [VAE, GPU]

prepare_image_generation_embeds()
  └── get_learned_condition(prompt)      → SDCondition           [LLM, CPU]
      ├── cond.c_crossattn               → [1, 154, 4096] float32  ~2.37GB
      ├── cond.c_vector                  → [1, 4096] float32     ~16KB
      └── ...

sample() 循环 (stable-diffusion.cpp:2296-2542)
  x_t = noise_scaling(sigmas[0], noise, init_latent)
  for step in range(steps):
      denoised = forward(x_t, timestep, context, ...)     [DiT, GPU]
      preview_image(step, denoised, ...)                   ← 插入 checkpoint 的位置
      x_t = sampler_step(x_t, denoised, ...)
  → final_latent

encode_first_stage(final_latent) → output.png              [VAE, GPU]
```

### 7.2 SDCondition 结构（`conditioner.hpp:15`）
```cpp
struct SDCondition {
    sd::Tensor<float> c_crossattn;
    sd::Tensor<float> c_vector;
    sd::Tensor<float> c_concat;          // 不缓存，运行时生成
    sd::Tensor<int32_t> c_t5_ids;
    sd::Tensor<float> c_t5_weights;
    sd::Tensor<int32_t> c_input_ids;
    sd::Tensor<int32_t> c_position_ids;
    sd::Tensor<int32_t> c_token_types;
    sd::Tensor<int32_t> c_vinput_mask;
    std::vector<std::pair<int, sd::Tensor<float>>> c_image_embeds;
    std::vector<sd::Tensor<float>> c_ref_images;   // 不缓存，由 VAE 阶段独立处理
    std::vector<sd::Tensor<float>> extra_c_crossattns;
};
```

### 7.3 已有序列化工具
- `sd::load_tensor_from_file_as_tensor<float>(path)` — `tensor_ggml.hpp:88`
- `save_tensor_to_file()` 注释代码 — `ggml_extend.hpp:367`

### 7.4 preview 回调位置（采样步骤插入 checkpoint 的参考位置）
`stable-diffusion.cpp:2534` — 在 `preview_image(step, denoised, ...)` 调用处。每步 denoised tensor 在此处可获取。

### 7.5 显存释放参考
`stable-diffusion.cpp:2547-2552` — `free_control_ctx()` / `free_compute_buffer()` 采样结束后的清理。

---

## 8. 构建命令参考

```powershell
# 进入构建目录
cd D:\workapp\sd-cli-src\build

# CMake 配置（已配置过，如需重配）
cmake .. -G "Visual Studio 17 2022" -A x64 ^
  -DCMAKE_C_FLAGS="-DGGML_VULKAN_DEBUG=1" ^
  -DCMAKE_BUILD_TYPE=Release ^
  -DGGML_VULKAN=ON ^
  -DGGML_CUDA=OFF ^
  -DGGML_METAL=OFF ^
  -DSD_STATIC=ON ^
  -DGGML_NATIVE=OFF ^
  -DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded ^
  -DBUILD_SHARED_LIBS=OFF

# 编译
cmake --build . --config Release /m:8

# 产物
D:\workapp\sd-cli-src\build\bin\Release\sd-cli.exe
```

---

## 9. 长期方向

1. **本拆解方案完成后**：可在 RX 590 8GB 上稳定运行 352×864/10-20 步/多参考图
2. **后续可探讨**：通过 `--offload-to-cpu` 把部分 DiT 层放 CPU 换显存，支撑 512×768
3. **扩展可能性**：该缓存架构同样适用于其他模型（SD3.5、SDXL），不限于 FLUX.2
