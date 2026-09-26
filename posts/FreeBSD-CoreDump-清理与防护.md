---
title: 'FreeBSD Core Dump 清理与禁用笔记'
date: 2026-09-07
---

# FreeBSD Core Dump 清理与禁用笔记

> 日期：2026-09-07
> 机器：FreeBSD 15.1（PVE VM 103，NVIDIA Quadro P400 直通）
> 主题：系统崩溃转储（core dump）导致的磁盘炸弹与防护

---

## 一、问题现象

GNOME 桌面里的浏览器（Epiphany）突然打不开，系统检查后一切正常（无进程阻塞、无僵尸进程），但磁盘空间被大量占用。

排查发现 `/root` 目录下躺着 3 个巨大的 **core dump 文件**：

| 文件 | 大小 | 来源 |
|---|---|---|
| `WebKitWebProcess.core` | **4.5G** | 浏览器渲染进程崩溃 |
| `gnome-shell.core` | **1.1G** | 桌面 shell（GNOME）崩溃 |
| `epiphany.core` | 31M | 浏览器进程崩溃 |
| **合计** | **约 5.6G** | — |

### 真相
浏览器打不开的**根本原因**：WebKit 渲染进程崩溃了（FreeBSD 上 WebKit 稳定性欠佳），系统按默认设置把崩溃现场整个写盘，生成了 4.5G 的 core dump。进程已经死了，浏览器自然打不开；巨大的 core 文件又把磁盘塞满，造成雪上加霜。

---

## 二、清理步骤

```bash
# 1. 删除所有 core dump（找出来先看大小）
find /root -name "core*" -type f -exec ls -lh {} \;

# 2. 删掉
rm -f /root/*.core

# 3. 验证
df -h /            # 恢复到正常占用
```

---

## 三、彻底禁用 core dump（推荐）

以后每次崩溃都生成几个 G 的 core 文件就是磁盘炸弹，直接关掉系统级 core dump：

```bash
# 立即生效
sysctl kern.coredump=0

# 持久化（重启也生效）
echo "kern.coredump=0" >> /etc/sysctl.conf

# 验证
sysctl kern.coredump      # 输出 0 即关闭
```

这样就再也不会有崩溃转储落盘了。

> 如果想保留崩溃排查能力但又不想占满磁盘，可以限制大小（Linux 式 ulimit 在 FreeBSD 也可用）：
> ```bash
# 对当前 shell 限制 core 最大 64MB（setrlimit，RLIMIT_CORE）
> ulimit -c 65536
> ```

---

## 四、血的教训：pkg autoremove 与桌面

### 事件回顾
为了省资源卸载了浏览器（epiphany），随后执行：

```bash
pkg delete -y epiphany
pkg autoremove -y          # ← 灾难现场
```

结果 `pkg autoremove` 把**整个 GNOME 桌面连同 X 相关组件全部当作"孤儿依赖"清掉了**（840 个包 → 501 个包），桌面直接没了。

### 教训
1. **`autoremove` 一定要先试跑**：
   ```bash
   pkg autoremove -n        # -n = dry run，只看会删什么，不真删
   ```
2. **卸载前先预览**：
   ```bash
   pkg delete -n <包名>     # 看会连带删掉什么
   ```
3. 看到大批量要删的包时，先怀疑是不是误伤，别直接 -y。

### 恢复
```bash
pkg install -y gnome        # 重新装回完整桌面（约 380 个依赖包，几分钟）
```
配置（rc.conf、中文 locale、动画设置等）都在 `/etc/rc.conf`、`/etc/login.conf`、dconf 里，不会因重装丢失。

---

## 五、附带清理

```bash
# pkg 下载缓存
pkg clean -a -y

# 用户缓存
rm -rf /root/.cache/*
```

---

## 核心速查

```bash
sysctl kern.coredump               # 查 core dump 状态（0=关）
echo "kern.coredump=0" >> /etc/sysctl.conf && sysctl kern.coredump=0  # 禁用
pkg delete -n <包>                 # 卸载预览
pkg autoremove -n                  # 孤儿清理预览
pkg install -y gnome               # 全家桶重装
pkg clean -a -y                    # 清包缓存
```