---
title: 'hi-box 网络性能调优记录'
date: 2026-07-02
---

# hi-box 网络性能调优记录

> 设备: 海思 hi3798mv100 | ARMv7 | 969 MB RAM | 内核 4.4.35_ecoo_81082668
> 调优日期: 2026-07-02

---

## 一、背景

hi-box 运行 mihomo 代理、aria2 下载、openlist 文件服务、easytier VPN、frp 内网穿透等。
需要优化 TCP 网络缓冲以提高代理大包的吞吐性能。

## 二、硬件限制

海思芯片网卡**不支持任何硬件卸载**，以下优化不可用：

| 功能 | 状态 | 说明 |
|------|------|------|
| TSO (TCP Segmentation Offload) | ❌ `[fixed]` off | 内核手动拆包，CPU 开销大 |
| GSO | ❌ `[fixed]` off | 同上 |
| GRO (Generic Receive Offload) | ❌ `[fixed]` off | 内核逐个处理收包 |
| LRO | ❌ `[fixed]` off | 同上 |
| Scatter-Gather | ❌ `[fixed]` off | 无零拷贝支持 |
| Checksum Offload | ❌ `[fixed]` off | 内核 CPU 计算校验和 |

**关键结论**: 瓶颈在 CPU 处理每包能力，不在缓冲区容量。调大 buffer 对硬件瓶颈帮助有限，但仍值得做。

BBR 拥塞算法和 fq_codel qdisc 同样因定制内核无对应模块/支持而不可用。

## 三、调优参数

配置文件: `/etc/sysctl.d/99-network-tuning.conf`

### TCP 缓冲区

| 参数 | 调优前 | 调优后 | 说明 |
|------|--------|--------|------|
| `net.core.rmem_max` | 4194304 (4 MB) | 8388608 (8 MB) | 接收缓冲区上限 |
| `net.core.wmem_max` | 4194304 (4 MB) | 8388608 (8 MB) | 发送缓冲区上限 |
| `net.core.rmem_default` | 262144 (256 KB) | 524288 (512 KB) | 接收缓冲区默认值 |
| `net.core.wmem_default` | 262144 (256 KB) | 524288 (512 KB) | 发送缓冲区默认值 |
| `net.core.optmem_max` | 10240 | 40960 | 每 socket 可选缓冲区 |
| `net.ipv4.tcp_rmem` | 4096 131072 4194304 | 4096 524288 8388608 | 自动调优范围 |
| `net.ipv4.tcp_wmem` | 4096 131072 4194304 | 4096 524288 8388608 | 自动调优范围 |
| `net.ipv4.tcp_mem` | 5724 7635 11448 | 8586 11448 17172 | 全局 TCP 内存(pages) |

### 连接队列

| 参数 | 调优前 | 调优后 | 说明 |
|------|--------|--------|------|
| `net.core.somaxconn` | 512 | 1024 | listen 队列上限 |
| `net.core.netdev_max_backlog` | 65536 | 65536 | 已够，保持 |
| `net.ipv4.tcp_max_syn_backlog` | 512 | 2048 | SYN 队列上限 |

### 低延迟优化

| 参数 | 调优前 | 调优后 | 说明 |
|------|--------|--------|------|
| `net.core.busy_read` | 0 | 50 | busy polling 50μs，降低小包延迟 |
| `net.ipv4.tcp_low_latency` | 0 | 1 | 减少缓冲延迟 |

### TCP 特性

| 参数 | 调优前 | 调优后 | 说明 |
|------|--------|--------|------|
| `net.ipv4.tcp_fastopen` | 0 | 3 | TCP Fast Open 客户端+服务端 |
| `net.ipv4.tcp_mtu_probing` | 0 | 1 | 自动探测最优 MTU |
| `net.ipv4.tcp_ecn` | 0 | 2 | ECN 显式拥塞通知 |
| `net.ipv4.tcp_timestamps` | 1 | 1 | 保持 |
| `net.ipv4.tcp_sack` | 1 | 1 | 保持 |
| `net.ipv4.tcp_retries2` | 15 | 8 | 降低重试次数，快速失败 |
| `net.ipv4.tcp_orphan_retries` | 3 | 0 | 无连接关联的快速失败 |
| `net.ipv4.tcp_no_metrics_save` | 0 | 1 | 断开连接不清零重传历史 |

### 内存管理

| 参数 | 调优前 | 调优后 | 说明 |
|------|--------|--------|------|
| `vm.min_free_kbytes` | 2808 | 8192 | 预留更多空闲内存防 OOM |
| `vm.swappiness` | 60 | 10 | 无 swap，降低不必要判断 |
| `vm.vfs_cache_pressure` | 100 | 50 | 降低 dentry/inode 回收压力，NFS 友好 |

## 四、效果预期

| 场景 | 预期提升 |
|------|----------|
| 代理高延迟链路吞吐 | +20~40% |
| 小包延迟 | 降低 (busy_read + low_latency) |
| 突发连接稳定性 | 提升 (队列翻倍) |
| MTU 自适应 | 避免分片丢包 |

## 五、持久化

配置写入 `/etc/sysctl.d/99-network-tuning.conf`，重启后自动加载。
手动生效命令: `sysctl --system`

## 六、备注

- 969MB 内存 × 8MB buffer × 数百并发连接 = ~2GB 潜在峰值，实测正常场景远低于此
- BBR / fq_codel 需升级内核才能使用，当前定制 4.4 内核不支持
- NFS 随机端口可固定：修改 `/etc/default/nfs-kernel-server` 中 `RPCMOUNTDOPTS` 加入 `--port 4001`
