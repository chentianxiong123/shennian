---
title: 'Lenovo Lucienne (5500U) 单 GPU 直通记录'
date: 2026-07-19
---

# Lenovo Lucienne (5500U) 单 GPU 直通记录

## 硬件
- 笔记本: Lenovo
- CPU: AMD Ryzen 5 5500U (Lucienne, Zen 2)
- GPU: AMD Radeon Graphics (1002:164c), 仅此一张 GPU
- 存储: NVMe (Samsung)
- Host OS: Debian 13 / Kernel 6.12.95

## IOMMU 分组
IOMMU Group 5 包含全部 9 个设备（需整体直通）:
- 04:00.0 — VGA (GPU)
- 04:00.1 — Audio (HDMI)
- 04:00.2 — Encryption (PSP)
- 04:00.3 — USB
- 04:00.4 — USB
- 04:00.5 — Audio Coprocessor
- 04:00.6 — HD Audio
- 05:00.0 — SATA
- 05:00.1 — SATA

## 成果 (2026-07-19)

### 手动掉绑回绑测试成功

**关键验证**: amdgpu 可以干净地卸载并重新加载，没有 error -22。

测试步骤（SSH 执行）:
1. systemctl stop sddm
2. echo 0 > /sys/class/vtconsole/vtcon0/bind
3. echo 0 > /sys/class/vtconsole/vtcon1/bind
4. echo efi-framebuffer.0 > /sys/bus/platform/drivers/efi-framebuffer/unbind
5. echo simple-framebuffer.0 > /sys/bus/platform/drivers/simple-framebuffer/unbind
6. modprobe -r amdgpu → 成功
7. modprobe amdgpu → 成功，fb0 创建，无 error -22
8. echo 1 > /sys/class/vtconsole/vtcon0/bind
9. echo 1 > /sys/class/vtconsole/vtcon1/bind
10. systemctl start sddm → 屏幕恢复

结论: 之前 VM 直通后的 error -22 不是 VBIOS 问题，是脚本不完整（缺 vtconsole/efifb 解绑）。

## 当前配置

### Hook 脚本
/etc/libvirt/hooks/qemu → 分发器，调用 /bin/vfio-startup.sh / vfio-teardown.sh

### GRUB
GRUB_CMDLINE_LINUX_DEFAULT="quiet amd_iommu=on iommu=pt pcie_acs_override=downstream,multifunction initcall_blacklist=sysfb_init"

### VBIOS 文件
- /usr/share/vgabios/vbios.bin — 55KB, 113-LUCIENNE-016 (Lenovo OEM, 本机提取)
- /usr/share/vgabios/vbios_5500U.bin — 55KB, 113-LUCIENNE-019 (isc30 通用)
- /usr/share/vgabios/AMDGopDriver_5500U.rom — 74KB GOP 驱动

VM XML 当前使用: vbios.bin（OEM 版）

### VM 配置
- 名称: win11, pc-q35-10.0, OVMF UEFI + Secure Boot
- CPU: host-passthrough, 12 vCPU, 4GB RAM
- 直通: IOMMU group 5 全部 9 个设备 (managed='yes')
  - 04:00.0 GPU + romfile=vbios.bin
  - 04:00.1 Audio + romfile=AMDGopDriver_5500U.rom
  - 04:00.2-6 + 05:00.0-1 无 ROM

### vendor-reset
- gnif/vendor-reset, 添加 0x164c 到 AMD_NAVI10, DKMS 安装
- udev: reset_method=device_specific
- /etc/modules: vendor_reset

## 待办
1. [ ] 重启以应用 GRUB initcall_blacklist 参数
2. [ ] 启动 VM 测试完整直通（SSH 管理）
3. [ ] VM 停止后验证屏幕恢复
4. [ ] 如 Error 43: 添加 hypervisor 隐藏 args
