---
title: 'Hi3798MV100 机顶盒刷机记录：TFTP + HiTool 完整过程'
date: 2026-07-20
---

# Hi3798MV100 机顶盒刷机记录：TFTP + HiTool 完整过程

> 设备：华为海思 Hi3798MV100 机顶盒
> 时间：2026-07-20
> 工具：HiTool (Wine) + TFTP + U-Boot 串口

---

## 一、背景

原厂固件 1.7GB rootfs，精简后需要重新分区以获得更多可用空间。目标是砍掉不需要的分区（logo、recovery、backup），把空间全部给 rootfs。

---

## 二、新分区表设计

### 2.1 原始分区表

```
blkdevparts=mmcblk0:1M(boot),1M(bootargs),4M(baseparam),4M(pqparam),4M(logo),20M(kernel),64M(busybox),512M(backup),-(ubuntu)
```

| 分区 | 起始 | 大小 | 用途 |
|------|------|------|------|
| boot | 0M | 1M | fastboot |
| bootargs | 1M | 1M | 环境变量 |
| baseparam | 2M | 4M | 海思参数表 |
| pqparam | 6M | 4M | 画质参数 |
| logo | 10M | 4M | 开机logo |
| kernel | 14M | 20M | 内核 |
| busybox | 34M | 64M | recovery |
| backup | 98M | 512M | 备份 |
| ubuntu | 610M | 剩余 | rootfs |

### 2.2 新分区表

```
blkdevparts=mmcblk0:1M(boot),1M(bootargs),4M(baseparam),4M(pqparam),12M(kernel),-(rootfs)
```

| 分区 | 起始 | 大小 | 变化 |
|------|------|------|------|
| boot | 0M | 1M | 不变 |
| bootargs | 1M | 1M | 不变 |
| baseparam | 2M | 4M | 不变 |
| pqparam | 6M | 4M | 不变 |
| kernel | 10M | 12M | 前移4M，缩8M |
| rootfs | 22M | 剩余 | 多了588M |

### 2.3 砍掉的分区

| 分区 | 大小 | 原因 |
|------|------|------|
| logo | 4M | 不需要开机logo |
| busybox/recovery | 64M | 不需要recovery模式 |
| backup | 512M | 不需要备份分区 |

**总共给 rootfs 多了 588M。**

---

## 三、刷机过程

### 3.1 准备工作

1. HiTool 安装在 Wine 下（详见 `HiTool_Wine_折腾记录.md`）
2. 备份文件放在 USB 盘 `/media/a1/shared/`：
   - `emmc_TTL-hi3798mv100-32-new.xml` — 新分区表
   - `hi_kernel-mv100-32.bin` — 2025新版内核 (10.3MB)
   - `rootfs.img` — 精简后的 rootfs (900MB)
3. TFTP 服务需要端口 69

### 3.2 HiTool 启动问题：TFTP 端口 69 被占

**现象：** HiTool 报错 `TFTP服务器启动失败，端口69可能被占用！`

**原因：** 之前装的 `tftpd-hpa` 占用了端口 69。

**解决：**
```bash
sudo systemctl stop tftpd-hpa
sudo systemctl disable tftpd-hpa
```

**但还是不行！** 端口 69 已经空了，HiTool 仍然无法绑定。

**真正原因：** Wine 普通用户无法绑定 1024 以下的特权端口。TFTP 标准端口 69 是特权端口。

**最终解决：**
```bash
sudo setcap cap_net_bind_service+ep /usr/lib/wine/wineserver32
sudo setcap cap_net_bind_service+ep /usr/lib/wine/wineserver64
```

重启 wineserver 后 HiTool 的内置 TFTP 服务器正常启动。

### 3.3 HiTool 刷写

HiTool 通过串口连接盒子，TFTP 传输文件，自动完成刷写。

刷写顺序：
1. fastboot（1M）
2. bootargs（1M）
3. baseparam（4M）
4. pqparam（4M）
5. kernel（12M）
6. rootfs（剩余全部）

### 3.4 刷写后启动失败

**现象：**
```
MMC read: dev # 0, block # 28672, count 40960 ... 40960 blocks read: OK
Wrong Image Format for bootm command
ERROR: can't get kernel image!
```

**原因：** `bootcmd` 还在读老位置（block 28672 = 14M），但新分区表内核在 10M（block 20480）。

**解决：** 在 U-Boot 串口里修改 bootcmd：
```
setenv bootcmd "mmc read 0 0x1FFFFC0 0x5000 0xA000;bootm 0x1FFFFC0"
saveenv
reset
```

其中 `0x5000` = 20480 blocks = 10M 偏移。

---

## 四、内核版本对比

刷机时选择了更新的内核：

| 项目 | 老内核 (kernel.img) | 新内核 (hi_kernel-mv100-32.bin) |
|------|---------------------|--------------------------------|
| 版本 | 4.4.35_ecoo_81092768 | 4.4.35_ecoo_81082668 |
| 编译时间 | 2022-09-27 | 2025-08-26 |
| 实际大小 | 8.7MB（填充到20MB） | 10.3MB（无填充） |
| 压缩 | 无 | 无 |

---

## 五、踩坑记录

### 坑1：mmc write 参数被 U-Boot 内部转换

```
输入：mmc write 0 0x1000000 45056 204800
实际：block # 282710, count 2115584
```

U-Boot 的 `mmc read/write` 命令会对 block 参数做内部转换（可能和 erase group 对齐有关），显示的 block 号和我们输入的不一致。但 **CRC 校验通过**，说明数据确实写对了。

**结论：** 显示的 block 号不可信，但只要 CRC 一致就是对的。

### 坑2：mmc read 输出二进制数据淹没串口

执行 `mmc read` 读回大量数据时，二进制内容直接输出到串口，导致终端混乱、无法操作。

**解决：** 不要通过串口读回大块数据验证，用 `crc32` 命令对比内存和 eMMC 的校验值即可。

### 坑3：串口终端卡死

mmc read 的二进制数据淹没串口后，终端无法恢复。

**解决：** `fuser -k /dev/ttyUSB0` 杀掉占用进程，重新打开串口。

### 坑4：内核分区大小

曾尝试将内核从 20M 缩到 16M，但实际检测发现：
- `kernel.img` 文件 20MB 全是有效数据，没有零填充
- `hi_kernel-mv100-32.bin` 10.3MB 也是全有效数据
- **内核不能压缩到12M以下**（新内核10.3MB + 头部 ≈ 10.4MB，12M留了余量）

最终选择12M，够用但不浪费。

### 坑5：bootcmd 和 blkdevparts 是分开的

改了 `blkdevparts`（分区表定义）不等于改了 `bootcmd`（启动命令）。`bootcmd` 里的 `mmc read` 偏移量需要手动同步修改，否则内核读不到。

---

## 六、最终环境变量

```
baudrate=115200
ipaddr=192.168.1.10
netmask=255.255.255.0
gatewayip=192.168.1.1
serverip=192.168.1.1
bootcmd=mmc read 0 0x1FFFFC0 0x5000 0xA000;bootm 0x1FFFFC0
bootargs=model=mv100 console=ttyAMA0,115200 root=/dev/mmcblk0p6 rootfstype=ext4 rootwait blkdevparts=mmcblk0:1M(boot),1M(bootargs),4M(baseparam),4M(pqparam),12M(kernel),-(rootfs)
bootdelay=0
ethaddr=F2:78:C0:6A:83:EC
```

关键变化：
- `bootcmd`: `0x7000` → `0x5000`（内核偏移从14M改到10M）
- `bootargs`: `root=/dev/mmcblk0p9` → `root=/dev/mmcblk0p6`（rootfs从第9分区变第6分区）
- `blkdevparts`: 新分区表（12M kernel，无 logo/busybox/backup）

---

## 七、刷机后验证

```
系统: Ubuntu 20.04.6 LTS
内核: 4.4.35_ecoo_81082668 (2025新版)
内存: 969MB，已用76MB
磁盘: 870MB rootfs，已用741MB，剩69MB
网络: WiFi 192.168.31.82
串口: /dev/ttyAMA0 (115200)
```

全部正常，刷机成功。

---

## 八、关键命令速查

### U-Boot 串口命令

```bash
# 查看环境变量
printenv

# 修改分区表
setenv bootargs "model=mv100 console=ttyAMA0,115200 root=/dev/mmcblk0p6 rootfstype=ext4 rootwait blkdevparts=mmcblk0:1M(boot),1M(bootargs),4M(baseparam),4M(pqparam),12M(kernel),-(rootfs)"
saveenv

# 修改启动命令（内核偏移）
setenv bootcmd "mmc read 0 0x1FFFFC0 0x5000 0xA000;bootm 0x1FFFFC0"
saveenv

# TFTP 下载
tftp 0x1000000 filename

# 写 eMMC
mmc write 0 <addr> <blk#> <cnt>

# 校验
crc32 <addr> <size>
```

### Linux 主机命令

```bash
# 串口连接
screen /dev/ttyUSB0 115200

# 杀串口进程
fuser -k /dev/ttyUSB0

# 给 Wine 加端口权限
sudo setcap cap_net_bind_service+ep /usr/lib/wine/wineserver32
sudo setcap cap_net_bind_service+ep /usr/lib/wine/wineserver64
```

---

*2026-07-20 刷机完成，新分区表+新内核全部生效。*
