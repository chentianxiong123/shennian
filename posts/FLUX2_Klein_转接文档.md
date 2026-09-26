---
title: 'FLUX.2 Klein 转接文档'
date: 2026-07-09
---

# FLUX.2 Klein 转接文档

## 当前架构

主流程改为 **Codex Skill + sd-cli 原子 stage**。

Python 不再负责生成工作流，不再选择模型、不再拼命令、不再启动生成。Python 只保留手工蒙版工具：

```text
D:\workapp\sd-cli-src\project\manual_mask_draw.py
```

这个工具只做三件事：

- 打开目标图并画黑白蒙版
- 保存同尺寸目标图和蒙版
- 打开输出位置

重要规则：

- 蒙版必须由用户确认
- 蒙版必须和目标图一一对应、同尺寸
- 不做裁剪
- 不自动缩放旧蒙版
- 不猜裁剪偏移或对齐偏移

已删除旧 Python 工作流入口：

```text
D:\workapp\sd-cli-src\project\repaint_studio.py
D:\workapp\sd-cli-src\project\flux_pipeline.py
D:\workapp\sd-cli-src\project\sd_gui.py
```

历史提示词文件暂时保留：

```text
D:\workapp\sd-cli-src\project\prompts.txt
```

它只是试验记录，不是工作流入口。

## Skill

Codex skill 位置：

```text
C:\Users\a1\.codex\skills\flux2-klein-cli-inpaint
```

用途：

- 让后续 agent 知道 FLUX2 Klein 本地局部重绘怎么按 CLI 原子阶段执行
- 记录 RX590/Vulkan1、缓存目录、mask、VAE/vision 参考图、LoRA 检查、日志习惯
- 避免再把 Python 写成黑盒自动工作流

## 输出规则

默认按发行模式处理：

- 只保留最终输出图
- 最多保留一份简短日志
- stage cache 使用临时目录，成功后删除
- 不默认输出 overlay、compare、step sweep、manifest、多套中间 cache

只有明确调试时才保留：

- mask overlay
- 参考图预处理图
- 每步/多步对比图
- 各 stage 的缓存目录
- 详细日志和 manifest

## 模型

```powershell
$Diffusion = "D:\models\flux-2-klein-9b-Q4_0.gguf"
$LLM       = "D:\models\qwen3-vl-7b-llm-q4_k_m.gguf"
$Vision    = "D:\models\mmproj-Qwen3VL-8B-Instruct-F16.gguf"
$VAE       = "D:\models\flux2-vae.safetensors"
```

RX590 是 `Vulkan1`，核显是 `Vulkan0`。

```powershell
$env:GGML_VK_FORCE_MAX_BUFFER_SIZE = "4294967296"
```

开发测试优先使用：

```powershell
D:\workapp\sd-cli-src\build\bin\Debug\sd-cli.exe
```

## 原子 Stage

每次只调用一个 `--stage`，每个 stage 一个独立进程。不要传逗号分隔 stage。

| Stage | 输入 | 输出 |
|---|---|---|
| `llm_encode_vision` | `--ref-image`、`--llm`、`--llm_vision` | `--vision-out` |
| `llm_encode_text` | `--vision-out`、`--prompt`、`--llm` | `--llm-out` |
| `vae_encode` | `--ref-image`、`--vae` | `--vae-out` |
| `diffuse` | `--llm-out`、可选 `--vae-out`、`--init-img`、`--mask` | `--diffuse-out` |
| `vae_decode` | `--diffuse-out`、`--vae` | `-o` |

已知状态：

- `llm_encode_vision` 已跑通
- `llm_encode_text` 已跑通，二维 hidden state 断言问题已修
- `vae_encode` 已跑通
- `diffuse` 已跑通，支持 `--mask`
- `vae_decode` 已跑通
- 5 段最低步数串联测试已跑通

## 当前重要质量问题

原子 `llm_encode_vision` 和 `vae_encode` 现在会把参考图硬拉伸到工作分辨率：

```cpp
sd_image_to_tensor(params->ref_images[i], params->width, params->height)
```

位置：

```text
D:\workapp\sd-cli-src\src\stable-diffusion.cpp:5261
D:\workapp\sd-cli-src\src\stable-diffusion.cpp:5314
```

如果参考图接近正方形、目标图是竖图，参考图会被压扁或拉长。这会明显影响局部重绘质量。下一步优先修这里：参考图预处理应改为保持比例 contain/letterbox，而不是强行 stretch。

## 手工工具命令

```powershell
cd D:\workapp\sd-cli-src

python .\project\manual_mask_draw.py `
  --image "D:\path\target.png" `
  --mask-out "D:\path\mask.png" `
  --image-out "D:\path\target_prepared.png" `
  --output "D:\path\output.png"
```

输出原则：

- 目标图和 mask 必须同尺寸
- 白色 mask 表示可重绘区域
- 黑色 mask 表示保留区域
- 如果 mask 不对，先手工修 mask，不要猜裁剪偏移或自动对齐

## 下一步建议

1. 普通运行只跑当前选定路线，默认 4 步左右。
2. 如果要排查质量，再显式开启调试输出。
3. LoRA 只在日志能确认加载后再判断效果，不要凭提示词字符串假设 LoRA 已生效。
