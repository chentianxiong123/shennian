---
title: 'A 卡在 Windows Docker 下做 FFmpeg GPU 转码为什么这么难？'
date: 2026-06-08
---

# A 卡在 Windows Docker 下做 FFmpeg GPU 转码为什么这么难？

## 前言

我最近在做一个类 B 站的视频系统，后端服务里有一条视频处理流水线：

- 用户投稿视频
- 后端审核通过
- FFmpeg 转码成 HLS
- 生成 `m3u8` 和 `ts` 切片
- 上传到 MinIO 对象存储
- 前端播放页读取转码后的播放地址

一开始我发现 CPU 占用非常高。排查后发现，项目里的 FFmpeg 命令使用的是：

```bash
-c:v libx264
```

也就是说，视频编码完全靠 CPU 硬算。

我的机器是 Windows 环境，显卡是 AMD Radeon。直觉上我以为：既然本机有 GPU，那 Docker 里的 FFmpeg 应该也能调用 GPU。实际测试后发现，事情没有这么简单。

## 本机 FFmpeg 可以调用 AMD GPU

先在 Windows 宿主机上检查 FFmpeg 编码器：

```bash
ffmpeg -hide_banner -encoders | findstr /i "amf nvenc qsv vaapi"
```

可以看到：

```text
h264_amf
hevc_amf
av1_amf
h264_nvenc
h264_qsv
```

再跑一个最小测试：

```bash
ffmpeg -hide_banner ^
  -f lavfi -i testsrc2=size=1280x720:rate=30 ^
  -t 2 ^
  -c:v h264_amf ^
  -usage transcoding ^
  -quality balanced ^
  -b:v 2000k ^
  -f null -
```

测试成功。

这说明问题不在 FFmpeg，也不在 AMD 驱动。Windows 宿主机上直接用 FFmpeg 调 AMD AMF 是可以的。

## 进入 Docker 后问题出现了

然后测试 Docker Desktop。

Docker 本身正常：

```bash
docker run --rm hello-world
```

可以正常运行。

再检查 Docker 里的 GPU 设备：

```bash
docker run --rm ubuntu:24.04 bash -lc "ls -la /dev/dri /dev/dxg 2>/dev/null || true"
```

结果容器里没有 `/dev/dri`。

继续强行挂载：

```bash
docker run --rm --device=/dev/dri ubuntu:24.04 bash -lc "ls -la /dev/dri"
```

失败：

```text
error gathering device information while adding custom device "/dev/dri": no such file or directory
```

这说明 Docker Desktop 的 Linux 容器层里根本没有拿到类似 Linux VAAPI 所需的显卡设备节点。

## NVIDIA 路线也测了，但本机没有 NVIDIA

Docker Desktop 官方主要支持的是 NVIDIA GPU-PV。可以用下面命令测试：

```bash
docker run --rm --gpus all nvidia/cuda:12.9.0-base-ubuntu24.04 nvidia-smi
```

我的机器上结果是：

```text
WSL environment detected but no adapters were found
```

这也很正常，因为我这台机器不是 NVIDIA 显卡。

换句话说，Windows Docker 下最成熟的是 NVIDIA 路线；AMD 并没有同等顺滑的容器 GPU 透传体验。

## FFmpeg 容器支持 VAAPI，但没有设备也没用

我又拉了一个 FFmpeg 容器：

```bash
docker run --rm jrottenberg/ffmpeg:7.1-ubuntu2404 ffmpeg -hide_banner -hwaccels
```

它显示支持：

```text
vdpau
vaapi
drm
```

编码器里也能看到：

```text
h264_vaapi
hevc_vaapi
```

但是实际跑 VAAPI 编码：

```bash
docker run --rm jrottenberg/ffmpeg:7.1-ubuntu2404 ffmpeg \
  -hide_banner \
  -f lavfi -i testsrc2=size=640x360:rate=30 \
  -t 1 \
  -vaapi_device /dev/dri/renderD128 \
  -vf format=nv12,hwupload \
  -c:v h264_vaapi \
  -f null -
```

失败：

```text
No VA display found for device /dev/dri/renderD128.
Device creation failed.
```

原因很简单：镜像里有 VAAPI 编码器，不代表容器能看到宿主机 GPU。没有 `/dev/dri`，VAAPI 就没法工作。

## 问题本质

这里有三个完全不同的概念，很容易混在一起：

1. FFmpeg 是否支持硬件编码
2. 宿主机驱动是否支持硬件编码
3. Docker 容器是否能拿到 GPU 设备

我的情况是：

```text
宿主机 FFmpeg 支持 h264_amf：是
Windows AMD 驱动可用：是
Docker 容器能拿到 AMD GPU：否
```

所以不是“FFmpeg 不能用 GPU”，而是“Windows Docker Desktop 里的 Linux 容器拿不到 AMD 视频编码设备”。

## 各平台可行性对比

| 环境 | 方案 | 可行性 |
| --- | --- | --- |
| Windows + AMD + 宿主机 FFmpeg | `h264_amf` | 可行 |
| Windows + AMD + Docker Desktop | AMF / VAAPI | 不推荐，基本走不通 |
| Windows + NVIDIA + Docker Desktop | `--gpus all` + `h264_nvenc` | 可行 |
| Linux + AMD / Intel + Docker | `/dev/dri` + `h264_vaapi` | 可行 |
| Linux + NVIDIA + Docker | NVIDIA Container Toolkit + `h264_nvenc` | 可行 |

## 我的最终方案

我最后不再强行把视频转码塞进 Docker GPU，而是采用这个结构：

```text
Docker 容器：
  MySQL
  Redis
  RocketMQ
  Nacos
  MinIO
  Elasticsearch

Windows 宿主机：
  video-media 服务
  FFmpeg
  AMD AMF 硬件编码
```

视频处理流程是：

```text
1. 源视频先上传到 MinIO
2. video-media 从 MinIO 下载源视频到本地临时目录
3. 宿主机 FFmpeg 使用 h264_amf 转码
4. 生成 HLS 产物
5. video-media 通过 MinIO API 上传 m3u8/ts
6. 删除本地临时文件
```

这个方案的关键点是：产物不需要“写进容器文件系统”，只需要通过 MinIO API 上传到对象存储。

也就是说，MinIO 容器只是提供对象存储服务，不要求 FFmpeg 在容器内部执行。

## 如果未来要真正 Docker GPU 化

更推荐两条路线：

### 1. 换 NVIDIA 机器

使用 Docker 官方支持最好的路线：

```bash
docker run --rm --gpus all nvidia/cuda:12.9.0-base-ubuntu24.04 nvidia-smi
```

FFmpeg 使用：

```bash
-c:v h264_nvenc
```

### 2. 换 Linux 物理机

如果是 Linux 主机，并且能看到：

```bash
ls /dev/dri
```

Docker Compose 可以这样挂设备：

```yaml
services:
  video-media:
    image: mybilibili-video-media
    devices:
      - /dev/dri:/dev/dri
```

FFmpeg 使用：

```bash
-vaapi_device /dev/dri/renderD128
-vf format=nv12,hwupload
-c:v h264_vaapi
```

这才是 AMD / Intel 在 Linux Docker 下比较正统的硬件转码路线。

## 总结

这次排查后的结论很现实：

```text
Windows 宿主机调用 AMD AMF：可以
Windows Docker Desktop 调 AMD GPU：不值得折腾
Linux Docker 调 AMD/Intel GPU：可以
NVIDIA Docker GPU：成熟度最高
```

所以如果你是 Windows + AMD 显卡，又想做 FFmpeg GPU 转码，不要一开始就执着于 Docker GPU 化。

更务实的做法是：

```text
基础设施进 Docker
转码服务留在宿主机
FFmpeg 直接调用本机 h264_amf
转码产物通过 MinIO API 回写对象存储
```

这不是架构倒退，而是尊重当前硬件和 Docker 生态边界后的工程选择。

参考资料：

- Docker Desktop GPU support: https://docs.docker.com/desktop/features/gpu/
- NVIDIA Container Toolkit: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html
- Jellyfin AMD hardware acceleration: https://jellyfin.org/docs/general/post-install/transcoding/hardware-acceleration/amd/
