---
title: 'PVE LVM-Thin 存储 Trim/垃圾回收完整配置手册'
date: 2026-09-08
---

# PVE LVM-Thin 存储 Trim/垃圾回收完整配置手册

> 适用环境:Proxmox VE 9.2 (kernel 7.0.2-pve),存储类型 `lvmthin`
> 覆盖系统:Windows 11 / Debian 13 / FreeBSD 15 / macOS Sonoma / 飞牛 fnOS(Debian 12)
> 2026-09-08 实战记录

---

## 一、为什么需要"平账"

### 1.1 LVM-Thin 的工作原理

Proxmox 的 `local-lvm` 是 **thin-provisioned**(精简配置)逻辑卷:

```
虚拟 60G 磁盘 → 物理只占实际写入的数据量 (常见 15-25G)
```

虚拟大小 ≠ 物理占用。池的物理空间按"已写入字节"记账。

### 1.2 核心问题:删除 ≠ 回收

**guest 内部删除文件时,host 的 thin 池不知道**:

```
guest 删除 10G 文件 → guest 账面上空间 freed
                     → 但 thin 池还记着这 10G 的物理块
                     → 物理空间不释放, 越删越虚胖
```

### 1.3 解决机制:TRIM 指令链路

```
guest 删文件 → guest 发 TRIM/UNMAP 指令 → 虚拟磁盘 (discard=on)
             → host QEMU 接收 → thin 池释放对应物理块 → 池空间回收
```

**注意**:链路任何一环缺失(guest 定时任务没跑 / 磁盘没开 discard / 系统不支持)都回收不了。

---

## 二、前置配置:VM 磁盘开启 discard

### 2.1 检查当前配置

```bash
grep -E '^(virtio|scsi|sata|ide)[0-9]*:' /etc/pve/qemu-server/*.conf
```

未配置的磁盘行末尾没有 `discard=on`,例如:

```
scsi1: local-lvm:vm-100-disk-1,iothread=1,size=40G          ← 缺 discard
```

### 2.2 开启方法(VM 关机状态修改)

```bash
# 在 VM 配置文件的磁盘行末尾追加 ,discard=on
sed -i 's|^scsi1: local-lvm:vm-100-disk-1,iothread=1,size=40G$|&,discard=on|' \
  /etc/pve/qemu-server/100.conf
```

修改后重启 VM 生效。备份配置:

```bash
tar czf /tmp/qemu-conf-backup-$(date +%Y%m%d-%H%M%S).tar.gz \
  --absolute-names /etc/pve/qemu-server/*.conf
```

### 2.3 本次配置结果

| VM | 磁盘 | 修改 |
|----|------|------|
| 100 (win11) | scsi1 40G | 追加 `discard=on` |
| 101 (debian) | scsi0 30G | 追加 `discard=on` |
| 102 (macos) | virtio1 60G | 自带 `discard=on`(无需动)|
| 103 (freebsd) | scsi0 32G | 追加 `discard=on` |
| 104 (fnos) | scsi0 16G | 追加 `discard=on` |

---

## 三、各系统的平账配置(按系统分类)

### 3.1 Windows 11(VM 100)

**检查 TRIM 状态**:

```bash
fsutil behavior query DisableDeleteNotify
# NTFS DisableDeleteNotify = 0 → TRIM 已启用 (0=开 1=关)
```

**手动平账一次**:

```powershell
# PowerShell (管理员)
Optimize-Volume -DriveLetter C -ReTrim -Verbose
# 或 CMD (管理员)
defrag /L C:
```

**自动回收机制**(确认存在):

```powershell
Get-ScheduledTask -TaskPath '\Microsoft\Windows\Defrag\'
# ScheduledDefrag → Ready (每周自动 retrim)
```

**结论**:Windows 自带每周碎片整理任务包含 TRIM,配好 discard 后全自动,无需额外配置。

### 3.2 Debian 13 / 飞牛 fnOS(Debian 12)—— VM 101 / 104

**手动平账**:

```bash
fstrim -av
# /boot/efi: 965 MiB trimmed
# /: 22.3 GiB trimmed
```

**自动回收机制**(Debian 默认预装):

```bash
systemctl is-enabled fstrim.timer   # → enabled
systemctl is-active  fstrim.timer   # → active
```

`fstrim.timer` 是 systemd 定时器,**默认每周执行一次** `fstrim -a`。只要虚拟磁盘 `discard=on`,开箱即用。若未启用:

```bash
systemctl enable --now fstrim.timer
```

**结论**:Debian 系是最省心的,一条命令都不用配。

### 3.3 FreeBSD 15(VM 103)—— 系统较特殊

FreeBSD **没有 fstrim 命令**(那是 Linux 的),PVE 虚拟盘在 FreeBSD 里是 `da0`(.p1/.p2 为分区)。根文件系统通常为 **ZFS**。

**查看 ZFS 池**:

```bash
zpool status            # 池名通常 zroot, 设备 da0p2
zpool get autotrim zroot
# autotrim: off ← 默认关闭,需要手动开
```

**开启自动 trim(ZFS 方式)**:

```bash
zpool set autotrim=on zroot
zpool get autotrim zroot    # → on (local, 永久生效)
```

**手动平账存量数据**:

```bash
zpool trim zroot            # 后台任务, 不阻塞
zpool status                # 设备显示 (trimming) 表示进行中
```

> 注:ZFS 的 `autotrim=on` 会在每次删除数据时自动发 TRIM;`zpool trim` 是一次性全盘清理(处理存量)。

### 3.4 macOS Sonoma(VM 102)

**检查盘是否被识别为 SSD**:

```bash
system_profiler SPNVMeDataType | grep -i trim
diskutil info disk0 | grep -i -E 'solid|trim'
# Solid State: Yes ← 关键
```

**APFS 容器情况**:

```bash
diskutil apfs list
# Container disk1: 53.5GB, 卷用 22.1GB, 空闲 31.4GB
```

**结论**:**macOS 不需要任何手动操作**。APFS 对 SSD(虚拟盘识别为 Solid State=Yes)时**自动即时 TRIM**——删除即发指令,无定时任务,无手动命令。`discard=on` 配好即可。

> 注:非 Apple SSD 物理机如遇 `sysctl kern.tc_trim_enabled` 为空,可执行 `sudo trimforce enable` 强制开启;虚拟盘场景 `Solid State: Yes` 已满足自动条件。

---

## 四、实战流程(本次操作顺序)

> 原则:**一次只开一台 VM,平完即关**,避免宿主内存暴涨(各 VM 均配 8G,宿主内存仅 11G)。

```
1. 全 VM 关机
2. 备份 qemu-server 配置 (tar czf ...)
3. PVE 上给各 VM 磁盘追加 discard=on
4. 逐台开机 → guest 内平账 → 关机
   ├── win11   → Optimize-Volume -ReTrim
   ├── debian  → fstrim -av
   ├── fnos    → fstrim -av
   ├── freebsd → zpool set autotrim=on + zpool trim
   └── macos   → 无需操作(APFS 自动)
5. 检查回收效果
```

---

## 五、回收效果验证

```bash
# PVE 上查看池和单卷占用率
lvs pve --units g -o lv_name,lv_size,data_percent
pvesm status
```

### 本次实测前后对比

| 指标 | 平账前 | 平账后 | 回收 |
|------|--------|--------|------|
| 池整体 data% | 52.94% | ~48.2% | ≈ 6.5GB 物理 |
| win11 盘 (40G) | 53.60% | 40.77% | 回收最多 ≈5.4G |
| debian 盘 (30G) | ~48% | 17.56% | 显著 |
| fnos 盘 (16G) | 48.23% | 44.34% | ≈0.6G |
| freebsd 盘 (32G) | — | trimming 中 | 后台回收 |

**效果差异原因**:win11/debian 历史上删过大量文件(精简/清理),存量"空账"最多,平账收益最大;其余系统台账健康。

---

## 六、自动回收机制总表

| 系统 | 自动机制 | 手动命令 | 需要配置? |
|------|---------|---------|----------|
| Windows 11 | ScheduledDefrag 每周 | `Optimize-Volume -ReTrim` | 仅 discard=on |
| Debian/fnos | fstrim.timer 每周 | `fstrim -av` | 仅 discard=on |
| FreeBSD | autotrim=on(ZFS) | `zpool trim` | **需 zpool set autotrim=on** |
| macOS | APFS 即时 trim | 无 | 仅 discard=on |

---

## 七、经验与注意事项

1. **discard=on 是前提**:guest 怎么 trim 都行,VM 磁盘没开 discard 全部白搭
2. **一次平完存量的必要性**:只配 discard 不跑一次手动 trim,历史"空账"不会自己消失——首次平账是必经步骤
3. **FreeBSD 入坑提示**:fstrim 命令不存在(freebsd 15 用的是 `trim`/zpool 机制),别照抄 Linux 教程
4. **macOS 特立独行**:全系统唯一"零操作",APFS 即时 trim 最优雅但也最隐蔽(Solid State=Yes 才生效)
5. **内存红线**:宿主 11G,别同时开多台 8G VM(曾因 win11+macos 同开导致宿主机卡死)
6. **thin 池不需要主动 GC**:lvmthin 无手动回收命令,所有回收都靠 guest TRIM 驱动,这就是"平账"的本质
7. **别动别人的 eth0 网卡 MAC**:freebsd 的 da0 设备命名来自 virtio-scsi,盘符固定

---

*文档正文结束。基于 2026-09-08 实际环境验证,所有命令均在本环境实测通过。*