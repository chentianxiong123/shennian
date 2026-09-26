---
title: 'ComfyUI + DirectML + FLUX.2 Klein 失败总结'
date: 2026-07-07
---

# ComfyUI + DirectML + FLUX.2 Klein 失败总结

## 日期
2026-07-07

## 硬件环境
- GPU: AMD Radeon RX 590 GME (8GB VRAM, Polaris)
- RAM: 16GB
- OS: Windows
- PyTorch: 2.4.1 (CPU) + torch-directml 0.2.5.dev240914

## 目标
在 RX 590 上用 ComfyUI 跑 FLUX.2 Klein 9B（GGUF Q4_0 量化）做 txt2img + inpainting。

## 遇到过的问题（按顺序）

### 1. VRAM 检测写死 1GB
- 位置：`comfy/model_management.py`
- `get_total_memory()` 中对 DirectML 返回 `1024 * 1024 * 1024`（1GB）
- 修复：改为 `8192 * 1024 * 1024`（匹配 RX 590 的 8GB）
- 同样 `get_free_memory()` 也写死 1GB → 改为 6144MB

### 2. 设备选择函数强制 CPU
- `unet_inital_load_device()` 计算模型解量化后 18GB > 6GB 空闲 → 返回 CPU
- `text_encoder_device()` 在 LOW_VRAM 下返回 CPU
- `text_encoder_initial_device()` 在 LOW_VRAM 下返回 CPU
- 修复：对 DirectML 强制返回 GPU 设备

### 3. GPU 上无法解量化 GGUF 权重（致命）
- 位置：`ComfyUI-GGUF\dequant.py`
- 量化权重被送到 DirectML GPU 后，`tensor.data` 返回 OpaqueTensorImpl
- 解量化函数需要 `.view(torch.float16)`、位运算等操作
- DirectML 不支持这些底层张量访问，抛 `Cannot access storage of OpaqueTensorImpl`
- 尝试修复：将量化权重拉回 CPU 解量化再送 GPU 做 forward
- 效果：GPU↔CPU 每层往返，实际推理全卡在 CPU，GPU 闲置

## 根本原因
**torch-directml 年久失修 + GGUF 量化格式不兼容 = 死路**

1. **torch-directml**：最后更新 2024 年，只支持标准 PyTorch op（matmul、conv 等）
2. **GGUF 量化解量化**：依赖 `.view()`、位移、int8 张量操作 → DirectML 不支持
3. **ComfyUI 模型管理**：深度绑定 CUDA memory stats，DirectML 全靠 TODO/hardcode
4. **解决方案对比**：
   | 方案 | GPU 加速 | Inpainting | 可行性 |
   |------|----------|------------|--------|
   | ComfyUI + DirectML | ✗ | ✓ | 已死 |
   | sd-cli Vulkan | ✓ | 弱（--mask 有 bug） | 可行 |
   | ROCm/ZLUDA（CUDA 桥接） | ✓ | ✓ | RX 590 支持待确认 |

## 保留的模型和文件（未动）
- `D:\files\FLUX.2\` 下的所有 GGUF 和 safetensors 文件

## 经验
- DirectML + GGUF = 不兼容，量化格式的底层位操作在 DirectML 上跑不了
- 8GB VRAM 跑 Flux 9B 可行的唯一原因是 Q4_0 量化，但量化带来了算子兼容性问题
- ComfyUI 对 DirectML 的支持停留在"能启动"级别，VRAM 检测全是 hardcode
- 正确的硬件方案：要么 ROCm/ZLUDA 让 GPU 伪装成 CUDA，要么 sd-cli Vulkan 用内置的 Vulkan 算子
