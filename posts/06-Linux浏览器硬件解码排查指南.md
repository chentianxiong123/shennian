---
title: 'Linux 浏览器硬件解码排查指南'
date: 2026-08-22
---

# Linux 浏览器硬件解码排查指南

> 手把手教你确认 Chrome / Edge / Firefox 有没有在用核显硬解视频

---

## 前置知识：为什么要排查

浏览器看视频有两种方式：
- **软解**：CPU 算 → CPU 占用高，风扇响，笔记本掉电快
- **硬解**：GPU 算 → CPU 轻松，省电流畅

排查的目的就是确认你的 GPU 有没有在干活。

---

## 第一关：看显卡驱动有没有装好

### 1.1 查显卡型号和驱动

打开终端，运行：

```bash
lspci -nnk | grep -A3 -i vga
```

**正常输出（AMD）：**
```
04:00.0 VGA compatible controller: Advanced Micro Devices, Inc. [AMD/ATI] Lucienne
    Kernel driver in use: amdgpu
    Kernel modules: amdgpu
```

**正常输出（Intel）：**
```
00:02.0 VGA compatible controller: Intel Corporation UHD Graphics 620
    Kernel driver in use: i915
    Kernel modules: i915
```

**关键看什么：**
- `Kernel driver in use:` 后面跟着的驱动名要对上你的显卡
- AMD → `amdgpu`
- Intel → `i915`
- NVIDIA 开源 → `nouveau`

**不正常怎么办：**
- 如果显示 `Kernel driver in use: vesafb` 或 `fbdev` → 驱动没装好
- 如果完全没这行 → 驱动没加载，需要安装 `mesa-utils` 和相关驱动包

### 1.2 确认内核模块已加载

```bash
lsmod | grep amdgpu
```

**正常输出：**
```
amdgpu    14479360    102
```

第一列是模块名，第二列是占用内存大小，第三列是引用次数。**只要有一行输出就是正常。**

### 1.3 确认设备节点存在

```bash
ls /dev/dri/
```

**正常输出：**
```
by-path  card0  renderD128
```

有 `renderD128` 就是正常的。

---

## 第二关：看 VA-API 驱动能不能用

### 2.1 安装验证工具

```bash
sudo apt install vainfo
```

### 2.2 运行验证

**AMD 显卡：**
```bash
LIBVA_DRIVER_NAME=radeonsi vainfo
```

**Intel 新款（第8代以后）：**
```bash
LIBVA_DRIVER_NAME=iris vainfo
```

**Intel 老款：**
```bash
LIBVA_DRIVER_NAME=i965 vainfo
```

### 2.3 读懂输出

**成功的样子：**
```
libva info: va_openDriver() returns 0
vainfo: Driver version: Mesa Gallium driver 25.0.7 for AMD Radeon Graphics (radeonsi, renoir)
vainfo: Supported profile and entrypoints
      VAProfileH264Main               : VAEntrypointVLD
      VAProfileH264High               : VAEntrypointVLD
      VAProfileHEVCMain               : VAEntrypointVLD
      VAProfileHEVCMain10             : VAEntrypointVLD
      VAProfileVP9Profile0            : VAEntrypointVLD
      VAProfileVP9Profile2            : VAEntrypointVLD
```

**关键看什么：**
- 第一行出现 `returns 0` → 驱动加载成功
- 下面列出了解码格式（H264 / HEVC / VP9 等）
- `VAEntrypointVLD` = 可以硬解这个格式

**失败的样子：**
```
libva info: va_openDriver() returns -1
vaInitialize failed with error code -1
```

→ 驱动没装。运行 `sudo apt install mesa-va-drivers` 安装。

### 2.4 记住你支持的格式

从 vainfo 输出里，记下有哪些格式带 `VAEntrypointVLD`，这是后面判断浏览器硬解的依据。

---

## 第三关：检查浏览器

### 3.1 Google Chrome

地址栏输入：
```
chrome://gpu
```
回车，往下翻，找 **Video Acceleration Information** 区域。

**正常的样子：**
```
Decoding:
Decode h264 baseline  : 64x64 to 4096x4096 pixels
Decode h264 main      : 64x64 to 4096x4096 pixels
Decode h264 high      : 64x64 to 4096x4096 pixels
Decode vp9 profile0   : 64x64 to 8192x4352 pixels
Decode hevc main      : 64x64 to 8192x4352 pixels
```

**异常信号：**
- 整个 Decoding 区域是空的 → 硬解没启用
- 出现 `Software only` → 退回到软解

**再往上翻，找 Status 区域：**
```
Video Decode: Hardware accelerated    ← 这行必须是这个
Video Encode: Software only           ← 这个被禁用是正常的，不用管
```

### 3.2 Microsoft Edge

地址栏输入：
```
edge://gpu
```
内容和 Chrome 完全一样，看同样的位置。

### 3.3 Firefox

地址栏输入：
```
about:support
```
往下翻，找 **图形特性（Graphics）** 区域。

**关键看这三行：**

| 字段 | 正常值 | 异常值 |
|------|--------|--------|
| 合成 | `WebRender` | `Software WebRender` |
| AzureCanvasBackend | `skia` | `cairo` |
| AzureContentBackend | `skia` | `cairo` |

**再往下翻，找「编解码器支持信息」表格：**

| 编解码器 | 软件解码 | 硬件解码 |
|----------|----------|----------|
| H264 | 已支持 | 已支持 ✅ |
| VP9 | 已支持 | 已支持 ✅ |
| HEVC | 已支持 | 已支持 ✅ |
| AV1 | 已支持 | 不支持 ℹ️ |
| VP8 | 已支持 | 不支持 ℹ️ |

**硬件解码列显示"已支持"就是硬解正常。**

**再往下翻，找「决策日志（Decision Log）」，搜索这几个关键词：**

```
HARDWARE_VIDEO_DECODING
H264_HW_DECODE
VP9_HW_DECODE
HEVC_HW_DECODE
```

**正常显示：**
```
HARDWARE_VIDEO_DECODING    default: available
H264_HW_DECODE             default: available
VP9_HW_DECODE              default: available
HEVC_HW_DECODE             default: available
```

**异常显示：**
```
env    blocklisted    FEATURE_FAILURE_VIDEO_DECODING_MISSING
```
→ 回到第二关，VA-API 驱动没装好。

### 3.4 Firefox 硬解没启用的补救方法

如果上面检查发现硬件解码被 blocklisted，进 `about:config`：

1. 地址栏输入 `about:config`，点"接受风险并继续"
2. 搜索框输入 `media.hardware-video-decoding.force-enabled`
3. 双击它，把值改为 `true`
4. 重启 Firefox

---

## 第四关：实际验证

浏览器显示正常不代表真的在用硬解，最好实际跑一下。

### 4.1 播放 4K 视频

打开 YouTube 或 B站，找一个 4K 视频播放。

同时打开另一个终端，运行：
```bash
htop
```

找浏览器进程（chrome / firefox），看 CPU 占用。

**硬解正常：** 浏览器 CPU 占用很低（个位数百分比）
**软解：** CPU 占用明显高（30%~100% 视分辨率而定）

### 4.2 Firefox 查看详细日志

```bash
MOZ_LOG="FFmpegVideo:5" firefox-esr
```
播放视频后，终端里搜 `VA-API`，能看到相关日志就是硬解生效了。

### 4.3 Chrome/Edge 查看 Media 面板

1. 打开 DevTools（F12）
2. 点右上角 `⋮` → 更多工具 → Media
3. 播放视频，在 Media 面板里看解码器状态

---

## 快速对照表

### 各浏览器检查入口速查

| 浏览器 | 入口 | 关键看什么 |
|--------|------|-----------|
| Chrome | `chrome://gpu` | Video Decode = Hardware accelerated |
| Edge | `edge://gpu` | 同上 |
| Firefox | `about:support` | 合成 = WebRender + 编解码器表硬解列 |

### 各显卡 VA-API 驱动名速查

| 显卡 | vainfo 命令 |
|------|------------|
| AMD | `LIBVA_DRIVER_NAME=radeonsi vainfo` |
| Intel 新款（第8代+） | `LIBVA_DRIVER_NAME=iris vainfo` |
| Intel 老款 | `LIBVA_DRIVER_NAME=i965 vainfo` |

### 各浏览器决策日志关键词速查

| 浏览器 | 关键词 |
|--------|--------|
| Chrome/Edge | `Video Decode` / `Video Acceleration Information` |
| Firefox | `HARDWARE_VIDEO_DECODING` / `H264_HW_DECODE` / `VP9_HW_DECODE` |

---

## 常见问题

### Q1：浏览器显示硬解正常，但看 4K 视频还是卡

可能原因：
- 视频源本身码率过高，超出硬解能力
- 网站用了不支持硬解的编码格式
- 先用 `chrome://gpu` 确认 Decoding 区域有没有列出对应格式

### Q2：vainfo 报驱动找不到

```bash
sudo apt install mesa-va-drivers
```

### Q3：Firefox 显示 Software WebRender

进 `about:config`，搜索 `gfx.webrender.all`，双击设为 `true`，重启 Firefox。

### Q4：AV1 硬解一直显示不支持

AMD 显卡 VCN 2.0（Renoir / Lucienne 及以前）不支持 AV1 硬解，这是硬件限制，不是配置问题。需要 VCN 3.0+（RDNA 2 / Rembrandt 及以后）才支持。

### Q5：Edge 的 Video Encode 显示 Software only

这是 Chromium 的策略限制，默认禁用硬件编码。不影响视频播放，一般不需要开启。

---

## 一页纸总结

```bash
# 第一步：查驱动
lspci -nnk | grep -A3 -i vga
lsmod | grep amdgpu

# 第二步：查 VA-API
sudo apt install vainfo
LIBVA_DRIVER_NAME=radeonsi vainfo

# 第三步：浏览器
# Chrome/Edge 地址栏输入：chrome://gpu
# Firefox 地址栏输入：about:support

# 第四步：实际验证
# 播 4K 视频 + htop 看 CPU
```
