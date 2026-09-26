---
title: 'ZTE B860AV1.1-T2 工作记录'
date: 2026-07-27
---

# ZTE B860AV1.1-T2 工作记录

## 2026-07-27 清理 home 目录污染文件

### 背景
工作站 `/home/a1/` 被 ZTE 盒子的文件污染（1970年1月1日时间戳），是之前 adb push/rootfs 操作时意外带入的。

### 已移入回收站的文件（23个）
路径：`/home/a1/.trash/`

**init 相关：** init, init.rc, init.zxic.rc, init.environ.rc, init.product.rc, init.trace.rc, init.usb.rc, initlogo.rle

**SELinux/属性：** default.prop, fstab.zxic, file_contexts, property_contexts, seapp_contexts, sepolicy

**ueventd/ZTE配置：** ueventd.rc, ueventd.zxic.rc, zte_init.rc, zte_middleware.rc

**空目录：** data/, dev/, proc/, sys/, system/

### 保留的文件
- boot/mali.ko - GPU驱动
- sbin/ - adbd, healthd, hostapd_7601, iwconfig, iwlist, wpa_supplicant_7601
- sh/, usr/ - 用户脚本和bin
- easytier-linux-x86_64/, HiTool/, zte_b860_docs/

### 恢复方法
mv /home/a1/.trash/* /home/a1/

---

## 当前设备状态

### 问题
system 分区缺失 5 个关键 .so：libc.so, libcrypto.so, libcorkscrew.so, libbinder.so, libkeystore_binder.so
系统无法正常启动，卡在 CANNOT LINK EXECU 循环。

### 修复计划
将 OTA.zip (247MB) 写入 cache 分区 (ext4, 768MB)，safe 进 recovery 刷机。

### TFTP 传输参数
- 块大小：5MB (5242880 字节 = 10240 扇区 = 0x2800)
- cache 分区起始扇区：0x3C000
- U-Boot: tftpboot 0x48000000 c_xx → mmc write 0x48000000 <扇区> 0x2800

### 关键教训
1. 不要盲目删 .so 文件 - 误删 libkeystore_binder.so 导致系统无法启动
2. TFTP 5MB 是稳定上限，需分块
3. U-Boot source 不支持纯文本脚本
4. ext4 镜像 mkfs 参数需与原始分区一致
