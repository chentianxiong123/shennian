---
title: '系统内存与 Swap 优化记录'
date: 2026-07-29
---

# 系统内存与 Swap 优化记录

日期：2026年7月29日

## 背景

系统配置：
- CPU：多核 x86_64
- 内存：16GB（系统识别约 15GB）
- 存储：NVMe SSD 453GB
- 桌面：KDE Plasma（Wayland）
- 用途：日常开发（opencode、编译、浏览器）

**问题：** 传统磁盘 Swap 会频繁写入 SSD，影响寿命。同时系统存在大量开发工具缓存（npm 6.6G、rustup 2.4G 等），需要评估是否清理。

## 分析过程

### 1. 磁盘使用情况

```
/dev/nvme0n1p2  453G   38G  392G    9%
```

磁盘使用率仅 9%，空间充裕。

### 2. Swap 使用分析

```
Filename                Type        Size        Used        Priority
/dev/nvme0n1p3          partition   16081916    996968      -2
```

Swap 分区 15GB，已用约 975MB。**关键发现：** 这不是内存不足导致的，而是 Linux 内核主动将冷数据换出，腾出内存给文件缓存。

### 3. 内存使用分析

```
               total        used        free      shared  buff/cache   available
内存：          14Gi       7.6Gi       741Mi       1.1Gi       8.2Gi       7.4Gi
```

- 程序实际占用：约 7.6G
- 文件缓存：约 8.2G（加速文件操作）
- 可用内存：约 7.4G

**内存大户：**
- opencode × 5：共约 4.5G（每个约 900MB）
- KDE 桌面：约 1.5G
- 百度网盘：约 250MB

### 4. 开发工具缓存评估

| 缓存 | 大小 | 保留好处 |
|------|------|---------|
| `~/.npm` | 6.6G | npm install 秒装，离线也能装 |
| `~/.cache/go-build` | 425M | Go 编译快，跳过已编译的包 |
| `~/.cargo` | 339M | cargo build 不用重新下载依赖 |
| `~/.rustup` | 2.4G | Rust 工具链本体 |

**结论：** 磁盘空间充裕（使用率 9%），这些缓存本质是"用空间换时间"，保留有益无害。

## 技术方案对比

### Swap 方案对比

| 方案 | 原理 | 优势 | 劣势 | 适用场景 |
|------|------|------|------|---------|
| **传统 Swap** | 冷数据写入磁盘 | 简单可靠，容量大 | 磁盘 I/O 慢，磨损 SSD | 通用服务器 |
| **zram** | 内存里压缩存储 | 极速（微秒级），零磁盘写入 | 容量硬上限，满则 OOM | 嵌入式/无磁盘/安全敏感 |
| **zswap** | 压缩缓存层 + 磁盘 Swap | 自动分层，优雅降级 | 需要磁盘 Swap 分区 | 通用桌面/服务器 |

### 压缩算法对比

| 算法 | 压缩比 | CPU 开销 | 推荐 |
|------|--------|----------|------|
| lz4 | 2:1 ~ 3:1 | 最低 | 低配设备 |
| zstd | 3:1 ~ 8:1 | 略高 | **主流推荐** |
| lzo-rle | 2:1 ~ 3:1 | 低 | 折中选择 |

### 内核参数对比

| 参数 | 默认值 | zram 优化值 | 说明 |
|------|--------|-------------|------|
| vm.swappiness | 60 | 100~150 | 更积极使用 zram |
| vm.page-cluster | 3 | 0 | zram 不需要连带读取 |
| vm.vfs_cache_pressure | 100 | 50 | 保留更多文件缓存 |

## 最终配置

### 1. 关闭磁盘 Swap

```bash
# 关闭 swap
sudo swapoff /dev/nvme0n1p3

# 永久禁用（/etc/fstab 中注释掉）
# UUID=a8a96227-3dab-4118-8b25-36ee13a20aa7 none swap sw 0 0
```

**保留分区：** 16G swap 分区留着备用，极端情况可临时 `swapon` 救急。

### 2. 启用 zram

```bash
# 安装
sudo apt install zram-tools

# 配置 /etc/default/zramswap
ALGO=zstd
PERCENT=50
PRIORITY=100
```

**当前状态：**
```
NAME       ALGORITHM DISKSIZE DATA COMPR TOTAL STREAMS MOUNTPOINT
/dev/zram0 zstd        7.5G   0B   0B    0B      1     [SWAP]
```

### 3. 内核参数优化

创建 `/etc/sysctl.d/99-zram-optimize.conf`：

```ini
vm.swappiness = 100
vm.page-cluster = 0
vm.vfs_cache_pressure = 50
```

应用：
```bash
sudo sysctl -p /etc/sysctl.d/99-zram-optimize.conf
```

## 优化效果

### 内存布局

```
14G 物理内存 + 7.5G zstd 压缩 ≈ 有效内存 20~30G
```

### 对比

| 指标 | 优化前 | 优化后 |
|------|--------|--------|
| Swap 类型 | 磁盘 Swap（15G） | zram（7.5G，zstd） |
| Swap 延迟 | 毫秒级（SSD） | 微秒级（内存） |
| SSD 磨损 | 有 | 零 |
| 压缩比 | 无 | 3:1 ~ 8:1 |
| vm.swappiness | 60 | 100 |
| vm.page-cluster | 3 | 0 |
| vm.vfs_cache_pressure | 100 | 50 |

### 启动服务优化

禁用不必要的开机自启动服务，加快启动速度约 5 秒：

```bash
sudo systemctl disable NetworkManager-wait-online.service
sudo systemctl disable apt-daily.service apt-daily.timer
sudo systemctl disable apt-daily-upgrade.service apt-daily-upgrade.timer
sudo systemctl disable docker.service docker.socket
```

## 其他优化

### 桌面快捷方式

将脚本统一到 `~/sh/` 目录，使用 toggle 模式（点击切换开/关，弹通知显示状态）：

| 脚本 | 功能 |
|------|------|
| `easytier-toggle.sh` | VPN 开关 |
| `sleep-toggle.sh` | 休眠开关 |
| `nfs-toggle.sh` | NFS 挂载/卸载 |
| `proxy-shell-toggle.sh` | Shell 代理开关 |
| `proxy-kde-toggle.sh` | KDE 代理开关 |

### 图标优化

替换 `emblem-symbolic-link.svg` 为透明图片，去除桌面快捷方式右下角小箭头。

## 总结

1. **zram 是现代 Linux 的最佳 Swap 方案**：零磁盘写入，延迟微秒级，压缩比高
2. **zstd 算法是最佳选择**：压缩率比 lz4 高一倍，CPU 开销对现代处理器微不足道
3. **内核参数需要配合调整**：swappiness、page-cluster、vfs_cache_pressure
4. **开发缓存不需要清理**：磁盘空间充裕，缓存提升开发效率
5. **禁用不必要的启动服务**：加快启动速度

## 参考资料

- [ArchWiki - Zram](https://wiki.archlinux.org.cn/title/Zram)
- [Debian ZRAM/Zswap 指南](https://cr0x.net/en/debian-zram-zswap-survival-guide/)
- [Linux 内核文档 - zram](https://linuxkernel.org.cn/doc/html/latest/admin-guide/blockdev/zram.html)
- [Chris Down - Debunking zswap and zram myths](https://chrisdown.name/2026/03/24/zswap-vs-zram-when-to-use-what.html)
